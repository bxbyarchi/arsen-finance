import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { db, debtsTable, expensesTable, incomesTable, profileTable } from "@workspace/db";

const router = Router();
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

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
  userId: number;
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
}

interface PurchaseCheckResult {
  verdict: Verdict;
  partialAmount: number | null;
  reasoning: string;
  action: string;
  responseText: string;
  context: Omit<PurchaseContext, "userId" | "query">;
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

function formatResponse(verdict: Verdict, partialAmount: number | null, reasoning: string, action: string) {
  const verdictText = verdict === "PARTIAL" ? `PARTIAL (${fmtSom(partialAmount ?? 0)})` : verdict;
  return [
    `Вердикт: ${verdictText}`,
    `Причина: ${wordLimit(reasoning, 29)}`,
    `Действие: ${wordLimit(action, 24)}`,
  ].join("\n");
}

async function gatherContext(query: string, userId: number): Promise<PurchaseContext> {
  const [profiles, expenses, debts, incomes] = await Promise.all([
    db.select().from(profileTable).limit(1),
    db.select().from(expensesTable),
    db.select().from(debtsTable),
    db.select().from(incomesTable),
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
  const safeToSpendNow = Math.max(0, liquidity - upcomingObligations - minimumReserve);

  return {
    userId,
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
  };
}

function deterministicAdvice(context: PurchaseContext) {
  const safe = roundAmount(context.safeToSpendNow);
  const requested = roundAmount(context.requestedAmount);
  if (requested <= safe) {
    return {
      verdict: "YES" as const,
      partialAmount: null,
      reasoning: `После покупки останется около ${fmtSom(context.liquidity - requested)} ликвидности; ближайшие обязательства уже учтены.`,
      action: "Покупка безопасна сейчас, если сумма не вырастет и новых обязательств не появится.",
    };
  }
  if (safe > 0) {
    return {
      verdict: "PARTIAL" as const,
      partialAmount: safe,
      reasoning: `Сумма ${fmtSom(requested)} выше безопасного лимита: после обязательств и минимального резерва не хватает ${fmtSom(requested - safe)}.`,
      action: `Сейчас безопасно потратить не больше ${fmtSom(safe)}; остальное — после ближайшего запланированного дохода.`,
    };
  }
  const timeline = context.earliestIncomeMonth
    ? `Пересмотрите покупку после запланированного дохода в ${context.earliestIncomeMonth}.`
    : "Сначала сформируйте резерв после оплаты ближайших обязательств.";
  return {
    verdict: "NO" as const,
    partialAmount: null,
    reasoning: `Покупка на ${fmtSom(requested)} уменьшит ликвидность ниже безопасного уровня: обязательства составляют ${fmtSom(context.upcomingObligations)}.`,
    action: timeline,
  };
}

async function askGemini(context: PurchaseContext, safeAdvice: ReturnType<typeof deterministicAdvice>) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const systemInstruction = `Ты — финансовый советник. Отвечай ясно, кратко, прямо и поддерживающе, без морализаторства. Безопасность важнее желания купить.
Вердикт уже рассчитан системой и НЕ МОЖЕТ быть изменён: ${safeAdvice.verdict}${safeAdvice.partialAmount ? ` (${fmtSom(safeAdvice.partialAmount)})` : ""}.
Ответ должен быть на русском языке, строго JSON без markdown:
{"reasoning":"1-2 коротких предложения о влиянии на денежный поток и резерв","action":"ровно один конкретный шаг или срок"}
Весь итоговый текст после форматирования обязан быть короче 80 слов. Не придумывай данные и не давай инвестиционных советов.`;
  const userPrompt = `ПРОВЕРКА ПОКУПКИ:
Запрос пользователя: <<<${context.query}>>>
Сумма: ${fmtSom(context.requestedAmount)}
Категория: ${context.categoryLabel}
Ликвидность/деньги на руках: ${fmtSom(context.liquidity)}
Обязательные счета на ближайшие 30 дней: ${fmtSom(context.fixedBills)}
Долговые обязательства на ближайшие 30 дней: ${fmtSom(context.debtObligations)}
Всего обязательств: ${fmtSom(context.upcomingObligations)}
Траты категории в текущем месяце: ${fmtSom(context.categoryActual)}
План категории: ${fmtSom(context.categoryBudget)}
Запланированный будущий доход: ${fmtSom(context.plannedIncome)}
Безопасно потратить сейчас: ${fmtSom(context.safeToSpendNow)}
Сформулируй только reasoning и action.`;
  const response = await genai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: { systemInstruction, temperature: 0.2, responseMimeType: "application/json" },
  });
  const clean = (response.text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(clean) as { reasoning?: unknown; action?: unknown };
  if (typeof parsed.reasoning !== "string" || typeof parsed.action !== "string") {
    throw new Error("Gemini returned an invalid purchase-check shape");
  }
  return {
    reasoning: parsed.reasoning,
    action: parsed.action,
  };
}

export async function runPurchaseCheck(query: string, userId: number): Promise<PurchaseCheckResult> {
  const context = await gatherContext(query, userId);
  const safeAdvice = deterministicAdvice(context);
  let reasoning = safeAdvice.reasoning;
  let action = safeAdvice.action;
  let isFallback = true;
  try {
    const llmAdvice = await askGemini(context, safeAdvice);
    reasoning = llmAdvice.reasoning;
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
    action,
    responseText: formatResponse(safeAdvice.verdict, safeAdvice.partialAmount, reasoning, action),
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
    },
    isFallback,
  };
}

// POST /advisor/purchase-check
router.post("/advisor/purchase-check", async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  const userId = req.body?.user_id;
  if (!query || typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "query and a positive integer user_id are required" });
    return;
  }
  try {
    res.json(await runPurchaseCheck(query, userId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check purchase";
    res.status(400).json({ error: message });
  }
});

export default router;