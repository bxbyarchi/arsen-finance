import { Router } from "express";
import { db, profileTable, debtsTable, expensesTable, incomesTable, projectEntriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const fmtSom = (val: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(val)) + " сом";

async function ensureProfile(ownerId: string) {
  const profiles = await db.select().from(profileTable).where(eq(profileTable.ownerId, ownerId));
  if (profiles.length === 0) {
    const [profile] = await db.insert(profileTable).values({ ownerId, currentSavings: 0, crisisMode: false }).returning();
    return profile;
  }
  return profiles[0];
}

// GET /profile
router.get("/profile", async (req, res) => {
  const profile = await ensureProfile(req.user!.id);
  res.json(profile);
});

// PATCH /profile
router.patch("/profile", async (req, res) => {
  const profile = await ensureProfile(req.user!.id);
  const updates: Partial<{ currentSavings: number; crisisMode: boolean }> = {};
  if (req.body.currentSavings !== undefined) updates.currentSavings = Number(req.body.currentSavings);
  if (req.body.crisisMode !== undefined) updates.crisisMode = Boolean(req.body.crisisMode);
  const [updated] = await db.update(profileTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(profileTable.id, profile.id))
    .returning();
  res.json(updated);
});

// GET /dashboard/summary
router.get("/dashboard/summary", async (req, res) => {
  const [profile, debts, expenses, incomes, projectEntries] = await Promise.all([
    ensureProfile(req.user!.id),
    db.select().from(debtsTable).where(eq(debtsTable.ownerId, req.user!.id)),
    db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id)),
    db.select().from(incomesTable).where(eq(incomesTable.ownerId, req.user!.id)),
    db.select().from(projectEntriesTable).where(eq(projectEntriesTable.ownerId, req.user!.id)).orderBy(projectEntriesTable.month),
  ]);

  const totalDebt = debts.reduce((s, d) => s + d.totalDebt, 0);
  const totalMonthlyDebtPayment = debts.reduce((s, d) => s + d.monthlyPayment, 0);
  const totalMonthlyExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const weights: Record<string, number> = { HIGH: 1.0, MEDIUM: 0.65, LOW: 0.3 };
  const totalMonthlyIncome = incomes.reduce((s, i) => s + i.projectedAmount * (weights[i.confidence] ?? 0.5), 0);
  const totalBurn = totalMonthlyExpenses + totalMonthlyDebtPayment;
  const netMonthlyCashFlow = totalMonthlyIncome - totalBurn;
  const financialRunwayMonths = totalBurn > 0 ? profile.currentSavings / totalBurn : 999;

  // Project aggregates
  let totalProjectRevenue = 0;
  let totalProjectNetProfit = 0;
  let totalProjectDividends = 0;

  // Monthly breakdown from project entries
  const monthMap = new Map<string, { month: string; revenue: number; expenses: number; reinvestments: number; dividends: number; netProfit: number }>();

  for (const e of projectEntries) {
    const grossProfit = e.grossRevenue - e.directCosts;
    const totalOpex = e.marketingExpense + e.salaryExpense + e.rentExpense + e.logisticsExpense + e.utilitiesExpense;
    const netProfit = grossProfit - totalOpex;

    totalProjectRevenue += e.grossRevenue;
    totalProjectNetProfit += netProfit;
    totalProjectDividends += e.dividends;

    const mb = monthMap.get(e.month) ?? { month: e.month, revenue: 0, expenses: 0, reinvestments: 0, dividends: 0, netProfit: 0 };
    mb.revenue += e.grossRevenue;
    mb.expenses += totalOpex + e.directCosts;
    mb.reinvestments += e.reinvestment;
    mb.dividends += e.dividends;
    mb.netProfit += netProfit;
    monthMap.set(e.month, mb);
  }

  // If no project entries, add the current month for personal finances
  if (monthMap.size === 0) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    monthMap.set(currentMonth, {
      month: currentMonth,
      revenue: totalMonthlyIncome,
      expenses: totalBurn,
      reinvestments: 0,
      dividends: 0,
      netProfit: netMonthlyCashFlow,
    });
  }

  const monthlyBreakdown = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  res.json({
    totalDebt,
    totalMonthlyDebtPayment,
    totalMonthlyExpenses,
    totalMonthlyIncome,
    currentSavings: profile.currentSavings,
    netMonthlyCashFlow,
    financialRunwayMonths: Math.round(financialRunwayMonths * 10) / 10,
    debtCount: debts.length,
    crisisMode: profile.crisisMode,
    totalProjectRevenue,
    totalProjectNetProfit,
    totalProjectDividends,
    monthlyBreakdown,
  });
});

