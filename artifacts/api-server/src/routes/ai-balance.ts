import { Router } from "express";
import { eq } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { db, profileTable, debtsTable, expensesTable, incomesTable } from "@workspace/db";

const router = Router();
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

router.get("/ai/balance-distribution", async (req, res) => {
  const [profiles, debts, expenses, incomes] = await Promise.all([
    db.select().from(profileTable).where(eq(profileTable.ownerId, req.user!.id)),
    db.select().from(debtsTable).where(eq(debtsTable.ownerId, req.user!.id)),
    db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id)),
    db.select().from(incomesTable).where(eq(incomesTable.ownerId, req.user!.id)),
  ]);
  const balance = profiles[0]?.currentBalance ?? 0;
  const essential = expenses.filter(e => e.isEssential).reduce((s, e) => s + e.amount, 0);
  const minimumDebt = debts.reduce((s, d) => s + d.monthlyPayment, 0);
  const fallback = {
    reserve: Math.min(balance, (essential + minimumDebt) * 2),
    debts: [...debts].sort((a, b) => b.interestRate - a.interestRate).map(d => ({ creditorName: d.creditorName, amount: Math.min(d.monthlyPayment, d.totalDebt) })),
    goals: 0,
    free: Math.max(0, balance - Math.min(balance, (essential + minimumDebt) * 2)),
    reason: "Сначала резерв на обязательные расходы и платежи, затем приоритетный долг с высокой ставкой.",
  };

  if (!process.env.GEMINI_API_KEY) { res.json({ balance, ...fallback, source: "rule-based" }); return; }

  const prompt = `Ты — финансовый ИИ. Распредели текущий баланс пользователя в сомах, но НЕ выдумывай доходы или расходы. Баланс: ${balance}. Обязательные расходы в месяц: ${essential}. Минимальные платежи по долгам: ${minimumDebt}. Долги: ${debts.map(d => `${d.creditorName}: остаток ${d.totalDebt}, платёж ${d.monthlyPayment}, ставка ${d.interestRate}%`).join("; ") || "нет"}. Доходы: ${incomes.map(i => `${i.source}: ${i.actualAmount ?? 0} получено`).join("; ") || "нет"}. Верни только JSON: {"reserve":число,"debts":[{"creditorName":строка,"amount":число}],"goals":число,"free":число,"reason":строка}. Сумма reserve+debts+goals+free должна быть не больше баланса. Не предлагай отрицательные числа. Резерв — минимум 1-2 месяца обязательных расходов и платежей, если денег хватает. Сначала обязательные платежи, затем долг с высокой ставкой.`;

  try {
    const response = await genai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt, config: { temperature: 0.2, responseMimeType: "application/json" } });
    const parsed = JSON.parse((response.text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
    const safe = (v: unknown) => Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0);
    const reserve = safe(parsed.reserve);
    const goals = safe(parsed.goals);
    const free = safe(parsed.free);
    const debtItems = Array.isArray(parsed.debts) ? parsed.debts.map((d: any) => ({ creditorName: String(d.creditorName ?? ""), amount: safe(d.amount) })).filter((d: any) => d.creditorName && d.amount > 0) : [];
    const total = reserve + goals + free + debtItems.reduce((s: number, d: any) => s + d.amount, 0);
    if (total > balance + 0.01) { res.json({ balance, ...fallback, source: "safe-fallback" }); return; }
    res.json({ balance, reserve, debts: debtItems, goals, free, reason: String(parsed.reason ?? "ИИ подготовил распределение."), source: "gemini" });
  } catch {
    res.json({ balance, ...fallback, source: "rule-based" });
  }
});

export default router;
