import { Router } from "express";
import { db, savingsGoalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /goals
router.get("/goals", async (req, res) => {
  const goals = await db.select().from(savingsGoalsTable).orderBy(savingsGoalsTable.targetMonths);
  res.json(goals);
});

// POST /goals
router.post("/goals", async (req, res) => {
  const { title, targetAmount, targetMonths, currentAmount = 0 } = req.body;
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const target = Number(targetAmount);
  const months = Number(targetMonths);
  const current = Number(currentAmount);
  if (!isFinite(target) || target <= 0) {
    res.status(400).json({ error: "targetAmount must be a positive finite number" });
    return;
  }
  if (!Number.isInteger(months) || months < 1) {
    res.status(400).json({ error: "targetMonths must be a positive integer" });
    return;
  }
  const [goal] = await db.insert(savingsGoalsTable).values({
    title: title.trim(), targetAmount: target, targetMonths: months, currentAmount: isFinite(current) ? Math.max(0, current) : 0,
  }).returning();
  res.status(201).json(goal);
});

// PUT /goals/:id
router.put("/goals/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { title, targetAmount, targetMonths, currentAmount } = req.body;
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const target = Number(targetAmount);
  const months = Number(targetMonths);
  if (!isFinite(target) || target <= 0) {
    res.status(400).json({ error: "targetAmount must be a positive finite number" });
    return;
  }
  if (!Number.isInteger(months) || months < 1) {
    res.status(400).json({ error: "targetMonths must be a positive integer" });
    return;
  }
  const current = Number(currentAmount ?? 0);
  const [updated] = await db.update(savingsGoalsTable)
    .set({
      title: title.trim(),
      targetAmount: target,
      targetMonths: months,
      currentAmount: isFinite(current) ? Math.max(0, current) : 0,
    })
    .where(eq(savingsGoalsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

// DELETE /goals/:id
router.delete("/goals/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(savingsGoalsTable).where(eq(savingsGoalsTable.id, id));
  res.status(204).send();
});

export default router;
