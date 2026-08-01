import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, incomesTable, expensesTable } from "@workspace/db";

const router = Router();

// GET /incomes
router.get("/incomes", async (req, res) => {
  const incomes = await db.select().from(incomesTable).orderBy(incomesTable.month);
  res.json(incomes);
});

// POST /incomes
router.post("/incomes", async (req, res) => {
  const { source, projectedAmount, actualAmount, confidence, month, notes } = req.body;
  const [income] = await db.insert(incomesTable).values({
    source,
    projectedAmount: Number(projectedAmount),
    actualAmount: actualAmount != null ? Number(actualAmount) : null,
    confidence: confidence ?? "MEDIUM",
    month,
    notes: notes ?? null,
  }).returning();
  res.status(201).json(income);
});

// PUT /incomes/:id
router.put("/incomes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { source, projectedAmount, actualAmount, confidence, month, notes } = req.body;
  const [income] = await db.update(incomesTable)
    .set({
      source,
      projectedAmount: Number(projectedAmount),
      actualAmount: actualAmount != null ? Number(actualAmount) : null,
      confidence,
      month,
      notes: notes ?? null,
    })
    .where(eq(incomesTable.id, id))
    .returning();
  if (!income) return res.status(404).json({ error: "Income not found" });
  res.json(income);
});

// DELETE /incomes/:id
router.delete("/incomes/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(incomesTable).where(eq(incomesTable.id, id));
  res.status(204).end();
});

// GET /incomes/projection-summary
router.get("/incomes/projection-summary", async (req, res) => {
  const incomes = await db.select().from(incomesTable);
  const expenses = await db.select().from(expensesTable);

  const confidenceLevels = ["HIGH", "MEDIUM", "LOW"];
  const weights: Record<string, number> = { HIGH: 1.0, MEDIUM: 0.65, LOW: 0.3 };

  const totalProjected = incomes.reduce((s, i) => s + i.projectedAmount, 0);
  const totalActual = incomes.filter(i => i.actualAmount != null).reduce((s, i) => s + (i.actualAmount ?? 0), 0);
  const confidenceWeightedProjected = incomes.reduce((s, i) => s + i.projectedAmount * (weights[i.confidence] ?? 0.5), 0);

  const byConfidence = confidenceLevels.map(conf => {
    const group = incomes.filter(i => i.confidence === conf);
    return {
      confidence: conf,
      projected: group.reduce((s, i) => s + i.projectedAmount, 0),
      actual: group.filter(i => i.actualAmount != null).reduce((s, i) => s + (i.actualAmount ?? 0), 0),
      count: group.length,
    };
  });

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const incomeVsExpenseGap = confidenceWeightedProjected - totalExpenses;

  res.json({ totalProjected, totalActual, confidenceWeightedProjected, byConfidence, incomeVsExpenseGap });
});

export default router;
