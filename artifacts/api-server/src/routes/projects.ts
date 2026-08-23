import { Router } from "express";
import { db, projectsTable, projectEntriesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

function calcEntry(e: typeof projectEntriesTable.$inferSelect) {
  const grossProfit = e.grossRevenue - e.directCosts;
  const totalOpex = e.marketingExpense + e.salaryExpense + e.rentExpense + e.logisticsExpense + e.utilitiesExpense;
  const netProfit = grossProfit - totalOpex;
  return { ...e, grossProfit, totalOpex, netProfit };
}

function safeNum(v: unknown, defaultVal = 0): number {
  const n = Number(v);
  return isFinite(n) && n >= 0 ? n : defaultVal;
}

function isValidMonth(m: unknown): m is string {
  if (typeof m !== "string") return false;
  if (!/^\d{4}-\d{2}$/.test(m)) return false;
  const month = parseInt(m.slice(5, 7), 10);
  return month >= 1 && month <= 12;
}

// GET /projects/summary — must be BEFORE /projects/:id
router.get("/projects/summary", async (req, res) => {
  const [projects, entries] = await Promise.all([
    db.select().from(projectsTable).where(eq(projectsTable.ownerId, req.user!.id)).orderBy(projectsTable.createdAt),
    db.select().from(projectEntriesTable).where(eq(projectEntriesTable.ownerId, req.user!.id)).orderBy(projectEntriesTable.month),
  ]);

  const pnlMap = new Map<number, {
    id: number; name: string; color: string;
    totalRevenue: number; totalDirectCosts: number; totalGrossProfit: number;
    totalOpex: number; totalNetProfit: number; totalReinvestment: number;
    totalDividends: number; entryCount: number;
  }>();

  for (const p of projects) {
    pnlMap.set(p.id, {
      id: p.id, name: p.name, color: p.color,
      totalRevenue: 0, totalDirectCosts: 0, totalGrossProfit: 0,
      totalOpex: 0, totalNetProfit: 0, totalReinvestment: 0,
      totalDividends: 0, entryCount: 0,
    });
  }

  const monthMap = new Map<string, { month: string; revenue: number; expenses: number; reinvestments: number; dividends: number; netProfit: number }>();

  for (const entry of entries) {
    const calc = calcEntry(entry);
    const pnl = pnlMap.get(entry.projectId);
    if (pnl) {
      pnl.totalRevenue += calc.grossRevenue;
      pnl.totalDirectCosts += calc.directCosts;
      pnl.totalGrossProfit += calc.grossProfit;
      pnl.totalOpex += calc.totalOpex;
      pnl.totalNetProfit += calc.netProfit;
      pnl.totalReinvestment += calc.reinvestment;
      pnl.totalDividends += calc.dividends;
      pnl.entryCount++;
    }
    const mb = monthMap.get(entry.month) ?? { month: entry.month, revenue: 0, expenses: 0, reinvestments: 0, dividends: 0, netProfit: 0 };
    mb.revenue += calc.grossRevenue;
    mb.expenses += calc.totalOpex + calc.directCosts;
    mb.reinvestments += calc.reinvestment;
    mb.dividends += calc.dividends;
    mb.netProfit += calc.netProfit;
    monthMap.set(entry.month, mb);
  }

  const projectsList = Array.from(pnlMap.values());
  const totals = projectsList.reduce((acc, p) => ({
    grossRevenue: acc.grossRevenue + p.totalRevenue,
    netProfit: acc.netProfit + p.totalNetProfit,
    dividends: acc.dividends + p.totalDividends,
    reinvestment: acc.reinvestment + p.totalReinvestment,
  }), { grossRevenue: 0, netProfit: 0, dividends: 0, reinvestment: 0 });

  const monthlyBreakdown = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  res.json({ projects: projectsList, totals, monthlyBreakdown });
});

// GET /projects
router.get("/projects", async (req, res) => {
  const projects = await db.select().from(projectsTable)
    .where(eq(projectsTable.ownerId, req.user!.id))
    .orderBy(desc(projectsTable.createdAt));
  res.json(projects);
});

// POST /projects
router.post("/projects", async (req, res) => {
  const { name, description, color } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [project] = await db.insert(projectsTable).values({
    ownerId: req.user!.id, name: name.trim(), description: description || null, color: color || "#6366f1",
  }).returning();
  res.status(201).json(project);
});

// GET /projects/:id
router.get("/projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.ownerId, req.user!.id)));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(project);
});

