import { Router } from "express";
import {
  db,
  digitalVaultDocsTable,
  userFinancialProfilesTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

const router = Router();

const CATEGORIES = ["bank_account", "tax_file", "contract", "emergency_plan"] as const;
type DocCategory = (typeof CATEGORIES)[number];
const MONEY_SCRIPTS = ["avoidance", "worship", "status", "vigilance"] as const;

function isCategory(value: unknown): value is DocCategory {
  return typeof value === "string" && CATEGORIES.includes(value as DocCategory);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function publicDoc(doc: typeof digitalVaultDocsTable.$inferSelect) {
  return {
    id: doc.id,
    docCategory: doc.docCategory,
    title: doc.title,
    lastVerifiedAt: doc.lastVerifiedAt,
    createdAt: doc.createdAt,
  };
}

async function ensureFinancialProfile(userId: string) {
  const [existing] = await db.select().from(userFinancialProfilesTable)
    .where(eq(userFinancialProfilesTable.userId, userId));
  if (existing) return existing;
  const [created] = await db.insert(userFinancialProfilesTable).values({
    userId,
    moneyScriptType: "vigilance",
    riskToleranceIndex: 50,
    autonomyScore: 0,
  }).returning();
  return created;
}

async function getAutonomySummary(userId: string) {
  const docs = await db.select().from(digitalVaultDocsTable)
    .where(eq(digitalVaultDocsTable.ownerId, userId))
    .orderBy(desc(digitalVaultDocsTable.createdAt));
  const now = Date.now();
  const staleAfterMs = 60 * 24 * 60 * 60 * 1000;
  const warnings: string[] = [];
  const categoryStatus = CATEGORIES.map((category) => {
    const doc = docs.find((item) => item.docCategory === category);
    const ageMs = doc?.lastVerifiedAt ? now - doc.lastVerifiedAt.getTime() : Number.POSITIVE_INFINITY;
    const verified = Boolean(doc?.lastVerifiedAt && ageMs <= staleAfterMs);
    const stale = Boolean(doc && !verified);
    if (!doc) warnings.push(`Не добавлен документ: ${category}`);
    else if (stale) warnings.push(`Нужно проверить документ: ${category} (более 60 дней)`);
    return {
      category,
      present: Boolean(doc),
      verified,
      stale,
      lastVerifiedAt: doc?.lastVerifiedAt ?? null,
    };
  });
  const autonomyScore = Math.round(categoryStatus.reduce((sum, item) => sum + (item.verified ? 25 : item.present ? 10 : 0), 0));
  const profile = await ensureFinancialProfile(userId);
  if (profile.autonomyScore !== autonomyScore) {
    await db.update(userFinancialProfilesTable)
      .set({ autonomyScore, updatedAt: new Date() })
      .where(eq(userFinancialProfilesTable.userId, profile.userId));
  }
  return {
    documents: docs.map(publicDoc),
    autonomyScore,
    warnings,
    categoryStatus,
  };
}

// GET /financial-profile
router.get("/financial-profile", async (req, res) => {
  const profile = await ensureFinancialProfile(req.user!.id);
  res.json(profile);
});

// PATCH /financial-profile
router.patch("/financial-profile", async (req, res) => {
  const profile = await ensureFinancialProfile(req.user!.id);
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof profile> = {};

  if (body.moneyScriptType !== undefined) {
    if (!MONEY_SCRIPTS.includes(body.moneyScriptType as typeof MONEY_SCRIPTS[number])) {
      res.status(400).json({ error: "Invalid moneyScriptType" });
      return;
    }
    updates.moneyScriptType = body.moneyScriptType as string;
  }
  if (body.riskToleranceIndex !== undefined) {
    const risk = Number(body.riskToleranceIndex);
    if (!Number.isFinite(risk) || risk < 0 || risk > 100) {
      res.status(400).json({ error: "riskToleranceIndex must be between 0 and 100" });
      return;
    }
    updates.riskToleranceIndex = risk;
  }
  const [updated] = await db.update(userFinancialProfilesTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(userFinancialProfilesTable.userId, profile.userId))
    .returning();
  res.json(updated);
});

// GET /vault
router.get("/vault", async (req, res) => {
  res.json(await getAutonomySummary(req.user!.id));
});

// POST /vault
router.post("/vault", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const docCategory = body.docCategory;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const encryptedPayload = typeof body.encryptedPayload === "string" ? body.encryptedPayload : "";
  if (!isCategory(docCategory) || !title || !encryptedPayload) {
    res.status(400).json({ error: "docCategory, title, and encryptedPayload are required" });
    return;
  }
  const lastVerifiedAt = body.lastVerifiedAt === undefined || body.lastVerifiedAt === null
    ? null
    : isValidDate(body.lastVerifiedAt) ? new Date(body.lastVerifiedAt) : null;
  if (body.lastVerifiedAt !== undefined && body.lastVerifiedAt !== null && !lastVerifiedAt) {
    res.status(400).json({ error: "lastVerifiedAt must be a valid date" });
    return;
  }
  const [created] = await db.insert(digitalVaultDocsTable).values({
    ownerId: req.user!.id, docCategory, title, encryptedPayload, lastVerifiedAt,
  }).returning();
  res.status(201).json(publicDoc(created));
});

// PATCH /vault/:id
router.patch("/vault/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof digitalVaultDocsTable.$inferInsert> = {};
  if (body.docCategory !== undefined) {
    if (!isCategory(body.docCategory)) {
      res.status(400).json({ error: "Invalid docCategory" });
      return;
    }
    updates.docCategory = body.docCategory;
  }
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      res.status(400).json({ error: "title must not be blank" });
      return;
    }
    updates.title = body.title.trim();
  }
  if (body.encryptedPayload !== undefined) {
    if (typeof body.encryptedPayload !== "string" || !body.encryptedPayload) {
      res.status(400).json({ error: "encryptedPayload must not be blank" });
      return;
    }
    updates.encryptedPayload = body.encryptedPayload;
  }
  if (body.lastVerifiedAt !== undefined) {
    if (body.lastVerifiedAt !== null && !isValidDate(body.lastVerifiedAt)) {
      res.status(400).json({ error: "lastVerifiedAt must be a valid date or null" });
      return;
    }
    updates.lastVerifiedAt = body.lastVerifiedAt === null ? null : new Date(String(body.lastVerifiedAt));
  }
  const [updated] = await db.update(digitalVaultDocsTable)
    .set(updates)
    .where(and(eq(digitalVaultDocsTable.id, id), eq(digitalVaultDocsTable.ownerId, req.user!.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Vault document not found" });
    return;
  }
  res.json(publicDoc(updated));
});

// POST /vault/:id/verify
router.post("/vault/:id/verify", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [updated] = await db.update(digitalVaultDocsTable)
    .set({ lastVerifiedAt: new Date() })
    .where(and(eq(digitalVaultDocsTable.id, id), eq(digitalVaultDocsTable.ownerId, req.user!.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Vault document not found" });
    return;
  }
  res.json(publicDoc(updated));
});

// DELETE /vault/:id
router.delete("/vault/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db.delete(digitalVaultDocsTable)
    .where(and(eq(digitalVaultDocsTable.id, id), eq(digitalVaultDocsTable.ownerId, req.user!.id)))
    .returning({ id: digitalVaultDocsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Vault document not found" });
    return;
  }
  res.status(204).send();
});

export default router;