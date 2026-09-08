import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, debtPaymentsTable, debtsTable } from "@workspace/db";

const router = Router();

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function calculateProjectedPayoff(balance: number, monthlyPayment: number, annualRate: number) {
  if (balance <= 0.01) return { months: 0, interest: 0 };
  if (monthlyPayment <= 0) return { months: 0, interest: 0 };

  const monthlyRate = annualRate / 100 / 12;
  let remaining = balance;
  let interest = 0;
  let months = 0;

  while (remaining > 0.01 && months < 600) {
    const interestCharge = remaining * monthlyRate;
    interest += interestCharge;
    remaining = Math.max(0, remaining + interestCharge - monthlyPayment);
    months++;
  }

  return { months, interest: roundMoney(interest) };
}

// GET /debts
router.get("/debts", async (req, res) => {
  const debts = await db.select().from(debtsTable).where(eq(debtsTable.ownerId, req.user!.id)).orderBy(debtsTable.createdAt);
  res.json(debts);
});

// POST /debts
router.post("/debts", async (req, res) => {
  const { creditorName, totalDebt, originalAmount, termMonths, monthlyPayment, interestRate, dueDate, notes } = req.body;
  const currentBalance = Number(totalDebt);
  const [debt] = await db.insert(debtsTable).values({
    ownerId: req.user!.id,
    creditorName,
    totalDebt: currentBalance,
    originalAmount: Number(originalAmount ?? currentBalance),
    termMonths: Math.max(0, Math.round(Number(termMonths ?? 0))),
    monthlyPayment: Number(monthlyPayment),
    interestRate: Number(interestRate),
    dueDate,
    notes: notes ?? null,
  }).returning();
  res.status(201).json(debt);
});

// GET /debts/payoff-schedules  (must come before /:id)
router.get("/debts/payoff-schedules", async (req, res) => {
  const debts = await db.select().from(debtsTable).where(eq(debtsTable.ownerId, req.user!.id));

  if (debts.length === 0) {
    res.json({
      snowball: [],
      avalanche: [],
      snowballTotalMonths: 0,
      avalancheTotalMonths: 0,
      snowballTotalInterest: 0,
      avalancheTotalInterest: 0,
    });
    return;
  }

  function calculatePayoff(sortedDebts: typeof debts) {
    const schedule: { debtId: number; creditorName: string; order: number; monthsToPayoff: number; totalInterest: number; totalPaid: number }[] = [];
    let remaining = sortedDebts.map(d => ({ ...d, remaining: d.totalDebt }));
    let totalMonths = 0;
    let totalInterest = 0;
    let order = 1;

    while (remaining.length > 0) {
      const target = remaining[0];
      const projected = calculateProjectedPayoff(target.remaining, target.monthlyPayment, target.interestRate);
      const months = projected.months;
      const interest = projected.interest;

      schedule.push({
        debtId: target.id,
        creditorName: target.creditorName,
        order,
        monthsToPayoff: months,
        totalInterest: interest,
        totalPaid: roundMoney(target.remaining + interest),
      });

      totalMonths = Math.max(totalMonths, months);
      totalInterest += interest;
      remaining = remaining.slice(1);
      order++;
    }

    return { schedule, totalMonths, totalInterest: roundMoney(totalInterest) };
  }

  const snowballSorted = [...debts].sort((a, b) => a.totalDebt - b.totalDebt);
  const snowball = calculatePayoff(snowballSorted);
  const avalancheSorted = [...debts].sort((a, b) => b.interestRate - a.interestRate);
  const avalanche = calculatePayoff(avalancheSorted);

  res.json({
    snowball: snowball.schedule,
    avalanche: avalanche.schedule,
    snowballTotalMonths: snowball.totalMonths,
    avalancheTotalMonths: avalanche.totalMonths,
    snowballTotalInterest: snowball.totalInterest,
    avalancheTotalInterest: avalanche.totalInterest,
  });
});

// GET /debts/:id/payments
router.get("/debts/:id/payments", async (req, res) => {
  const debtId = Number(req.params.id);
  const [debt] = await db.select().from(debtsTable)
    .where(and(eq(debtsTable.id, debtId), eq(debtsTable.ownerId, req.user!.id)));
  if (!debt) { res.status(404).json({ error: "Debt not found" }); return; }

  const payments = await db.select().from(debtPaymentsTable)
    .where(and(eq(debtPaymentsTable.debtId, debtId), eq(debtPaymentsTable.ownerId, req.user!.id)))
    .orderBy(desc(debtPaymentsTable.paidAt), desc(debtPaymentsTable.createdAt));
  res.json(payments);
});

