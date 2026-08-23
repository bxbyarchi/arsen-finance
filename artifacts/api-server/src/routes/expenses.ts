import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, expensesTable } from "@workspace/db";

const router = Router();
const CATEGORIES = ["housing", "food", "transport", "utilities", "health", "miscellaneous"] as const;
const TRIGGERS = ["routine", "stress_buying", "status_validation", "burnout_convenience"] as const;
type EmotionalTrigger = (typeof TRIGGERS)[number];
type ExpenseInputBody = {
  category: string;
  name: string;
  amount: number;
  isEssential: boolean;
  emotionalTrigger?: EmotionalTrigger | null;
  isImpulseBuy?: boolean;
};

function isCategory(value: unknown): value is (typeof CATEGORIES)[number] {
  return typeof value === "string" && CATEGORIES.includes(value as (typeof CATEGORIES)[number]);
}

function isTrigger(value: unknown): value is EmotionalTrigger {
  return typeof value === "string" && TRIGGERS.includes(value as EmotionalTrigger);
}

function isNonNegativeAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isExpenseInput(body: Record<string, unknown>): body is ExpenseInputBody {
  return isCategory(body.category)
    && typeof body.name === "string"
    && body.name.trim().length > 0
    && isNonNegativeAmount(body.amount)
    && typeof body.isEssential === "boolean"
    && (body.emotionalTrigger === undefined || body.emotionalTrigger === null || isTrigger(body.emotionalTrigger))
    && (body.isImpulseBuy === undefined || typeof body.isImpulseBuy === "boolean");
}

// GET /expenses
router.get("/expenses", async (req, res) => {
  const expenses = await db.select().from(expensesTable)
    .where(eq(expensesTable.ownerId, req.user!.id))
    .orderBy(expensesTable.category);
  res.json(expenses);
});

// POST /expenses
router.post("/expenses", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!isExpenseInput(body)) {
    res.status(400).json({ error: "Invalid expense input" });
    return;
  }
  const { category, name, amount, isEssential, emotionalTrigger, isImpulseBuy } = body;
  const [expense] = await db.insert(expensesTable).values({
    ownerId: req.user!.id,
    category,
    name: name.trim(),
    amount,
    isEssential,
    emotionalTrigger: emotionalTrigger ?? null,
    isImpulseBuy: isImpulseBuy ?? false,
  }).returning();
  res.status(201).json(expense);
});

// PUT /expenses/:id
router.put("/expenses/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  if (!Number.isInteger(id) || id <= 0 || !isExpenseInput(body)) {
    res.status(400).json({ error: "Invalid expense input" });
    return;
  }
  const { category, name, amount, isEssential, emotionalTrigger, isImpulseBuy } = body;
  const updates = {
    category,
    name: name.trim(),
    amount,
    isEssential,
    ...(emotionalTrigger !== undefined ? { emotionalTrigger: emotionalTrigger ?? null } : {}),
    ...(isImpulseBuy !== undefined ? { isImpulseBuy } : {}),
  };
  const [expense] = await db.update(expensesTable)
    .set(updates)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.ownerId, req.user!.id)))
    .returning();
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json(expense);
});

// DELETE /expenses/:id
router.delete("/expenses/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [deleted] = await db.delete(expensesTable)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.ownerId, req.user!.id)))
    .returning({ id: expensesTable.id });
  if (!deleted) { res.status(404).json({ error: "Expense not found" }); return; }
  res.status(204).end();
});

// GET /expenses/burn-rate
router.get("/expenses/burn-rate", async (req, res) => {
  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id));

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
