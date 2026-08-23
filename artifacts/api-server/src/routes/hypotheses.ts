import { Router } from "express";
import { db, businessHypothesesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

const router = Router();
const STATUSES = ["learning_zone", "performance_zone", "archived"] as const;
type HypothesisStatus = (typeof STATUSES)[number];

function isStatus(value: unknown): value is HypothesisStatus {
  return typeof value === "string" && STATUSES.includes(value as HypothesisStatus);
}

function amount(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// GET /hypotheses
router.get("/hypotheses", async (req, res) => {
  const hypotheses = await db.select().from(businessHypothesesTable)
    .where(eq(businessHypothesesTable.ownerId, req.user!.id))
    .orderBy(desc(businessHypothesesTable.createdAt));
  res.json(hypotheses);
});

// POST /hypotheses
router.post("/hypotheses", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const projectedBudget = amount(body.projectedBudget ?? 0);
  const actualRiskImpact = amount(body.actualRiskImpact ?? 0);
  const status = body.status === undefined ? "learning_zone" : body.status;
  if (!title || projectedBudget === null || actualRiskImpact === null || !isStatus(status)) {
    res.status(400).json({ error: "title, valid non-negative amounts, and a valid status are required" });
    return;
  }
  const [created] = await db.insert(businessHypothesesTable).values({
    ownerId: req.user!.id, title, status, projectedBudget, actualRiskImpact,
    keyLessons: typeof body.keyLessons === "string" ? body.keyLessons.trim() || null : null,
  }).returning();
  res.status(201).json(created);
});

// PATCH /hypotheses/:id
router.patch("/hypotheses/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof businessHypothesesTable.$inferInsert> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      res.status(400).json({ error: "title must not be blank" });
      return;
    }
    updates.title = body.title.trim();
  }
  if (body.status !== undefined) {
    if (!isStatus(body.status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    updates.status = body.status;
  }
  for (const field of ["projectedBudget", "actualRiskImpact"] as const) {
    if (body[field] !== undefined) {
      const parsed = amount(body[field]);
      if (parsed === null) {
        res.status(400).json({ error: `${field} must be a non-negative finite number` });
        return;
      }
      updates[field] = parsed;
    }
  }
  if (body.keyLessons !== undefined) {
    updates.keyLessons = typeof body.keyLessons === "string" ? body.keyLessons.trim() || null : null;
  }
  const [updated] = await db.update(businessHypothesesTable)
    .set(updates)
    .where(and(eq(businessHypothesesTable.id, id), eq(businessHypothesesTable.ownerId, req.user!.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Hypothesis not found" });
    return;
  }
  res.json(updated);
});

// POST /hypotheses/:id/reflection — Beyoncé Loop
router.post("/hypotheses/:id/reflection", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const worked = typeof body.worked === "string" ? body.worked.trim() : "";
  const failed = typeof body.failed === "string" ? body.failed.trim() : "";
  const adjust = typeof body.adjust === "string" ? body.adjust.trim() : "";
  const keyLessons = typeof body.keyLessons === "string" ? body.keyLessons.trim() : "";
  const reflection = [
    worked ? `Что сработало: ${worked}` : "",
    failed ? `Что не сработало: ${failed}` : "",
    adjust ? `Что изменить: ${adjust}` : "",
    keyLessons ? `Главный урок: ${keyLessons}` : "",
  ].filter(Boolean).join("\n");
  if (!reflection) {
    res.status(400).json({ error: "At least one reflection field is required" });
    return;
  }
  const [updated] = await db.update(businessHypothesesTable)
    .set({ keyLessons: reflection, status: "archived" })
    .where(and(eq(businessHypothesesTable.id, id), eq(businessHypothesesTable.ownerId, req.user!.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Hypothesis not found" });
    return;
  }
  res.json(updated);
});

// DELETE /hypotheses/:id
router.delete("/hypotheses/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db.delete(businessHypothesesTable)
    .where(and(eq(businessHypothesesTable.id, id), eq(businessHypothesesTable.ownerId, req.user!.id)))
    .returning({ id: businessHypothesesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Hypothesis not found" });
    return;
  }
  res.status(204).send();
});

export default router;