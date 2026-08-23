import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { db, debtsTable, expensesTable, incomesTable, profileTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getMarketContext, type MarketContext } from "../services/marketData";

const router = Router();
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
const GEMINI_WORDING_TIMEOUT_MS = 4_500;

const CATEGORY_ALIASES: Record<string, string> = {
  housing: "housing", жилье: "housing", жильё: "housing", аренда: "housing",
  food: "food", еда: "food", питание: "food", продукты: "food",
  transport: "transport", транспорт: "transport", бензин: "transport", такси: "transport",
  utilities: "utilities", коммуналка: "utilities", связь: "utilities",
  health: "health", здоровье: "health", лекарства: "health",
  miscellaneous: "miscellaneous", разное: "miscellaneous",
  clothes: "miscellaneous", одежда: "miscellaneous", shopping: "miscellaneous",
};

type Verdict = "YES" | "NO" | "PARTIAL";

interface PurchaseContext {
  query: string;
  requestedAmount: number;
  requestedCategory: string;
  categoryLabel: string;
  liquidity: number;
  upcomingObligations: number;
  fixedBills: number;
  debtObligations: number;
  categoryActual: number;
  categoryBudget: number;
  plannedIncome: number;
  plannedIncomeEntries: Array<{ source: string; amount: number; month: string }>;
  safeToSpendNow: number;
  earliestIncomeMonth: string | null;
  safetyReserveTarget: number;
  riskBandAvailable: number;
  postPurchaseCoreReserve: number;
  barbellSafetyViolation: boolean;
  inflationRateAnnual: number | null;
  inflationAdjustedCostOfWaiting: number | null;
  waitingMonths: number;
  marginOfSafety: number;
  marketDataStatus: MarketContext["status"];
  marketDataFetchedAt: string | null;
}

interface PurchaseCheckResult {
  verdict: Verdict;
  partialAmount: number | null;
  reasoning: string;
  barbellCheck: string;
  inflationAssessment: string;
  action: string;
  responseText: string;
  context: Omit<PurchaseContext, "query">;
  isFallback: boolean;
}

const fmtSom = (value: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(value)) + " сом";

