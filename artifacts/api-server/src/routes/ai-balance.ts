import { Router } from "express";
import { eq } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { db, profileTable, debtsTable, expensesTable, incomesTable, savingsGoalsTable } from "@workspace/db";

const router = Router();
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
const monthlyAmount = (expense: any) => expense.frequency === "daily" ? expense.amount * 30 : expense.amount;

function buildFallback(balance: number, debts: any[], expenses: any[], goals: any[]) {
  const essential = expenses.filter(e => e.isEssential).reduce((s, e) => s + monthlyAmount(e), 0);
  const minimumDebt = debts.reduce((s, d) => s + d.monthlyPayment, 0);
  const reserveTarget = (essential + minimumDebt) * 2;
  const reserve = Math.min(balance, Math.max(0, reserveTarget));
  let free = Math.max(0, balance - reserve);

  const debtAllocations = [...debts].sort((a, b) => b.interestRate - a.interestRate).map(d => {
    const amount = Math.min(free, Math.max(0, d.monthlyPayment));
    free -= amount;
    return { debtId: d.id, creditorName: d.creditorName, amount: Math.round(amount), reason: "минимальный платёж" };
  });

  const goalAllocations: Array<{ goalId: number; title: string; amount: number; reason: string }> = [];
  const activeGoals = [...goals].filter(g => g.currentAmount < g.targetAmount).sort((a, b) => a.targetMonths - b.targetMonths);
  for (const goal of activeGoals) {
    if (free <= 0) break;
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    const monthlyNeed = remaining / Math.max(1, goal.targetMonths);
    const amount = Math.min(free, remaining, Math.max(0, monthlyNeed));
    if (amount > 0) {
      goalAllocations.push({ goalId: goal.id, title: goal.title, amount: Math.round(amount), reason: "приоритет по сроку цели" });
      free -= amount;
    }
  }

  const highestRate = [...debts].sort((a, b) => b.interestRate - a.interestRate)[0];
  if (highestRate && free > 0) {
    const item = debtAllocations.find(x => x.debtId === highestRate.id);
    const extra = Math.min(free, Math.max(0, highestRate.totalDebt - (item?.amount ?? 0)));
    if (item && extra > 0) { item.amount += Math.round(extra); free -= extra; }
  }

  const goalsTotal = goalAllocations.reduce((s, g) => s + g.amount, 0);
  return {
    reserve: Math.round(reserve),
    debts: debtAllocations,
    goals: goalsTotal,
    goalAllocations,
    free: Math.round(free),
    reason: "Сначала резерв на 2 месяца обязательных расходов и платежей, затем минимальные долги, цели по сроку, а остаток — на самый дорогой долг или свободные деньги.",
  };
}

router.get("/ai/balance-distribution", async (req, res) => {
  const [profiles, debts, expenses, incomes, goals] = await Promise.all([
    db.select().from(profileTable).where(eq(profileTable.ownerId, req.user!.id)),
    db.select().from(debtsTable).where(eq(debtsTable.ownerId, req.user!.id)),
    db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id)),
    db.select().from(incomesTable).where(eq(incomesTable.ownerId, req.user!.id)),
    db.select().from(savingsGoalsTable).where(eq(savingsGoalsTable.ownerId, req.user!.id)),
  ]);
  const balance = profiles[0]?.currentBalance ?? 0;
  const fallback = buildFallback(balance, debts, expenses, goals);
  const essentialMonthly = expenses.filter(e => e.isEssential).reduce((s, e) => s + monthlyAmount(e), 0);

  if (!process.env.GEMINI_API_KEY) { res.json({ balance, ...fallback, source: "rule-based" }); return; }

  const prompt = `Ты — финансовый ИИ. Распредели текущий баланс пользователя в сомах. Не выдумывай данные. Баланс: ${balance}. Обязательные расходы/мес: ${essentialMonthly}. Минимальные платежи по долгам/мес: ${debts.reduce((s, d) => s + d.monthlyPayment, 0)}. Долги: ${debts.map(d => `${d.id}:${d.creditorName}, остаток ${d.totalDebt}, платёж ${d.monthlyPayment}, ставка ${d.interestRate}%`).join("; ") || "нет"}. Цели: ${goals.map(g => `${g.id}:${g.title}, осталось ${Math.max(0, g.targetAmount - g.currentAmount)}, срок ${g.targetMonths} мес.`).join("; ") || "нет"}. Доходы: ${incomes.map(i => `${i.source}: ${i.actualAmount ?? 0}`).join("; ") || "нет"}. Верни только JSON: {"reserve":число,"debts":[{"creditorName":строка,"amount":число}],"goals":число,"goalAllocations":[{"goalId":число,"title":строка,"amount":число,"reason":строка}],"free":число,"reason":строка}. Сумма reserve + все debt amount + goals + free <= balance. goals должна равняться сумме goalAllocations. Не отрицательные числа. Резерв 1-2 месяца обязательных расходов и платежей, затем обязательные минимальные платежи, затем приоритетные цели по сроку, затем дорогой долг/свободный остаток.`;

  try {
    const response = await genai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt, config: { temperature: 0.2, responseMimeType: "application/json" } });
    const parsed = JSON.parse((response.text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
    const safe = (v: unknown) => Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0);
    const reserve = safe(parsed.reserve);
    const free = safe(parsed.free);
    const debtItems = Array.isArray(parsed.debts) ? parsed.debts.map((d: any) => ({ creditorName: String(d.creditorName ?? ""), amount: safe(d.amount) })).filter((d: any) => d.creditorName && d.amount > 0) : [];
    const goalItems = Array.isArray(parsed.goalAllocations) ? parsed.goalAllocations.map((g: any) => ({ goalId: Number(g.goalId), title: String(g.title ?? ""), amount: safe(g.amount), reason: String(g.reason ?? "Приоритетная цель") })).filter((g: any) => Number.isInteger(g.goalId) && g.goalId > 0 && g.title && g.amount > 0) : [];
    const goalsTotal = goalItems.reduce((s: number, g: any) => s + g.amount, 0);
    const total = reserve + free + goalsTotal + debtItems.reduce((s: number, d: any) => s + d.amount, 0);
    if (total > balance + 0.01) { res.json({ balance, ...fallback, source: "safe-fallback" }); return; }
    res.json({ balance, reserve, debts: debtItems, goals: goalsTotal, goalAllocations: goalItems, free, reason: String(parsed.reason ?? "ИИ подготовил распределение."), source: "gemini" });
  } catch {
    res.json({ balance, ...fallback, source: "rule-based" });
  }
});

export default router;
