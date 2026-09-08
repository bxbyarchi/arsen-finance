import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, expensesTable, balanceTransactionsTable } from "@workspace/db";

const router = Router();
const CATEGORIES = ["housing", "food", "transport", "utilities", "health", "miscellaneous"] as const;
const TRIGGERS = ["routine", "stress_buying", "status_validation", "burnout_convenience"] as const;
type EmotionalTrigger = (typeof TRIGGERS)[number];
type ExpenseInputBody = { category: string; name: string; amount: number; frequency?: "daily" | "monthly"; isEssential: boolean; emotionalTrigger?: EmotionalTrigger | null; isImpulseBuy?: boolean; };
function isCategory(value: unknown): value is (typeof CATEGORIES)[number] { return typeof value === "string" && CATEGORIES.includes(value as (typeof CATEGORIES)[number]); }
function isTrigger(value: unknown): value is EmotionalTrigger { return typeof value === "string" && TRIGGERS.includes(value as EmotionalTrigger); }
function isNonNegativeAmount(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function isExpenseInput(body: Record<string, unknown>): body is ExpenseInputBody {
  return isCategory(body.category) && typeof body.name === "string" && body.name.trim().length > 0 && isNonNegativeAmount(body.amount) && (body.frequency === undefined || body.frequency === "daily" || body.frequency === "monthly") && typeof body.isEssential === "boolean" && (body.emotionalTrigger === undefined || body.emotionalTrigger === null || isTrigger(body.emotionalTrigger)) && (body.isImpulseBuy === undefined || typeof body.isImpulseBuy === "boolean");
}

router.get("/expenses", async (req, res) => {
  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id)).orderBy(expensesTable.category);
  res.json(expenses);
});

// Regular expenses are a planning/forecast layer. They must not move the current balance.
// Actual spending is recorded separately through balance transactions (including Telegram bookkeeping).
router.post("/expenses", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!isExpenseInput(body)) { res.status(400).json({ error: "Invalid expense input" }); return; }
  const { category, name, amount, frequency = "monthly", isEssential, emotionalTrigger, isImpulseBuy } = body;
  const [expense] = await db.insert(expensesTable).values({ ownerId: req.user!.id, category, name: name.trim(), amount, frequency, isEssential, emotionalTrigger: emotionalTrigger ?? null, isImpulseBuy: isImpulseBuy ?? false }).returning();
  res.status(201).json(expense);
});

router.put("/expenses/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  if (!Number.isInteger(id) || id <= 0 || !isExpenseInput(body)) { res.status(400).json({ error: "Invalid expense input" }); return; }
  const { category, name, amount, frequency = "monthly", isEssential, emotionalTrigger, isImpulseBuy } = body;
  const [expense] = await db.update(expensesTable).set({ category, name: name.trim(), amount, frequency, isEssential, ...(emotionalTrigger !== undefined ? { emotionalTrigger: emotionalTrigger ?? null } : {}), ...(isImpulseBuy !== undefined ? { isImpulseBuy } : {}) }).where(and(eq(expensesTable.id, id), eq(expensesTable.ownerId, req.user!.id))).returning();
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json(expense);
});

router.delete("/expenses/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [expense] = await db.delete(expensesTable).where(and(eq(expensesTable.id, id), eq(expensesTable.ownerId, req.user!.id))).returning();
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  // Remove any legacy ledger row created by older versions that incorrectly treated a plan as an actual spend.
  await db.delete(balanceTransactionsTable).where(and(eq(balanceTransactionsTable.sourceType, "expense"), eq(balanceTransactionsTable.sourceId, id), eq(balanceTransactionsTable.ownerId, req.user!.id)));
  res.status(204).end();
});

router.get("/expenses/burn-rate", async (req, res) => {
  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id));
  const categories = ["housing", "food", "transport", "utilities", "health", "miscellaneous"];
  const normalized = expenses.map(e => ({ ...e, monthlyAmount: e.frequency === "daily" ? e.amount * 30 : e.amount }));
  const byCategory = categories.map(cat => { const catExpenses = normalized.filter(e => e.category === cat); const essentialAmount = catExpenses.filter(e => e.isEssential).reduce((s, e) => s + e.monthlyAmount, 0); const variableAmount = catExpenses.filter(e => !e.isEssential).reduce((s, e) => s + e.monthlyAmount, 0); return { category: cat, total: essentialAmount + variableAmount, essentialAmount, variableAmount }; }).filter(c => c.total > 0);
  const totalMonthly = normalized.reduce((s, e) => s + e.monthlyAmount, 0);
  const essentialTotal = normalized.filter(e => e.isEssential).reduce((s, e) => s + e.monthlyAmount, 0);
  const variableTotal = normalized.filter(e => !e.isEssential).reduce((s, e) => s + e.monthlyAmount, 0);
  const totalDaily = expenses.reduce((s, e) => s + (e.frequency === "daily" ? e.amount : e.amount / 30), 0);
  res.json({ totalMonthly, essentialTotal, variableTotal, totalDaily, byCategory });
});

export default router;
