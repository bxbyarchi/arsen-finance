import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, debtPaymentsTable, debtsTable, balanceTransactionsTable, profileTable } from "@workspace/db";

const router = Router();
const roundMoney = (value: number) => Math.round(value * 100) / 100;

function calculateProjectedPayoff(balance: number, monthlyPayment: number, annualRate: number) {
  if (balance <= 0.01 || monthlyPayment <= 0) return { months: 0, interest: 0 };
  const monthlyRate = annualRate / 100 / 12;
  let remaining = balance, interest = 0, months = 0;
  while (remaining > 0.01 && months < 600) {
    const interestCharge = remaining * monthlyRate;
    interest += interestCharge;
    remaining = Math.max(0, remaining + interestCharge - monthlyPayment);
    months++;
  }
  return { months, interest: roundMoney(interest) };
}

router.get("/debts", async (req, res) => {
  const debts = await db.select().from(debtsTable).where(eq(debtsTable.ownerId, req.user!.id)).orderBy(debtsTable.createdAt);
  res.json(debts);
});

router.post("/debts", async (req, res) => {
  const { creditorName, totalDebt, originalAmount, termMonths, monthlyPayment, interestRate, dueDate, notes } = req.body;
  const currentBalance = Number(totalDebt);
  const [debt] = await db.insert(debtsTable).values({ ownerId: req.user!.id, creditorName, totalDebt: currentBalance, originalAmount: Number(originalAmount ?? currentBalance), termMonths: Math.max(0, Math.round(Number(termMonths ?? 0))), monthlyPayment: Number(monthlyPayment), interestRate: Number(interestRate), dueDate, notes: notes ?? null }).returning();
  res.status(201).json(debt);
});

router.get("/debts/payoff-schedules", async (req, res) => {
  const debts = await db.select().from(debtsTable).where(eq(debtsTable.ownerId, req.user!.id));
  if (debts.length === 0) { res.json({ snowball: [], avalanche: [], snowballTotalMonths: 0, avalancheTotalMonths: 0, snowballTotalInterest: 0, avalancheTotalInterest: 0 }); return; }
  function calculatePayoff(sortedDebts: typeof debts) {
    const schedule: { debtId: number; creditorName: string; order: number; monthsToPayoff: number; totalInterest: number; totalPaid: number }[] = [];
    let totalMonths = 0, totalInterest = 0, order = 1;
    for (const debt of sortedDebts) {
      const projected = calculateProjectedPayoff(debt.totalDebt, debt.monthlyPayment, debt.interestRate);
      schedule.push({ debtId: debt.id, creditorName: debt.creditorName, order, monthsToPayoff: projected.months, totalInterest: projected.interest, totalPaid: roundMoney(debt.totalDebt + projected.interest) });
      totalMonths = Math.max(totalMonths, projected.months);
      totalInterest += projected.interest;
      order++;
    }
    return { schedule, totalMonths, totalInterest: roundMoney(totalInterest) };
  }
  const snowball = calculatePayoff([...debts].sort((a, b) => a.totalDebt - b.totalDebt));
  const avalanche = calculatePayoff([...debts].sort((a, b) => b.interestRate - a.interestRate));
  res.json({ snowball: snowball.schedule, avalanche: avalanche.schedule, snowballTotalMonths: snowball.totalMonths, avalancheTotalMonths: avalanche.totalMonths, snowballTotalInterest: snowball.totalInterest, avalancheTotalInterest: avalanche.totalInterest });
});

router.get("/debts/:id/payments", async (req, res) => {
  const debtId = Number(req.params.id);
  const [debt] = await db.select().from(debtsTable).where(and(eq(debtsTable.id, debtId), eq(debtsTable.ownerId, req.user!.id)));
  if (!debt) { res.status(404).json({ error: "Debt not found" }); return; }
  const payments = await db.select().from(debtPaymentsTable).where(and(eq(debtPaymentsTable.debtId, debtId), eq(debtPaymentsTable.ownerId, req.user!.id))).orderBy(desc(debtPaymentsTable.paidAt), desc(debtPaymentsTable.createdAt));
  res.json(payments);
});

