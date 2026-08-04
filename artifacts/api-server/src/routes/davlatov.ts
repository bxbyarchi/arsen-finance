import { Router } from "express";
import { db, davlatovAllocationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const VALID_SOURCE_TYPES = new Set(["dividend", "personal_income"]);

// POST /davlatov/allocate
router.post("/davlatov/allocate", async (req, res) => {
  const { sourceAmount, sourceType, charityPct: rawCharityPct, notes } = req.body;

  const amount = Number(sourceAmount);
  if (!isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "sourceAmount must be a positive finite number" });
    return;
  }
  if (!sourceType || !VALID_SOURCE_TYPES.has(sourceType)) {
    res.status(400).json({ error: "sourceType must be 'dividend' or 'personal_income'" });
    return;
  }

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

  const [allocation] = await db.insert(davlatovAllocationsTable).values({
    sourceType, sourceAmount: amount, charityPct,
    charityAmt, parentsAmt, savingsAmt, entertainmentAmt,
    largeDreamAmt, smallDreamAmt,
    notes: notes || null,
  }).returning();

  res.status(201).json(allocation);
});

// GET /davlatov/allocations
router.get("/davlatov/allocations", async (req, res) => {
  const allocations = await db.select().from(davlatovAllocationsTable).orderBy(desc(davlatovAllocationsTable.createdAt));
  res.json(allocations);
});

// DELETE /davlatov/allocations/:id
router.delete("/davlatov/allocations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(davlatovAllocationsTable).where(eq(davlatovAllocationsTable.id, id));
  res.status(204).send();
});

export default router;
