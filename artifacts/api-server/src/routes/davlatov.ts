import { Router } from "express";
import { db, davlatovAllocationsTable, balanceTransactionsTable, profileTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";

const router = Router();

const VALID_SOURCE_TYPES = new Set(["dividend", "personal_income"]);

async function ensureProfile(ownerId: string) {
  const [existing] = await db.select().from(profileTable).where(eq(profileTable.ownerId, ownerId));
  if (existing) return existing;
  const [created] = await db.insert(profileTable).values({ ownerId, currentSavings: 0, currentBalance: 0, crisisMode: false }).returning();
  return created;
}

// POST /davlatov/allocate — allocate money already present on the current balance
router.post("/davlatov/allocate", async (req, res) => {
  const { sourceAmount, sourceType, charityPct: rawCharityPct, notes } = req.body;
  const amount = Number(sourceAmount);
  if (!isFinite(amount) || amount <= 0) { res.status(400).json({ error: "sourceAmount must be a positive finite number" }); return; }
  if (!sourceType || !VALID_SOURCE_TYPES.has(sourceType)) { res.status(400).json({ error: "sourceType must be 'dividend' or 'personal_income'" }); return; }

  const rawPct = Number(rawCharityPct ?? 10);
  const charityPct = isFinite(rawPct) ? Math.min(10, Math.max(2.5, rawPct)) : 10;
  const charityAmt = Math.round(amount * (charityPct / 100) * 100) / 100;
  const parentsAmt = Math.round(amount * 0.10 * 100) / 100;
  const savingsAmt = Math.round(amount * 0.10 * 100) / 100;
  const entertainmentAmt = Math.round(amount * 0.10 * 100) / 100;
  const distributed = charityAmt + parentsAmt + savingsAmt + entertainmentAmt;
  const remaining = Math.max(0, amount - distributed);
  const largeDreamAmt = Math.round(remaining * 0.50 * 100) / 100;
  const smallDreamAmt = Math.round(remaining * 0.50 * 100) / 100;

  const profile = await ensureProfile(req.user!.id);
  const newBalance = Math.round((profile.currentBalance - amount) * 100) / 100;
  if (newBalance < -0.01) { res.status(400).json({ error: "Недостаточно денег на текущем балансе" }); return; }

  const allocation = await db.transaction(async (tx) => {
    const [created] = await tx.insert(davlatovAllocationsTable).values({
      ownerId: req.user!.id, sourceType, sourceAmount: amount, charityPct,
      charityAmt, parentsAmt, savingsAmt, entertainmentAmt, largeDreamAmt, smallDreamAmt,
      notes: notes || null,
    }).returning();
    await tx.update(profileTable).set({ currentBalance: Math.max(0, newBalance), updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
    await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: -amount, type: "davlatov_allocation", sourceId: created.id, sourceType: "davlatov", category: "money_allocation", note: `Распределение по методу Давлатова: ${amount.toLocaleString("ru-RU")} сом` });
    return created;
  });

  res.status(201).json({ ...allocation, balance: Math.max(0, newBalance) });
});

// GET /davlatov/allocations
router.get("/davlatov/allocations", async (req, res) => {
  const allocations = await db.select().from(davlatovAllocationsTable)
    .where(eq(davlatovAllocationsTable.ownerId, req.user!.id))
    .orderBy(desc(davlatovAllocationsTable.createdAt));
  res.json(allocations);
});

// DELETE /davlatov/allocations/:id — undo allocation and return money to balance
router.delete("/davlatov/allocations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  const [allocation] = await db.select().from(davlatovAllocationsTable).where(and(eq(davlatovAllocationsTable.id, id), eq(davlatovAllocationsTable.ownerId, req.user!.id)));
  if (!allocation) { res.status(404).json({ error: "Allocation not found" }); return; }
  const profile = await ensureProfile(req.user!.id);
  const newBalance = Math.round((profile.currentBalance + allocation.sourceAmount) * 100) / 100;
  await db.transaction(async (tx) => {
    await tx.delete(davlatovAllocationsTable).where(and(eq(davlatovAllocationsTable.id, id), eq(davlatovAllocationsTable.ownerId, req.user!.id)));
    await tx.update(profileTable).set({ currentBalance: newBalance, updatedAt: new Date() }).where(eq(profileTable.id, profile.id));
    await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: allocation.sourceAmount, type: "davlatov_reversal", sourceId: id, sourceType: "davlatov", category: "money_allocation", note: `Отмена распределения Давлатова: ${allocation.sourceAmount.toLocaleString("ru-RU")} сом` });
  });
  res.status(204).send();
});

export default router;
