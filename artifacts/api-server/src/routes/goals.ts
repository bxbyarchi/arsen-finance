import { Router } from "express";
import { db, savingsGoalsTable, balanceTransactionsTable, profileTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router = Router();

async function ensureProfile(ownerId: string) {
  const [existing] = await db.select().from(profileTable).where(eq(profileTable.ownerId, ownerId));
  if (existing) return existing;
  const [created] = await db.insert(profileTable).values({ ownerId, currentSavings: 0, currentBalance: 0, crisisMode: false }).returning();
  return created;
}

// GET /goals
router.get("/goals", async (req, res) => {
  const goals = await db.select().from(savingsGoalsTable)
    .where(eq(savingsGoalsTable.ownerId, req.user!.id))
    .orderBy(savingsGoalsTable.targetMonths);
  res.json(goals);
});

// POST /goals — initial amount is reserved from current balance
router.post("/goals", async (req, res) => {
  const { title, targetAmount, targetMonths, currentAmount = 0 } = req.body;
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title is required" }); return;
  }
  const target = Number(targetAmount);
  const months = Number(targetMonths);
  const current = Math.max(0, Number(currentAmount));
  if (!isFinite(target) || target <= 0) {
    res.status(400).json({ error: "targetAmount must be a positive finite number" }); return;
  }
  if (!Number.isInteger(months) || months < 1) {
    res.status(400).json({ error: "targetMonths must be a positive integer" }); return;
  }

  const profile = await ensureProfile(req.user!.id);
  if (current > profile.currentBalance + 0.01) {
    res.status(400).json({ error: "Недостаточно денег на балансе для стартовой суммы цели" }); return;
  }

  const result = await db.transaction(async (tx) => {
    const [goal] = await tx.insert(savingsGoalsTable).values({
      ownerId: req.user!.id, title: title.trim(), targetAmount: target, targetMonths: months, currentAmount: current,
    }).returning();
    if (current > 0) {
      const newBalance = Math.round((profile.currentBalance - current) * 100) / 100;
      await tx.update(profileTable).set({ currentBalance: newBalance, updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
      await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: -current, type: "goal_contribution", sourceId: goal.id, sourceType: "goal", category: "financial_goal", note: `Начальное пополнение цели: ${goal.title}` });
    }
    return goal;
  });
  res.status(201).json(result);
});

// PUT /goals/:id — changing currentAmount changes the balance by the same delta
router.put("/goals/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, targetAmount, targetMonths, currentAmount } = req.body;
  if (!title || typeof title !== "string" || title.trim().length === 0) { res.status(400).json({ error: "title is required" }); return; }
  const target = Number(targetAmount);
  const months = Number(targetMonths);
  const requestedCurrent = Math.max(0, Number(currentAmount ?? 0));
  if (!isFinite(target) || target <= 0) { res.status(400).json({ error: "targetAmount must be a positive finite number" }); return; }
  if (!Number.isInteger(months) || months < 1) { res.status(400).json({ error: "targetMonths must be a positive integer" }); return; }

  const [goal] = await db.select().from(savingsGoalsTable).where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.ownerId, req.user!.id)));
  if (!goal) { res.status(404).json({ error: "Not found" }); return; }
  const delta = requestedCurrent - goal.currentAmount;
  const profile = await ensureProfile(req.user!.id);
  const newBalance = Math.round((profile.currentBalance - delta) * 100) / 100;
  if (newBalance < -0.01) { res.status(400).json({ error: "Недостаточно денег на балансе для увеличения цели" }); return; }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(savingsGoalsTable).set({ title: title.trim(), targetAmount: target, targetMonths: months, currentAmount: requestedCurrent }).where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.ownerId, req.user!.id))).returning();
    if (!updated) return null;
    if (Math.abs(delta) > 0.009) {
      await tx.update(profileTable).set({ currentBalance: Math.max(0, newBalance), updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
      await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: -delta, type: delta > 0 ? "goal_contribution" : "goal_withdrawal", sourceId: id, sourceType: "goal", category: "financial_goal", note: delta > 0 ? `Пополнение цели: ${updated.title}` : `Возврат из цели: ${updated.title}` });
    }
    return updated;
  });
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  res.json(result);
});

// POST /goals/:id/contribute — explicit contribution from current balance
router.post("/goals/:id/contribute", async (req, res) => {
  const id = Number(req.params.id);
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: "Укажите корректную сумму" }); return; }
  const [goal] = await db.select().from(savingsGoalsTable).where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.ownerId, req.user!.id)));
  if (!goal) { res.status(404).json({ error: "Not found" }); return; }
  const profile = await ensureProfile(req.user!.id);
  const nextBalance = Math.round((profile.currentBalance - amount) * 100) / 100;
  if (nextBalance < -0.01) { res.status(400).json({ error: "Недостаточно денег на балансе" }); return; }
  const nextGoal = Math.min(goal.targetAmount, Math.round((goal.currentAmount + amount) * 100) / 100);
  const actual = nextGoal - goal.currentAmount;
  if (actual <= 0) { res.status(400).json({ error: "Цель уже достигнута" }); return; }
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(savingsGoalsTable).set({ currentAmount: nextGoal }).where(eq(savingsGoalsTable.id, id)).returning();
    const newBalance = Math.round((profile.currentBalance - actual) * 100) / 100;
    await tx.update(profileTable).set({ currentBalance: Math.max(0, newBalance), updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
    await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: -actual, type: "goal_contribution", sourceId: id, sourceType: "goal", category: "financial_goal", note: `Пополнение цели: ${goal.title}` });
    return updated;
  });
  res.status(201).json({ goal: result, balance: Math.max(0, nextBalance) });
});

// POST /goals/:id/withdraw — return money from a goal to current balance
router.post("/goals/:id/withdraw", async (req, res) => {
  const id = Number(req.params.id);
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: "Укажите корректную сумму" }); return; }
  const [goal] = await db.select().from(savingsGoalsTable).where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.ownerId, req.user!.id)));
  if (!goal) { res.status(404).json({ error: "Not found" }); return; }
  const actual = Math.min(amount, goal.currentAmount);
  if (actual <= 0) { res.status(400).json({ error: "В цели нет накопленной суммы" }); return; }
  const profile = await ensureProfile(req.user!.id);
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(savingsGoalsTable).set({ currentAmount: Math.round((goal.currentAmount - actual) * 100) / 100 }).where(eq(savingsGoalsTable.id, id)).returning();
    const newBalance = Math.round((profile.currentBalance + actual) * 100) / 100;
    await tx.update(profileTable).set({ currentBalance: newBalance, updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
    await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: actual, type: "goal_withdrawal", sourceId: id, sourceType: "goal", category: "financial_goal", note: `Возврат из цели: ${goal.title}` });
    return updated;
  });
  res.status(201).json({ goal: result, balance: Math.round((profile.currentBalance + actual) * 100) / 100 });
});

// DELETE /goals/:id — return reserved money to balance
router.delete("/goals/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(savingsGoalsTable)
    .where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.ownerId, req.user!.id)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  if (deleted.currentAmount > 0) {
    const profile = await ensureProfile(req.user!.id);
    const newBalance = Math.round((profile.currentBalance + deleted.currentAmount) * 100) / 100;
    await db.transaction(async (tx) => {
      await tx.update(profileTable).set({ currentBalance: newBalance, updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
      await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: deleted.currentAmount, type: "goal_withdrawal", sourceId: id, sourceType: "goal", category: "financial_goal", note: `Возврат при удалении цели: ${deleted.title}` });
    });
  }
  res.status(204).send();
});

export default router;
