import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, debtsTable } from "@workspace/db";

const router = Router();

// GET /debts
router.get("/debts", async (req, res) => {
  const debts = await db.select().from(debtsTable).orderBy(debtsTable.createdAt);
  res.json(debts);
});

// POST /debts
router.post("/debts", async (req, res) => {
  const { creditorName, totalDebt, monthlyPayment, interestRate, dueDate, notes } = req.body;
  const [debt] = await db.insert(debtsTable).values({
    creditorName,
    totalDebt: Number(totalDebt),
    monthlyPayment: Number(monthlyPayment),
    interestRate: Number(interestRate),
    dueDate,
    notes: notes ?? null,
  }).returning();
  res.status(201).json(debt);
});

// GET /debts/payoff-schedules  (must come before /:id)
router.get("/debts/payoff-schedules", async (req, res) => {
  const debts = await db.select().from(debtsTable);

  if (debts.length === 0) {
    return res.json({
      snowball: [],
      avalanche: [],
      snowballTotalMonths: 0,
      avalancheTotalMonths: 0,
      snowballTotalInterest: 0,
      avalancheTotalInterest: 0,
    });
  }

  function calculatePayoff(sortedDebts: typeof debts) {
    const schedule: { debtId: number; creditorName: string; order: number; monthsToPayoff: number; totalInterest: number; totalPaid: number }[] = [];
    let remaining = sortedDebts.map(d => ({ ...d, remaining: d.totalDebt }));
    let totalMonths = 0;
    let totalInterest = 0;
    let order = 1;

    while (remaining.length > 0) {
      const target = remaining[0];
      const monthlyRate = target.interestRate / 100 / 12;
      let months = 0;
      let interest = 0;
      let bal = target.remaining;

      while (bal > 0.01) {
        const interestCharge = bal * monthlyRate;
        interest += interestCharge;
        bal = bal + interestCharge - target.monthlyPayment;
        if (bal < 0) bal = 0;
        months++;
        if (months > 600) break; // safety cap
      }

      schedule.push({
        debtId: target.id,
        creditorName: target.creditorName,
        order,
        monthsToPayoff: months,
        totalInterest: Math.round(interest * 100) / 100,
        totalPaid: Math.round((target.totalDebt + interest) * 100) / 100,
      });

      totalMonths = Math.max(totalMonths, months);
      totalInterest += interest;
      remaining = remaining.slice(1);
      order++;
    }

    return { schedule, totalMonths, totalInterest: Math.round(totalInterest * 100) / 100 };
  }

  // Snowball: smallest balance first
  const snowballSorted = [...debts].sort((a, b) => a.totalDebt - b.totalDebt);
  const snowball = calculatePayoff(snowballSorted);

  // Avalanche: highest interest rate first
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

// GET /debts/:id
router.get("/debts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [debt] = await db.select().from(debtsTable).where(eq(debtsTable.id, id));
  if (!debt) return res.status(404).json({ error: "Debt not found" });
  res.json(debt);
});

// PUT /debts/:id
router.put("/debts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { creditorName, totalDebt, monthlyPayment, interestRate, dueDate, notes } = req.body;
  const [debt] = await db.update(debtsTable)
    .set({ creditorName, totalDebt: Number(totalDebt), monthlyPayment: Number(monthlyPayment), interestRate: Number(interestRate), dueDate, notes: notes ?? null })
    .where(eq(debtsTable.id, id))
    .returning();
  if (!debt) return res.status(404).json({ error: "Debt not found" });
  res.json(debt);
});

// DELETE /debts/:id
router.delete("/debts/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(debtsTable).where(eq(debtsTable.id, id));
  res.status(204).end();
});

export default router;
