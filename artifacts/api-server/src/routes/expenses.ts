import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, expensesTable, balanceTransactionsTable, profileTable } from "@workspace/db";

const router = Router();
const CATEGORIES = ["housing", "food", "transport", "utilities", "health", "miscellaneous"] as const;
const TRIGGERS = ["routine", "stress_buying", "status_validation", "burnout_convenience"] as const;
type EmotionalTrigger = (typeof TRIGGERS)[number];
type ExpenseInputBody = { category: string; name: string; amount: number; isEssential: boolean; emotionalTrigger?: EmotionalTrigger | null; isImpulseBuy?: boolean; };
function isCategory(value: unknown): value is (typeof CATEGORIES)[number] { return typeof value === "string" && CATEGORIES.includes(value as (typeof CATEGORIES)[number]); }
function isTrigger(value: unknown): value is EmotionalTrigger { return typeof value === "string" && TRIGGERS.includes(value as EmotionalTrigger); }
function isNonNegativeAmount(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function isExpenseInput(body: Record<string, unknown>): body is ExpenseInputBody {
  return isCategory(body.category) && typeof body.name === "string" && body.name.trim().length > 0 && isNonNegativeAmount(body.amount) && typeof body.isEssential === "boolean" && (body.emotionalTrigger === undefined || body.emotionalTrigger === null || isTrigger(body.emotionalTrigger)) && (body.isImpulseBuy === undefined || typeof body.isImpulseBuy === "boolean");
}

router.get("/expenses", async (req, res) => {
  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id)).orderBy(expensesTable.category);
  res.json(expenses);
});

router.post("/expenses", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!isExpenseInput(body)) { res.status(400).json({ error: "Invalid expense input" }); return; }
  const { category, name, amount, isEssential, emotionalTrigger, isImpulseBuy } = body;
  const result = await db.transaction(async (tx) => {
    const [profile] = await tx.select().from(profileTable).where(eq(profileTable.ownerId, req.user!.id));
    const balance = profile?.currentBalance ?? 0;
    if (balance < amount) throw new Error("Недостаточно денег на текущем балансе");
    const [expense] = await tx.insert(expensesTable).values({ ownerId: req.user!.id, category, name: name.trim(), amount, isEssential, emotionalTrigger: emotionalTrigger ?? null, isImpulseBuy: isImpulseBuy ?? false }).returning();
    if (profile) await tx.update(profileTable).set({ currentBalance: balance - amount, updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
    else await tx.insert(profileTable).values({ ownerId: req.user!.id, currentSavings: 0, currentBalance: -amount, crisisMode: false });
    await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: -amount, type: "expense", sourceId: expense.id, sourceType: "expense", category, note: name.trim() });
    return expense;
  });
  res.status(201).json(result);
});

router.put("/expenses/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  if (!Number.isInteger(id) || id <= 0 || !isExpenseInput(body)) { res.status(400).json({ error: "Invalid expense input" }); return; }
  const { category, name, amount, isEssential, emotionalTrigger, isImpulseBuy } = body;
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(expensesTable).where(and(eq(expensesTable.id, id), eq(expensesTable.ownerId, req.user!.id)));
    const [profile] = await tx.select().from(profileTable).where(eq(profileTable.ownerId, req.user!.id));
    if (!existing || !profile) return null;
    const delta = existing.amount - amount;
    if (profile.currentBalance + delta < 0) throw new Error("Недостаточно денег на текущем балансе");
    const [expense] = await tx.update(expensesTable).set({ category, name: name.trim(), amount, isEssential, ...(emotionalTrigger !== undefined ? { emotionalTrigger: emotionalTrigger ?? null } : {}), ...(isImpulseBuy !== undefined ? { isImpulseBuy } : {}) }).where(and(eq(expensesTable.id, id), eq(expensesTable.ownerId, req.user!.id))).returning();
    await tx.update(profileTable).set({ currentBalance: profile.currentBalance + delta, updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
    await tx.update(balanceTransactionsTable).set({ amount: -amount, category, note: name.trim() }).where(and(eq(balanceTransactionsTable.sourceType, "expense"), eq(balanceTransactionsTable.sourceId, id), eq(balanceTransactionsTable.ownerId, req.user!.id)));
    return expense;
  });
  if (!result) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json(result);
});

router.delete("/expenses/:id", async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.transaction(async (tx) => {
    const [expense] = await tx.select().from(expensesTable).where(and(eq(expensesTable.id, id), eq(expensesTable.ownerId, req.user!.id)));
    const [profile] = await tx.select().from(profileTable).where(eq(profileTable.ownerId, req.user!.id));
    if (!expense || !profile) return null;
    await tx.delete(expensesTable).where(and(eq(expensesTable.id, id), eq(expensesTable.ownerId, req.user!.id)));
    await tx.update(profileTable).set({ currentBalance: profile.currentBalance + expense.amount, updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
    await tx.delete(balanceTransactionsTable).where(and(eq(balanceTransactionsTable.sourceType, "expense"), eq(balanceTransactionsTable.sourceId, id), eq(balanceTransactionsTable.ownerId, req.user!.id)));
    return expense;
  });
  if (!result) { res.status(404).json({ error: "Expense not found" }); return; }
  res.status(204).end();
});

router.get("/expenses/burn-rate", async (req, res) => {
  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id));
  const categories = ["housing", "food", "transport", "utilities", "health", "miscellaneous"];
  const byCategory = categories.map(cat => { const catExpenses = expenses.filter(e => e.category === cat); const essentialAmount = catExpenses.filter(e => e.isEssential).reduce((s, e) => s + e.amount, 0); const variableAmount = catExpenses.filter(e => !e.isEssential).reduce((s, e) => s + e.amount, 0); return { category: cat, total: essentialAmount + variableAmount, essentialAmount, variableAmount }; }).filter(c => c.total > 0);
  const totalMonthly = expenses.reduce((s, e) => s + e.amount, 0);
  const essentialTotal = expenses.filter(e => e.isEssential).reduce((s, e) => s + e.amount, 0);
  const variableTotal = expenses.filter(e => !e.isEssential).reduce((s, e) => s + e.amount, 0);
  res.json({ totalMonthly, essentialTotal, variableTotal, byCategory });
});

export default router;
