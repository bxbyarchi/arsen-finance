import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { db, debtsTable, expensesTable, incomesTable, profileTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

const fmtSom = (val: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(val)) + " сом";

interface Optimization {
  title: string;
  description: string;
  estimatedMonthlySaving: number;
  urgency: "critical" | "high" | "medium" | "low";
}
interface RiskAlert {
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
}
interface AnalysisResult {
  optimizations: Optimization[];
  riskAlerts: RiskAlert[];
  overallHealthScore: number;
  summary: string;
}

// POST /ai/analyze
router.post("/ai/analyze", async (req, res) => {
  const [debts, expenses, incomes, profiles] = await Promise.all([
    db.select().from(debtsTable).where(eq(debtsTable.ownerId, req.user!.id)),
    db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id)),
    db.select().from(incomesTable).where(eq(incomesTable.ownerId, req.user!.id)),
    db.select().from(profileTable).where(eq(profileTable.ownerId, req.user!.id)).limit(1),
  ]);

  const profile = profiles[0] ?? { currentSavings: 0, crisisMode: false };
  const weights: Record<string, number> = { HIGH: 1.0, MEDIUM: 0.65, LOW: 0.3 };
  const totalDebt = debts.reduce((s, d) => s + d.totalDebt, 0);
  const totalMonthlyDebt = debts.reduce((s, d) => s + d.monthlyPayment, 0);
  const totalMonthlyExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const weightedIncome = incomes.reduce((s, i) => s + i.projectedAmount * (weights[i.confidence] ?? 0.5), 0);
  const totalBurn = totalMonthlyExpenses + totalMonthlyDebt;
  const netCashFlow = weightedIncome - totalBurn;
  const runway = totalBurn > 0 ? profile.currentSavings / totalBurn : 999;
  const debtToIncome = weightedIncome > 0 ? (totalMonthlyDebt / weightedIncome) * 100 : 0;
  const focusArea = req.body?.focusArea ?? null;

  const prompt = `Ты — опытный персональный финансовый советник. Проанализируй финансовые данные пользователя и дай практические рекомендации.
ВАЖНО: Весь ответ должен быть ТОЛЬКО на русском языке. Валюта — сом (KGS). Все суммы указывай в формате "X XXX сом".

## Финансовый обзор
- Накопления: ${fmtSom(profile.currentSavings)}
- Финансовый запас: ${runway.toFixed(1)} мес. при текущих тратах
- Чистый денежный поток: ${fmtSom(netCashFlow)} (${netCashFlow >= 0 ? "профицит" : "ДЕФИЦИТ"})
- Всего трат в месяц: ${fmtSom(totalBurn)} (расходы: ${fmtSom(totalMonthlyExpenses)} + выплаты по долгам: ${fmtSom(totalMonthlyDebt)})
- Реалистичный доход (с поправкой на вероятность): ${fmtSom(weightedIncome)}
- Сумма всех долгов: ${fmtSom(totalDebt)}
- Долговая нагрузка: ${debtToIncome.toFixed(1)}% от дохода
${focusArea ? `- Приоритетная тема: ${focusArea}` : ""}

## Долги (${debts.length} шт.)
${debts.length === 0 ? "Долгов не записано." : debts.map(d =>
  `- ${d.creditorName}: остаток ${fmtSom(d.totalDebt)}, платёж ${fmtSom(d.monthlyPayment)}/мес, ставка ${d.interestRate}%${d.notes ? `, ${d.notes}` : ""}`
).join("\n")}

## Ежемесячные расходы (${expenses.length} пунктов)
${expenses.length === 0 ? "Расходов не записано." : expenses.map(e =>
  `- [${e.isEssential ? "ОБЯЗАТЕЛЬНЫЙ" : "НЕОБЯЗАТЕЛЬНЫЙ"}] ${e.name} (${e.category}): ${fmtSom(e.amount)}/мес`
).join("\n")}

## Источники дохода (${incomes.length} записей)
${incomes.length === 0 ? "Доходов не записано." : incomes.map(i =>
  `- ${i.source} [уверенность: ${i.confidence}]: ожидается ${fmtSom(i.projectedAmount)}${i.actualAmount != null ? `, получено ${fmtSom(i.actualAmount)}` : ", ещё не получено"} (${i.month})`
).join("\n")}

## Задача
Ответь ТОЛЬКО валидным JSON-объектом (без markdown, без текста вне JSON) строго такой структуры:
{
  "optimizations": [
    {
      "title": "Короткий заголовок — до 8 слов",
      "description": "2-3 предложения с конкретными советами — упомяни реальные цифры пользователя.",
      "estimatedMonthlySaving": 0,
      "urgency": "critical|high|medium|low"
    }
  ],
  "riskAlerts": [
    {
      "title": "Короткий заголовок риска — до 8 слов",
      "description": "1-2 предложения с описанием риска и его последствий.",
      "severity": "critical|warning|info"
    }
  ],
  "overallHealthScore": 0,
  "summary": "2-3 предложения — общая оценка финансового здоровья."
}

Правила:
- Ровно 3 оптимизации, отсортированные по срочности (сначала самые важные).
- От 2 до 4 предупреждений о рисках, основанных на реальных данных.
- overallHealthScore — целое число от 0 до 100.
- estimatedMonthlySaving — число в сомах (0 если не поддаётся расчёту).
- Упоминай конкретные названия кредиторов, суммы и ставки из данных пользователя.
- urgency строго: "critical", "high", "medium", "low".
- severity строго: "critical", "warning", "info".`;

  try {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { temperature: 0.4, responseMimeType: "application/json" },
    });

    const text = response.text ?? "";
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed: AnalysisResult = JSON.parse(clean);
    const score = Math.max(0, Math.min(100, Math.round(parsed.overallHealthScore ?? 50)));

    return res.json({
      optimizations: (parsed.optimizations ?? []).slice(0, 3),
      riskAlerts: (parsed.riskAlerts ?? []).slice(0, 4),
      overallHealthScore: score,
      summary: parsed.summary ?? "",
      analyzedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    req.log.warn({ err: err?.message ?? String(err) }, "Gemini API вернул ошибку — используется встроенный анализ");

    // Rule-based fallback (Russian)
    const highInterestDebts = debts.filter(d => d.interestRate > 20);
    const variableExpenses = expenses.filter(e => !e.isEssential);
    const totalVariable = variableExpenses.reduce((s, e) => s + e.amount, 0);
    const lowConfidenceIncome = incomes.filter(i => i.confidence === "LOW");

    const optimizations: Optimization[] = [];

    if (highInterestDebts.length > 0) {
      const avgRate = highInterestDebts.reduce((s, d) => s + d.interestRate, 0) / highInterestDebts.length;
      optimizations.push({
        title: "Рефинансировать долги с высокими ставками",
        description: `У вас ${highInterestDebts.length} кредит(ов) со ставкой выше 20% (в среднем ${avgRate.toFixed(1)}%). Рефинансирование или перевод в другой банк поможет снизить переплату каждый месяц.`,
        estimatedMonthlySaving: Math.round(highInterestDebts.reduce((s, d) => s + d.monthlyPayment * 0.2, 0)),
        urgency: avgRate > 25 ? "critical" : "high",
      });
    }

    if (totalVariable > 0) {
      const top3 = [...variableExpenses].sort((a, b) => b.amount - a.amount).slice(0, 3);
      optimizations.push({
        title: "Сократить необязательные траты",
        description: `Необязательные расходы: ${fmtSom(totalVariable)}/мес. Сокращение на 30% — особенно по статьям ${top3.map(e => `«${e.name}»`).join(", ")} — сразу улучшит ситуацию.`,
        estimatedMonthlySaving: Math.round(totalVariable * 0.3),
        urgency: netCashFlow < 0 ? "critical" : "high",
      });
    }

    if (debts.length > 1) {
      const highestRate = [...debts].sort((a, b) => b.interestRate - a.interestRate)[0];
      optimizations.push({
        title: "Применить метод лавины для погашения долгов",
        description: `Платите минимумы по всем долгам, а весь свободный остаток направляйте на «${highestRate.creditorName}» (ставка ${highestRate.interestRate}%). Это минимизирует общую переплату.`,
        estimatedMonthlySaving: 0,
        urgency: "medium",
      });
    }

    const riskAlerts: RiskAlert[] = [];
    if (netCashFlow < 0) {
      riskAlerts.push({
        title: "Расходы превышают доходы",
        description: `Каждый месяц уходит на ${fmtSom(Math.abs(netCashFlow))} больше, чем приходит. При этом темпе накоплений хватит на ${runway.toFixed(1)} мес.`,
        severity: "critical",
      });
    }
    if (debtToIncome > 43) {
      riskAlerts.push({
        title: "Высокая долговая нагрузка",
        description: `Выплаты по долгам составляют ${debtToIncome.toFixed(0)}% дохода. Выше 43% — опасная зона, ограничивающая финансовую свободу.`,
        severity: debtToIncome > 60 ? "critical" : "warning",
      });
    }
    if (lowConfidenceIncome.length > 0) {
      riskAlerts.push({
        title: "Нестабильные источники дохода",
        description: `${lowConfidenceIncome.length} источник(ов) дохода с низкой уверенностью. Стройте бюджет на пессимистичном сценарии.`,
        severity: "warning",
      });
    }
    if (runway < 2) {
      riskAlerts.push({
        title: "Критически малый запас накоплений",
        description: `При текущих тратах накоплений хватит лишь на ${runway.toFixed(1)} мес. Включите режим выживания для оптимизации.`,
        severity: "critical",
      });
    }

    let score = 50;
    if (netCashFlow > 0) score += Math.min(20, (netCashFlow / (totalBurn || 1)) * 20);
    if (netCashFlow < 0) score -= Math.min(30, Math.abs(netCashFlow / (totalBurn || 1)) * 30);
    if (runway >= 6) score += 15; else if (runway >= 3) score += 8; else if (runway < 1) score -= 20;
    if (debtToIncome < 28) score += 10; else if (debtToIncome > 43) score -= 10;
    if (highInterestDebts.length === 0) score += 5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const summaryText = score >= 70
      ? `Финансовое здоровье в порядке (оценка: ${score}/100). Сосредоточьтесь на погашении долгов и наращивании подушки безопасности.`
      : score >= 40
      ? `Финансовая ситуация требует внимания (оценка: ${score}/100). Займитесь оптимизациями выше — особенно денежным потоком.`
      : `Финансовое положение критическое (оценка: ${score}/100). Немедленно включите режим выживания и уберите все необязательные траты.`;

    return res.json({
      optimizations: optimizations.slice(0, 3),
      riskAlerts: riskAlerts.slice(0, 4),
      overallHealthScore: score,
      summary: summaryText,
      analyzedAt: new Date().toISOString(),
      _fallback: true,
    });
  }
});

export default router;