router.post("/debts/:id/payments", async (req, res) => {
  const debtId = Number(req.params.id);
  const amount = Number(req.body.amount);
  const paymentType = String(req.body.paymentType ?? "monthly");
  const paidAt = String(req.body.paidAt ?? new Date().toISOString().slice(0, 10));
  const notes = req.body.notes ? String(req.body.notes) : null;
  if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: "Сумма платежа должна быть больше нуля" }); return; }
  if (!["monthly", "early", "full"].includes(paymentType)) { res.status(400).json({ error: "Некорректный тип платежа" }); return; }

  const result = await db.transaction(async (tx) => {
    const [debt] = await tx.select().from(debtsTable).where(and(eq(debtsTable.id, debtId), eq(debtsTable.ownerId, req.user!.id)));
    const [profile] = await tx.select().from(profileTable).where(eq(profileTable.ownerId, req.user!.id));
    if (!debt || !profile) return null;
    const balanceBefore = Math.max(0, Number(debt.totalDebt));
    if (balanceBefore <= 0.01) throw new Error("Этот долг уже погашен");
    if (profile.currentBalance < amount) throw new Error("Недостаточно денег на текущем балансе");

    const monthlyInterest = paymentType === "monthly" ? balanceBefore * (debt.interestRate / 100 / 12) : 0;
    const appliedAmount = Math.min(amount, balanceBefore + monthlyInterest);
    let interestPaid = paymentType === "monthly" ? Math.min(monthlyInterest, appliedAmount) : 0;
    let principalPaid = paymentType === "monthly" ? Math.min(balanceBefore, Math.max(0, appliedAmount - interestPaid)) : Math.min(balanceBefore, appliedAmount);
    if (paymentType === "full") { interestPaid = 0; principalPaid = balanceBefore; }
    const actualAmount = roundMoney(principalPaid + interestPaid);
    if (actualAmount > profile.currentBalance) throw new Error("Недостаточно денег на текущем балансе");

    const newBalance = Math.max(0, roundMoney(balanceBefore - principalPaid));
    const nextDueDate = paymentType === "monthly" && newBalance > 0.01 ? addOneMonth(debt.dueDate) : debt.dueDate;
    const [updatedDebt] = await tx.update(debtsTable).set({ totalDebt: newBalance, dueDate: nextDueDate }).where(and(eq(debtsTable.id, debtId), eq(debtsTable.ownerId, req.user!.id))).returning();
    const [payment] = await tx.insert(debtPaymentsTable).values({ debtId, ownerId: req.user!.id, amount: actualAmount, principalPaid: roundMoney(principalPaid), interestPaid: roundMoney(interestPaid), paymentType, paidAt, notes }).returning();
    await tx.update(profileTable).set({ currentBalance: roundMoney(profile.currentBalance - actualAmount), updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
    await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: -actualAmount, type: "debt_payment", sourceId: debtId, sourceType: "debt_payment", note: `${debt.creditorName}: ${paymentType}` });
    return { debt: updatedDebt, payment, balance: roundMoney(profile.currentBalance - actualAmount) };
  });
  if (!result) { res.status(404).json({ error: "Debt not found" }); return; }
  res.status(201).json(result);
});

function addOneMonth(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay)); return date.toISOString().slice(0, 10);
}

router.get("/debts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [debt] = await db.select().from(debtsTable).where(and(eq(debtsTable.id, id), eq(debtsTable.ownerId, req.user!.id)));
  if (!debt) { res.status(404).json({ error: "Debt not found" }); return; }
  res.json(debt);
});

router.put("/debts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { creditorName, totalDebt, originalAmount, termMonths, monthlyPayment, interestRate, dueDate, notes } = req.body;
  const [existing] = await db.select().from(debtsTable).where(and(eq(debtsTable.id, id), eq(debtsTable.ownerId, req.user!.id)));
  if (!existing) { res.status(404).json({ error: "Debt not found" }); return; }
  const [debt] = await db.update(debtsTable).set({ creditorName, totalDebt: Number(totalDebt), originalAmount: Number(originalAmount ?? existing.originalAmount ?? totalDebt), termMonths: Math.max(0, Math.round(Number(termMonths ?? existing.termMonths ?? 0))), monthlyPayment: Number(monthlyPayment), interestRate: Number(interestRate), dueDate, notes: notes ?? null }).where(and(eq(debtsTable.id, id), eq(debtsTable.ownerId, req.user!.id))).returning();
  res.json(debt);
});

router.delete("/debts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [deleted] = await db.delete(debtsTable).where(and(eq(debtsTable.id, id), eq(debtsTable.ownerId, req.user!.id))).returning({ id: debtsTable.id });
  if (!deleted) { res.status(404).json({ error: "Debt not found" }); return; }
  res.status(204).end();
});

export default router;
