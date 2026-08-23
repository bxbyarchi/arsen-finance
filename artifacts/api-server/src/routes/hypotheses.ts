import { Router } from "express";
import { db, businessHypothesesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { evaluateHypothesis } from "../services/hypothesisEvaluation";

const router = Router();
const STATUSES = ["learning_zone", "performance_zone", "archived"] as const;
type HypothesisStatus = (typeof STATUSES)[number];

function isStatus(value: unknown): value is HypothesisStatus {
  return typeof value === "string" && STATUSES.includes(value as HypothesisStatus);
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

async function persistEvaluation(ownerId: string, hypothesis: typeof businessHypothesesTable.$inferSelect) {
  const evaluation = await evaluateHypothesis(ownerId, {
    projectedBudget: hypothesis.projectedBudget,
    expectedMonthlyRevenue: hypothesis.expectedMonthlyRevenue,
    expectedMonthlyCosts: hypothesis.expectedMonthlyCosts,
  });
  const [updated] = await db.update(businessHypothesesTable)
    .set({
      stressTestRevenue: evaluation.stressTestRevenue,
      stressTestCosts: evaluation.stressTestCosts,
      conservativePaybackMonths: evaluation.conservativePaybackMonths,
      marginOfSafety: evaluation.marginOfSafety,
      riskRating: evaluation.riskRating,
      evaluatedAt: new Date(),
    })
    .where(and(eq(businessHypothesesTable.id, hypothesis.id), eq(businessHypothesesTable.ownerId, ownerId)))
    .returning();
  return { hypothesis: updated!, evaluation };
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
  const expectedMonthlyRevenue = amount(body.expectedMonthlyRevenue ?? 0);
  const expectedMonthlyCosts = amount(body.expectedMonthlyCosts ?? 0);
  const status = body.status === undefined ? "learning_zone" : body.status;
  if (!title || projectedBudget === null || actualRiskImpact === null || expectedMonthlyRevenue === null || expectedMonthlyCosts === null || !isStatus(status)) {
    res.status(400).json({ error: "title, valid non-negative amounts, and a valid status are required" });
    return;
  }
  const [created] = await db.insert(businessHypothesesTable).values({
    ownerId: req.user!.id, title, status, projectedBudget, actualRiskImpact, expectedMonthlyRevenue, expectedMonthlyCosts,
    keyLessons: typeof body.keyLessons === "string" ? body.keyLessons.trim() || null : null,
  }).returning();
  const evaluated = await persistEvaluation(req.user!.id, created);
  res.status(201).json(evaluated.hypothesis);
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
  let needsReevaluation = false;
  for (const field of ["projectedBudget", "actualRiskImpact", "expectedMonthlyRevenue", "expectedMonthlyCosts"] as const) {
    if (body[field] !== undefined) {
      const parsed = amount(body[field]);
      if (parsed === null) {
        res.status(400).json({ error: `${field} must be a non-negative finite number` });
        return;
      }
      updates[field] = parsed;
      if (field !== "actualRiskImpact") needsReevaluation = true;
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
  if (!needsReevaluation) {
    res.json(updated);
    return;
  }
  const evaluated = await persistEvaluation(req.user!.id, updated);
  res.json(evaluated.hypothesis);
});

// POST /hypotheses/evaluate — Graham Margin of Safety + Taleb Barbell check
router.post("/hypotheses/evaluate", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const hypothesisId = body.hypothesisId;
  if (hypothesisId !== undefined) {
    if (typeof hypothesisId !== "number" || !Number.isInteger(hypothesisId) || hypothesisId <= 0) {
      res.status(400).json({ error: "hypothesisId must be a positive integer" });
      return;
    }
    const [existing] = await db.select().from(businessHypothesesTable)
      .where(and(eq(businessHypothesesTable.id, hypothesisId), eq(businessHypothesesTable.ownerId, req.user!.id)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Hypothesis not found" });
      return;
    }
    const projectedBudget = body.projectedBudget === undefined ? existing.projectedBudget : amount(body.projectedBudget);
    const expectedMonthlyRevenue = body.expectedMonthlyRevenue === undefined ? existing.expectedMonthlyRevenue : amount(body.expectedMonthlyRevenue);
    const expectedMonthlyCosts = body.expectedMonthlyCosts === undefined ? existing.expectedMonthlyCosts : amount(body.expectedMonthlyCosts);
    if (projectedBudget === null || expectedMonthlyRevenue === null || expectedMonthlyCosts === null) {
      res.status(400).json({ error: "Financial assumptions must be non-negative finite numbers" });
      return;
    }
    const [withInputs] = await db.update(businessHypothesesTable)
      .set({ projectedBudget, expectedMonthlyRevenue, expectedMonthlyCosts })
      .where(and(eq(businessHypothesesTable.id, hypothesisId), eq(businessHypothesesTable.ownerId, req.user!.id)))
      .returning();
    const evaluated = await persistEvaluation(req.user!.id, withInputs);
    res.json(evaluated);
    return;
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const projectedBudget = amount(body.projectedBudget);
  const expectedMonthlyRevenue = amount(body.expectedMonthlyRevenue);
  const expectedMonthlyCosts = amount(body.expectedMonthlyCosts);
  if (!title || projectedBudget === null || expectedMonthlyRevenue === null || expectedMonthlyCosts === null) {
    res.status(400).json({ error: "title, projectedBudget, expectedMonthlyRevenue, and expectedMonthlyCosts are required" });
    return;
  }
  const [created] = await db.insert(businessHypothesesTable).values({
    ownerId: req.user!.id,
    title,
    projectedBudget,
    expectedMonthlyRevenue,
    expectedMonthlyCosts,
    actualRiskImpact: 0,
    status: "learning_zone",
  }).returning();
  const evaluated = await persistEvaluation(req.user!.id, created);
  res.status(201).json(evaluated);
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