// GET /crisis/simulation
router.get("/crisis/simulation", async (req, res) => {
  const [profile, expenses, debts, incomes] = await Promise.all([
    ensureProfile(req.user!.id),
    db.select().from(expensesTable).where(eq(expensesTable.ownerId, req.user!.id)),
    db.select().from(debtsTable).where(eq(debtsTable.ownerId, req.user!.id)),
    db.select().from(incomesTable).where(eq(incomesTable.ownerId, req.user!.id)),
  ]);

  const essentialExpenses = expenses.filter(e => e.isEssential);
  const eliminableExpenses = expenses.filter(e => !e.isEssential);
  const essentialExpenseTotal = essentialExpenses.reduce((s, e) => s + e.amount, 0);
  const totalMonthlyDebtPayment = debts.reduce((s, d) => s + d.monthlyPayment, 0);
  const essentialBurnRate = essentialExpenseTotal + totalMonthlyDebtPayment;
  const currentBurnRate = expenses.reduce((s, e) => s + e.amount, 0) + totalMonthlyDebtPayment;

  const weights: Record<string, number> = { HIGH: 1.0, MEDIUM: 0.65, LOW: 0.3 };
  const monthlyIncome = incomes.reduce((s, i) => s + i.projectedAmount * (weights[i.confidence] ?? 0.5), 0);

  const runwayMonthsFull = currentBurnRate > 0 ? profile.currentSavings / currentBurnRate : 999;
  const runwayMonthsCrisis = essentialBurnRate > 0 ? profile.currentSavings / essentialBurnRate : 999;
  const monthlyShortfall = Math.max(0, essentialBurnRate - monthlyIncome);

  const actionPlan: { priority: number; action: string; monthlySaving: number; description: string }[] = [];
  let priority = 1;

  const sortedEliminable = [...eliminableExpenses].sort((a, b) => b.amount - a.amount);
  for (const exp of sortedEliminable.slice(0, 5)) {
    actionPlan.push({
      priority: priority++,
      action: `Отказаться от «${exp.name}»`,
      monthlySaving: exp.amount,
      description: `Это необязательная трата (${CATEGORY_RU[exp.category] ?? exp.category}): ${fmtSom(exp.amount)} в месяц. Отказ сразу освободит деньги.`,
    });
  }

  const highInterestDebts = debts.filter(d => d.interestRate > 15).sort((a, b) => b.interestRate - a.interestRate);
  for (const debt of highInterestDebts.slice(0, 2)) {
    const saving = Math.round(debt.monthlyPayment * 0.15 * 100) / 100;
    actionPlan.push({
      priority: priority++,
      action: `Рефинансировать кредит в «${debt.creditorName}»`,
      monthlySaving: saving,
      description: `Высокая ставка ${debt.interestRate}% в «${debt.creditorName}». Рефинансирование может сэкономить около 15% ежемесячного платежа — это ${fmtSom(saving)}.`,
    });
  }

  if (monthlyShortfall > 0) {
    actionPlan.push({
      priority: priority++,
      action: "Найти дополнительный доход",
      monthlySaving: monthlyShortfall,
      description: `Даже после урезания трат не хватает ${fmtSom(monthlyShortfall)} в месяц. Рассмотри подработку, фриланс или продажу ненужных вещей.`,
    });
  }

  res.json({
    essentialBurnRate: Math.round(essentialBurnRate * 100) / 100,
    currentBurnRate: Math.round(currentBurnRate * 100) / 100,
    savingsAmount: profile.currentSavings,
    runwayMonthsFull: Math.round(runwayMonthsFull * 10) / 10,
    runwayMonthsCrisis: Math.round(runwayMonthsCrisis * 10) / 10,
    monthlyShortfall: Math.round(monthlyShortfall * 100) / 100,
    actionPlan,
    eliminableExpenses,
  });
});

const CATEGORY_RU: Record<string, string> = {
  housing: "жильё", food: "питание", transport: "транспорт",
  utilities: "коммунальные / связь", health: "здоровье", miscellaneous: "разное",
};

export default router;