// PUT /projects/:id
router.put("/projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { name, description, color } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [updated] = await db.update(projectsTable)
    .set({ name: name.trim(), description: description || null, color: color || "#6366f1" })
    .where(and(eq(projectsTable.id, id), eq(projectsTable.ownerId, req.user!.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

// DELETE /projects/:id
router.delete("/projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db.delete(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.ownerId, req.user!.id)))
    .returning({ id: projectsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

// GET /projects/:id/entries
router.get("/projects/:id/entries", async (req, res) => {
  const projectId = Number(req.params.id);
  if (!isFinite(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const entries = await db.select().from(projectEntriesTable)
    .where(and(
      eq(projectEntriesTable.projectId, projectId),
      eq(projectEntriesTable.ownerId, req.user!.id),
    ))
    .orderBy(desc(projectEntriesTable.month));
  res.json(entries.map(calcEntry));
});

// POST /projects/:id/entries
router.post("/projects/:id/entries", async (req, res) => {
  const projectId = Number(req.params.id);
  if (!isFinite(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const { month, notes } = req.body;
  if (!isValidMonth(month)) {
    res.status(400).json({ error: "month is required and must be a valid YYYY-MM calendar month" });
    return;
  }
  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.ownerId, req.user!.id)));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [entry] = await db.insert(projectEntriesTable).values({
    ownerId: req.user!.id, projectId, month,
    grossRevenue: safeNum(req.body.grossRevenue),
    directCosts: safeNum(req.body.directCosts),
    marketingExpense: safeNum(req.body.marketingExpense),
    salaryExpense: safeNum(req.body.salaryExpense),
    rentExpense: safeNum(req.body.rentExpense),
    logisticsExpense: safeNum(req.body.logisticsExpense),
    utilitiesExpense: safeNum(req.body.utilitiesExpense),
    reinvestment: safeNum(req.body.reinvestment),
    dividends: safeNum(req.body.dividends),
    notes: notes || null,
  }).returning();
  res.status(201).json(calcEntry(entry));
});

// PUT /projects/:id/entries/:entryId
router.put("/projects/:id/entries/:entryId", async (req, res) => {
  const projectId = Number(req.params.id);
  const entryId = Number(req.params.entryId);
  if (!isFinite(projectId) || projectId <= 0 || !isFinite(entryId) || entryId <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { month, notes } = req.body;
  if (!isValidMonth(month)) {
    res.status(400).json({ error: "month is required and must be a valid YYYY-MM calendar month" });
    return;
  }
  const [updated] = await db.update(projectEntriesTable)
    .set({
      month,
      grossRevenue: safeNum(req.body.grossRevenue),
      directCosts: safeNum(req.body.directCosts),
      marketingExpense: safeNum(req.body.marketingExpense),
      salaryExpense: safeNum(req.body.salaryExpense),
      rentExpense: safeNum(req.body.rentExpense),
      logisticsExpense: safeNum(req.body.logisticsExpense),
      utilitiesExpense: safeNum(req.body.utilitiesExpense),
      reinvestment: safeNum(req.body.reinvestment),
      dividends: safeNum(req.body.dividends),
      notes: notes || null,
    })
    .where(and(
      eq(projectEntriesTable.id, entryId),
      eq(projectEntriesTable.projectId, projectId),
      eq(projectEntriesTable.ownerId, req.user!.id),
    ))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(calcEntry(updated));
});

// DELETE /projects/:id/entries/:entryId
router.delete("/projects/:id/entries/:entryId", async (req, res) => {
  const projectId = Number(req.params.id);
  const entryId = Number(req.params.entryId);
  if (!isFinite(projectId) || projectId <= 0 || !isFinite(entryId) || entryId <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db.delete(projectEntriesTable)
    .where(and(
      eq(projectEntriesTable.id, entryId),
      eq(projectEntriesTable.projectId, projectId),
      eq(projectEntriesTable.ownerId, req.user!.id),
    ))
    .returning({ id: projectEntriesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

export default router;