const roundAmount = (value: number) => Math.max(0, Math.round(value));

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function addMonths(month: string, count: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

function monthsBetween(start: string, end: string) {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  return Math.max(1, (endYear - startYear) * 12 + endMonth - startMonth);
}

function extractAmount(query: string): number | null {
  const matches = query.match(/(?:^|[^\d])(\d[\d\s.,]*)(?:\s*(?:сом|с|kgs?|кгс)?\b|$)/iu);
  if (!matches?.[1]) return null;
  const normalized = matches[1].replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function detectCategory(query: string) {
  const normalized = query.toLowerCase();
  const alias = Object.keys(CATEGORY_ALIASES).find((key) => normalized.includes(key));
  const category = alias ? CATEGORY_ALIASES[alias] : "miscellaneous";
  const labels: Record<string, string> = {
    housing: "жильё", food: "питание", transport: "транспорт",
    utilities: "коммунальные расходы", health: "здоровье", miscellaneous: "разные траты",
  };
  return { category, label: labels[category] ?? category };
}

function isWithinNext30Days(value: string) {
  const due = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(due.getTime())) return true;
  const now = Date.now();
  const thirtyDays = now + 30 * 24 * 60 * 60 * 1000;
  return due.getTime() >= now - 24 * 60 * 60 * 1000 && due.getTime() <= thirtyDays;
}

function wordLimit(value: string, maxWords: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? value.trim() : `${words.slice(0, maxWords).join(" ")}…`;
}

function formatResponse(
  verdict: Verdict,
  partialAmount: number | null,
  barbellCheck: string,
  inflationAssessment: string,
  action: string,
) {
  const verdictText = verdict === "PARTIAL" ? `PARTIAL (${fmtSom(partialAmount ?? 0)})` : verdict;
  return [
    `Вердикт: ${verdictText}`,
    `Проверка Barbell: ${wordLimit(barbellCheck, 17)}`,
    `Инфляция и запас: ${wordLimit(inflationAssessment, 21)}`,
    `Действие: ${wordLimit(action, 24)}`,
  ].join("\n");
}

async function gatherContext(query: string, ownerId: string): Promise<PurchaseContext> {
  const [profiles, expenses, debts, incomes, market] = await Promise.all([
    db.select().from(profileTable).where(eq(profileTable.ownerId, ownerId)).limit(1),
    db.select().from(expensesTable).where(eq(expensesTable.ownerId, ownerId)),
    db.select().from(debtsTable).where(eq(debtsTable.ownerId, ownerId)),
    db.select().from(incomesTable).where(eq(incomesTable.ownerId, ownerId)),
    getMarketContext(),
  ]);
  const profile = profiles[0];
  const month = currentMonth();
  const nextMonth = addMonths(month, 1);
  const { category, label } = detectCategory(query);
  const requestedAmount = extractAmount(query);
  if (requestedAmount === null) {
    throw new Error("Укажите сумму покупки, например: «Хочу купить одежду за 10 000 сом».");
  }

  const categoryExpenses = expenses.filter((expense) => expense.category === category);
  const categoryActual = categoryExpenses
    .filter((expense) => expense.createdAt.toISOString().slice(0, 7) === month)
    .reduce((sum, expense) => sum + expense.amount, 0);
  // The current product's expense records are monthly planned entries. Until
  // a separate transaction ledger exists, they are the safest budget baseline.
  const categoryBudget = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const fixedBills = expenses.filter((expense) => expense.isEssential).reduce((sum, expense) => sum + expense.amount, 0);
  const debtObligations = debts
    .filter((debt) => isWithinNext30Days(debt.dueDate))
    .reduce((sum, debt) => sum + debt.monthlyPayment, 0);
  const upcomingObligations = fixedBills + debtObligations;
  const plannedIncomeEntries = incomes
    .filter((income) => income.month >= month && income.month <= nextMonth && (income.actualAmount ?? 0) < income.projectedAmount)
    .map((income) => ({
      source: income.source,
      amount: Math.max(0, income.projectedAmount - (income.actualAmount ?? 0)),
      month: income.month,
    }));
  const plannedIncome = plannedIncomeEntries.reduce((sum, income) => sum + income.amount, 0);
  const liquidity = Math.max(0, profile?.currentSavings ?? 0);
  const minimumReserve = Math.max(fixedBills, debtObligations);
  const safetyReserveTarget = liquidity * 0.8;
  const riskBandAvailable = liquidity * 0.2;
  const postPurchaseCoreReserve = Math.max(0, liquidity - requestedAmount);
  const barbellSafetyViolation = liquidity > 0
    ? postPurchaseCoreReserve < safetyReserveTarget
    : requestedAmount > 0;
  const inflationRateAnnual = market.inflationAnnualPercent;
  const waitingMonths = plannedIncomeEntries[0]
    ? monthsBetween(month, plannedIncomeEntries[0].month)
    : 1;
  const inflationAdjustedCostOfWaiting = inflationRateAnnual === null
    ? null
    : requestedAmount * (Math.pow(1 + inflationRateAnnual / 100, waitingMonths / 12) - 1);
  const safeToSpendNow = Math.max(
    0,
    Math.min(liquidity - upcomingObligations - minimumReserve, riskBandAvailable),
  );
  const marginOfSafety = Math.max(0, safeToSpendNow - requestedAmount);

  return {
    query,
    requestedAmount,
    requestedCategory: category,
    categoryLabel: label,
    liquidity,
    upcomingObligations,
    fixedBills,
    debtObligations,
    categoryActual,
    categoryBudget,
    plannedIncome,
    plannedIncomeEntries,
    safeToSpendNow,
    earliestIncomeMonth: plannedIncomeEntries[0]?.month ?? null,
    safetyReserveTarget,
    riskBandAvailable,
    postPurchaseCoreReserve,
    barbellSafetyViolation,
    inflationRateAnnual,
    inflationAdjustedCostOfWaiting,
    waitingMonths,
    marginOfSafety,
    marketDataStatus: market.status,
    marketDataFetchedAt: market.fetchedAt,
  };
}

function deterministicAdvice(context: PurchaseContext) {
  const safe = roundAmount(context.safeToSpendNow);
  const requested = roundAmount(context.requestedAmount);
  const barbellCheck = context.barbellSafetyViolation
    ? `BARBELL SAFETY VIOLATION: покупка оставит менее 80% ликвидности в защищённом резерве.`
    : `Barbell соблюдён: после покупки защищённый резерв останется не ниже 80% ликвидности.`;
  const inflationAssessment = context.inflationRateAnnual === null
    ? "Инфляционные данные временно недоступны; решение опирается на денежный резерв."
    : `Инфляция ${context.inflationRateAnnual.toFixed(1)}% годовых; ожидание на ${context.waitingMonths} мес. добавит около ${fmtSom(context.inflationAdjustedCostOfWaiting ?? 0)}.`;
  if (requested <= safe) {
    return {
      verdict: "YES" as const,
      partialAmount: null,
      reasoning: inflationAssessment,
      barbellCheck,
      inflationAssessment,
      action: "Покупка безопасна сейчас, если сумма не вырастет и новых обязательств не появится.",
    };
  }
  if (safe > 0) {
    return {
      verdict: "PARTIAL" as const,
      partialAmount: safe,
      reasoning: inflationAssessment,
      barbellCheck,
      inflationAssessment,
      action: `Сейчас безопасно потратить не больше ${fmtSom(safe)}; остальное — после ближайшего запланированного дохода.`,
    };
  }
  const timeline = context.earliestIncomeMonth
    ? `Пересмотрите покупку после запланированного дохода в ${context.earliestIncomeMonth}.`
    : "Сначала сформируйте резерв после оплаты ближайших обязательств.";
  return {
    verdict: "NO" as const,
    partialAmount: null,
    reasoning: inflationAssessment,
    barbellCheck,
    inflationAssessment,
    action: timeline,
  };
}

async function askGemini(context: PurchaseContext, safeAdvice: ReturnType<typeof deterministicAdvice>) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const systemInstruction = `Ты — финансовый советник. Отвечай ясно, кратко, прямо и поддерживающе, без морализаторства. Безопасность важнее желания купить.
Вердикт уже рассчитан системой и НЕ МОЖЕТ быть изменён: ${safeAdvice.verdict}${safeAdvice.partialAmount ? ` (${fmtSom(safeAdvice.partialAmount)})` : ""}.
Ответ должен быть на русском языке, строго JSON без markdown:
{"barbellCheck":"ровно одно предложение о защищённом резерве и нарушении/соблюдении Barbell","inflationAssessment":"1-2 коротких предложения с инфляцией, стоимостью ожидания и запасом","action":"ровно один конкретный шаг или срок"}
Весь итоговый текст после форматирования обязан быть короче 80 слов. Не придумывай данные и не давай инвестиционных советов.`;
  const userPrompt = `ПРОВЕРКА ПОКУПКИ:
Запрос пользователя: <<<${context.query}>>>
Сумма: ${fmtSom(context.requestedAmount)}
Категория: ${context.categoryLabel}
Ликвидность/деньги на руках: ${fmtSom(context.liquidity)}
Защищённый резерв 80%: ${fmtSom(context.safetyReserveTarget)}
Доступная риск-зона 20%: ${fmtSom(context.riskBandAvailable)}
Резерв после покупки: ${fmtSom(context.postPurchaseCoreReserve)}
Нарушение Barbell: ${context.barbellSafetyViolation ? "ДА" : "НЕТ"}
Обязательные счета на ближайшие 30 дней: ${fmtSom(context.fixedBills)}
Долговые обязательства на ближайшие 30 дней: ${fmtSom(context.debtObligations)}
Всего обязательств: ${fmtSom(context.upcomingObligations)}
Траты категории в текущем месяце: ${fmtSom(context.categoryActual)}
План категории: ${fmtSom(context.categoryBudget)}
Запланированный будущий доход: ${fmtSom(context.plannedIncome)}
Безопасно потратить сейчас: ${fmtSom(context.safeToSpendNow)}
Инфляция: ${context.inflationRateAnnual === null ? "нет данных" : `${context.inflationRateAnnual.toFixed(1)}% годовых`}
Стоимость ожидания: ${context.inflationAdjustedCostOfWaiting === null ? "нет данных" : fmtSom(context.inflationAdjustedCostOfWaiting)}
Сформулируй только barbellCheck, inflationAssessment и action.`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = genai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: { systemInstruction, temperature: 0.2, responseMimeType: "application/json" },
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Gemini wording timeout")), GEMINI_WORDING_TIMEOUT_MS);
  });
  const response = await Promise.race([request, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
  const clean = (response.text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(clean) as { barbellCheck?: unknown; inflationAssessment?: unknown; action?: unknown };
  if (typeof parsed.barbellCheck !== "string" || typeof parsed.inflationAssessment !== "string" || typeof parsed.action !== "string") {
    throw new Error("Gemini returned an invalid purchase-check shape");
  }
  return {
    reasoning: parsed.inflationAssessment,
    barbellCheck: parsed.barbellCheck,
    inflationAssessment: parsed.inflationAssessment,
    action: parsed.action,
  };
}

export async function runPurchaseCheck(query: string, ownerId: string): Promise<PurchaseCheckResult> {
  const context = await gatherContext(query, ownerId);
  const safeAdvice = deterministicAdvice(context);
  let reasoning = safeAdvice.reasoning;
  let barbellCheck = safeAdvice.barbellCheck;
  let inflationAssessment = safeAdvice.inflationAssessment;
  let action = safeAdvice.action;
  let isFallback = true;
  try {
    const llmAdvice = await askGemini(context, safeAdvice);
    reasoning = llmAdvice.reasoning;
    barbellCheck = llmAdvice.barbellCheck;
    inflationAssessment = llmAdvice.inflationAssessment;
    action = llmAdvice.action;
    isFallback = false;
  } catch (error) {
    // The deterministic result remains the safety source of truth when the
    // model is unavailable, rate-limited, or returns malformed JSON.
    console.warn("Purchase advisor used deterministic fallback", error);
  }
  return {
    verdict: safeAdvice.verdict,
    partialAmount: safeAdvice.partialAmount,
    reasoning,
    barbellCheck,
    inflationAssessment,
    action,
    responseText: formatResponse(safeAdvice.verdict, safeAdvice.partialAmount, barbellCheck, inflationAssessment, action),
    context: {
      requestedAmount: context.requestedAmount,
      requestedCategory: context.requestedCategory,
      categoryLabel: context.categoryLabel,
      liquidity: context.liquidity,
      upcomingObligations: context.upcomingObligations,
      fixedBills: context.fixedBills,
      debtObligations: context.debtObligations,
      categoryActual: context.categoryActual,
      categoryBudget: context.categoryBudget,
      plannedIncome: context.plannedIncome,
      plannedIncomeEntries: context.plannedIncomeEntries,
      safeToSpendNow: context.safeToSpendNow,
      earliestIncomeMonth: context.earliestIncomeMonth,
      safetyReserveTarget: context.safetyReserveTarget,
      riskBandAvailable: context.riskBandAvailable,
      postPurchaseCoreReserve: context.postPurchaseCoreReserve,
      barbellSafetyViolation: context.barbellSafetyViolation,
      inflationRateAnnual: context.inflationRateAnnual,
      inflationAdjustedCostOfWaiting: context.inflationAdjustedCostOfWaiting,
      waitingMonths: context.waitingMonths,
      marginOfSafety: context.marginOfSafety,
      marketDataStatus: context.marketDataStatus,
      marketDataFetchedAt: context.marketDataFetchedAt,
    },
    isFallback,
  };
}

// POST /advisor/purchase-check
router.post("/advisor/purchase-check", async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  try {
    res.json(await runPurchaseCheck(query, req.user!.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check purchase";
    res.status(400).json({ error: message });
  }
});

export default router;