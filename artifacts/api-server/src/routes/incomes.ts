import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, incomesTable, expensesTable, balanceTransactionsTable, profileTable } from "@workspace/db";

const router = Router();

const actual = (value: unknown) => value != null ? Number(value) : null;

router.get("/incomes", async (req, res) => {
  const incomes = await db.select().from(incomesTable).where(eq(incomesTable.ownerId, req.user!.id)).orderBy(incomesTable.month);
  res.json(incomes);
});

router.post("/incomes", async (req, res) => {
  const { source, projectedAmount, actualAmount, confidence, month, notes } = req.body;
  const received = actual(actualAmount);
  const result = await db.transaction(async (tx) => {
    const [income] = await tx.insert(incomesTable).values({ ownerId: req.user!.id, source, projectedAmount: Number(projectedAmount), actualAmount: received, confidence: confidence ?? "MEDIUM", month, notes: notes ?? null }).returning();
    if (received != null && received > 0) {
      const [profile] = await tx.select().from(profileTable).where(eq(profileTable.ownerId, req.user!.id));
      if (profile) await tx.update(profileTable).set({ currentBalance: profile.currentBalance + received, updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
      await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: received, type: "income", sourceId: income.id, sourceType: "income", note: source });
    }
    return income;
  });
  res.status(201).json(result);
});

router.put("/incomes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { source, projectedAmount, actualAmount, confidence, month, notes } = req.body;
  const received = actual(actualAmount);
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(incomesTable).where(and(eq(incomesTable.id, id), eq(incomesTable.ownerId, req.user!.id)));
    const [profile] = await tx.select().from(profileTable).where(eq(profileTable.ownerId, req.user!.id));
    if (!existing) return null;
    const oldReceived = existing.actualAmount ?? 0;
    const newReceived = received ?? 0;
    const delta = newReceived - oldReceived;
    const [income] = await tx.update(incomesTable).set({ source, projectedAmount: Number(projectedAmount), actualAmount: received, confidence, month, notes: notes ?? null }).where(and(eq(incomesTable.id, id), eq(incomesTable.ownerId, req.user!.id))).returning();
    if (profile && delta !== 0) await tx.update(profileTable).set({ currentBalance: profile.currentBalance + delta, updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
    const [transaction] = await tx.select().from(balanceTransactionsTable).where(and(eq(balanceTransactionsTable.sourceType, "income"), eq(balanceTransactionsTable.sourceId, id), eq(balanceTransactionsTable.ownerId, req.user!.id)));
    if (newReceived > 0) {
      if (transaction) await tx.update(balanceTransactionsTable).set({ amount: newReceived, note: source }).where(eq(balanceTransactionsTable.id, transaction.id));
      else await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: newReceived, type: "income", sourceId: id, sourceType: "income", note: source });
    } else if (transaction) {
      await tx.delete(balanceTransactionsTable).where(eq(balanceTransactionsTable.id, transaction.id));
    }
    return income;
  });
  if (!result) { res.status(404).json({ error: "Income not found" }); return; }
  res.json(result);
});

router.delete("/incomes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.transaction(async (tx) => {
    const [income] = await tx.select().from(incomesTable).where(and(eq(incomesTable.id, id), eq(incomesTable.ownerId, req.user!.id)));
    const [profile] = await tx.select().from(profileTable).where(eq(profileTable.ownerId, req.user!.id));
    if (!income) return null;
    if (profile && income.actualAmount) await tx.update(profileTable).set({ currentBalance: profile.currentBalance - income.actualAmount, updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
    await tx.delete(incomesTable).where(and(eq(incomesTable.id, id), eq(incomesTable.ownerId, req.user!.id)));
    await tx.delete(balanceTransactionsTable).where(and(eq(balanceTransactionsTable.sourceType, "income"), eq(balanceTransactionsTable.sourceId, id), eq(balanceTransactionsTable.ownerId, req.user!.id)));
    return income;
  });
  if (!result) { res.status(404).json({ error: "Income not found" }); return; }
  res.status(204).end();
});

router.get("/incomes/projection-summary", async (req, res) => {
  const incomes = await db.select().from(incomesTable).where(eq(incomesTable.ownerId, req.user!.id));
  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id));
  const confidenceLevels = ["HIGH", "MEDIUM", "LOW"];
  const weights: Record<string, number> = { HIGH: 1.0, MEDIUM: 0.65, LOW: 0.3 };
  const totalProjected = incomes.reduce((s, i) => s + i.projectedAmount, 0);
  const totalActual = incomes.filter(i => i.actualAmount != null).reduce((s, i) => s + (i.actualAmount ?? 0), 0);
  const confidenceWeightedProjected = incomes.reduce((s, i) => s + i.projectedAmount * (weights[i.confidence] ?? 0.5), 0);
  const byConfidence = confidenceLevels.map(conf => { const group = incomes.filter(i => i.confidence === conf); return { confidence: conf, projected: group.reduce((s, i) => s + i.projectedAmount, 0), actual: group.filter(i => i.actualAmount != null).reduce((s, i) => s + (i.actualAmount ?? 0), 0), count: group.length }; });
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const incomeVsExpenseGap = confidenceWeightedProjected - totalExpenses;
  res.json({ totalProjected, totalActual, confidenceWeightedProjected, byConfidence, incomeVsExpenseGap });
});

export default router;
