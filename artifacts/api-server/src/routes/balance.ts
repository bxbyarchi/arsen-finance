import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, balanceTransactionsTable, profileTable, debtsTable, expensesTable } from "@workspace/db";

const router = Router();

async function ensureProfile(ownerId: string) {
  const profiles = await db.select().from(profileTable).where(eq(profileTable.ownerId, ownerId));
  if (profiles.length) return profiles[0];
  const [profile] = await db.insert(profileTable).values({ ownerId, currentSavings: 0, currentBalance: 0, crisisMode: false }).returning();
  return profile;
}

router.get("/balance", async (req, res) => {
  const [profile, transactions] = await Promise.all([
    ensureProfile(req.user!.id),
    db.select().from(balanceTransactionsTable).where(eq(balanceTransactionsTable.ownerId, req.user!.id)).orderBy(desc(balanceTransactionsTable.createdAt)).limit(30),
  ]);
  res.json({ balance: profile.currentBalance, transactions });
});

router.patch("/balance", async (req, res) => {
  const amount = Number(req.body?.balance);
  if (!Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: "Некорректная сумма баланса" });
    return;
  }
  const profile = await ensureProfile(req.user!.id);
  const [updated] = await db.update(profileTable)
    .set({ currentBalance: Math.round(amount * 100) / 100, updatedAt: new Date() })
    .where(eq(profileTable.id, profile.id)).returning();
  res.json({ balance: updated.currentBalance });
});

router.post("/balance/transactions", async (req, res) => {
  const amount = Number(req.body?.amount);
  const type = String(req.body?.type ?? "deposit");
  const note = req.body?.note ? String(req.body.note) : null;
  if (!Number.isFinite(amount) || amount <= 0 || !["deposit", "withdrawal"].includes(type)) {
    res.status(400).json({ error: "Укажите положительную сумму и тип операции" });
    return;
  }
  const profile = await ensureProfile(req.user!.id);
  const delta = type === "deposit" ? amount : -amount;
  const newBalance = Math.round((profile.currentBalance + delta) * 100) / 100;
  if (newBalance < 0) { res.status(400).json({ error: "Недостаточно денег на балансе" }); return; }
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(profileTable).set({ currentBalance: newBalance, updatedAt: new Date() }).where(eq(profileTable.id, profile.id)).returning();
    const [transaction] = await tx.insert(balanceTransactionsTable).values({ ownerId: req.user!.id, amount: delta, type, note }).returning();
    return { balance: updated.currentBalance, transaction };
  });
  res.status(201).json(result);
});

router.get("/balance/distribution", async (req, res) => {
  const [profile, debts, expenses] = await Promise.all([
    ensureProfile(req.user!.id),
    db.select().from(debtsTable).where(eq(debtsTable.ownerId, req.user!.id)),
    db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id)),
  ]);
  const balance = profile.currentBalance;
  const essentialMonthly = expenses.filter(e => e.isEssential).reduce((s, e) => s + e.amount, 0);
  const debtMinimums = debts.reduce((s, d) => s + d.monthlyPayment, 0);
  const reserveTarget = (essentialMonthly + debtMinimums) * 2;
  const reserve = Math.min(balance, Math.max(0, reserveTarget));
  let free = Math.max(0, balance - reserve);
  const debtsByPriority = [...debts].sort((a, b) => b.interestRate - a.interestRate);
  const debtAllocations = debtsByPriority.map(d => {
    const amount = Math.min(free, Math.max(0, d.monthlyPayment));
    free -= amount;
    return { debtId: d.id, creditorName: d.creditorName, amount: Math.round(amount), reason: "минимальный платёж" };
  });
  const highestRate = debtsByPriority[0];
  if (highestRate && free > 0) {
    const item = debtAllocations.find(x => x.debtId === highestRate.id);
    const extra = Math.min(free, Math.max(0, highestRate.totalDebt - (item?.amount ?? 0)));
    if (item && extra > 0) { item.amount += Math.round(extra); free -= extra; }
  }
  res.json({ balance, reserve: Math.round(reserve), reserveTarget: Math.round(reserveTarget), debtAllocations, remainingFree: Math.round(free), recommendation: balance <= 0 ? "Баланс пуст — сначала пополни его." : reserve < reserveTarget ? "Сначала сформируй резерв на обязательные расходы и платежи." : highestRate ? `Свободные деньги приоритетно направляются на «${highestRate.creditorName}» со ставкой ${highestRate.interestRate}%.` : "Свободный остаток можно направить на цели и накопления." });
});

export default router;
