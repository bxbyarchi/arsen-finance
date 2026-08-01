import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, expensesTable } from "@workspace/db";

const router = Router();

// GET /expenses
router.get("/expenses", async (req, res) => {
  const expenses = await db.select().from(expensesTable).orderBy(expensesTable.category);
  res.json(expenses);
});

// POST /expenses
router.post("/expenses", async (req, res) => {
  const { category, name, amount, isEssential } = req.body;
  const [expense] = await db.insert(expensesTable).values({
    category,
    name,
    amount: Number(amount),
    isEssential: Boolean(isEssential),
  }).returning();
  res.status(201).json(expense);
});

// PUT /expenses/:id
router.put("/expenses/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { category, name, amount, isEssential } = req.body;
  const [expense] = await db.update(expensesTable)
    .set({ category, name, amount: Number(amount), isEssential: Boolean(isEssential) })
    .where(eq(expensesTable.id, id))
    .returning();
  if (!expense) return res.status(404).json({ error: "Expense not found" });
  res.json(expense);
});

// DELETE /expenses/:id
router.delete("/expenses/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  res.status(204).end();
});

// GET /expenses/burn-rate
router.get("/expenses/burn-rate", async (req, res) => {
  const expenses = await db.select().from(expensesTable);

  const categories = ["housing", "food", "transport", "utilities", "health", "miscellaneous"];
  const byCategory = categories.map(cat => {
    const catExpenses = expenses.filter(e => e.category === cat);
    const essentialAmount = catExpenses.filter(e => e.isEssential).reduce((s, e) => s + e.amount, 0);
    const variableAmount = catExpenses.filter(e => !e.isEssential).reduce((s, e) => s + e.amount, 0);
    return {
      category: cat,
      total: essentialAmount + variableAmount,
      essentialAmount,
      variableAmount,
    };
  }).filter(c => c.total > 0);

  const totalMonthly = expenses.reduce((s, e) => s + e.amount, 0);
  const essentialTotal = expenses.filter(e => e.isEssential).reduce((s, e) => s + e.amount, 0);
  const variableTotal = expenses.filter(e => !e.isEssential).reduce((s, e) => s + e.amount, 0);

  res.json({ totalMonthly, essentialTotal, variableTotal, byCategory });
});

export default router;