// POST /debts/:id/payments
router.post("/debts/:id/payments", async (req, res) => {
  const debtId = Number(req.params.id);
  const amount = Number(req.body.amount);
  const paymentType = String(req.body.paymentType ?? "monthly");
  const paidAt = String(req.body.paidAt ?? new Date().toISOString().slice(0, 10));
  const notes = req.body.notes ? String(req.body.notes) : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Сумма платежа должна быть больше нуля" });
    return;
  }
  if (!["monthly", "early", "full"].includes(paymentType)) {
    res.status(400).json({ error: "Некорректный тип платежа" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [debt] = await tx.select().from(debtsTable)
      .where(and(eq(debtsTable.id, debtId), eq(debtsTable.ownerId, req.user!.id)));
    if (!debt) return null;

    const balanceBefore = Math.max(0, Number(debt.totalDebt));
    if (balanceBefore <= 0.01) {
      throw new Error("Этот долг уже погашен");
    }

    const appliedAmount = Math.min(amount, balanceBefore + (paymentType === "monthly" ? balanceBefore * (debt.interestRate / 100 / 12) : 0));
    const monthlyInterest = paymentType === "monthly"
      ? balanceBefore * (debt.interestRate / 100 / 12)
      : 0;

    let interestPaid = 0;
    let principalPaid = 0;

    if (paymentType === "monthly") {
      interestPaid = Math.min(monthlyInterest, appliedAmount);
      principalPaid = Math.min(balanceBefore, Math.max(0, appliedAmount - interestPaid));
    } else {
      principalPaid = Math.min(balanceBefore, appliedAmount);
    }

    if (paymentType === "full") {
      interestPaid = 0;
      principalPaid = balanceBefore;
    }

    const newBalance = Math.max(0, roundMoney(balanceBefore - principalPaid));
    const actualAmount = roundMoney(principalPaid + interestPaid);
    const nextDueDate = paymentType === "monthly" && newBalance > 0.01
      ? addOneMonth(debt.dueDate)
      : debt.dueDate;

    const [updatedDebt] = await tx.update(debtsTable)
      .set({ totalDebt: newBalance, dueDate: nextDueDate })
      .where(and(eq(debtsTable.id, debtId), eq(debtsTable.ownerId, req.user!.id)))
      .returning();

    const [payment] = await tx.insert(debtPaymentsTable).values({
      debtId,
      ownerId: req.user!.id,
      amount: actualAmount,
      principalPaid: roundMoney(principalPaid),
      interestPaid: roundMoney(interestPaid),
      paymentType,
      paidAt,
      notes,
    }).returning();

    return { debt: updatedDebt, payment };
  });

  if (!result) { res.status(404).json({ error: "Debt not found" }); return; }
  res.status(201).json(result);
});

function addOneMonth(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

// GET /debts/:id
router.get("/debts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [debt] = await db.select().from(debtsTable)
    .where(and(eq(debtsTable.id, id), eq(debtsTable.ownerId, req.user!.id)));
  if (!debt) { res.status(404).json({ error: "Debt not found" }); return; }
  res.json(debt);
});

// PUT /debts/:id
router.put("/debts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { creditorName, totalDebt, originalAmount, termMonths, monthlyPayment, interestRate, dueDate, notes } = req.body;
  const [existing] = await db.select().from(debtsTable)
    .where(and(eq(debtsTable.id, id), eq(debtsTable.ownerId, req.user!.id)));
  if (!existing) { res.status(404).json({ error: "Debt not found" }); return; }

  const [debt] = await db.update(debtsTable)
    .set({
      creditorName,
      totalDebt: Number(totalDebt),
      originalAmount: Number(originalAmount ?? existing.originalAmount ?? totalDebt),
      termMonths: Math.max(0, Math.round(Number(termMonths ?? existing.termMonths ?? 0))),
      monthlyPayment: Number(monthlyPayment),
      interestRate: Number(interestRate),
      dueDate,
      notes: notes ?? null,
    })
    .where(and(eq(debtsTable.id, id), eq(debtsTable.ownerId, req.user!.id)))
    .returning();
  res.json(debt);
});

// DELETE /debts/:id
router.delete("/debts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [deleted] = await db.delete(debtsTable)
    .where(and(eq(debtsTable.id, id), eq(debtsTable.ownerId, req.user!.id)))
    .returning({ id: debtsTable.id });
  if (!deleted) { res.status(404).json({ error: "Debt not found" }); return; }
  res.status(204).end();
});

export default router;
