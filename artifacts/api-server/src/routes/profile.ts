import { Router } from "express";
import { db, profileTable, debtsTable, expensesTable, incomesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const fmtSom = (val: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(val)) + " сом";

async function ensureProfile() {
  const profiles = await db.select().from(profileTable).limit(1);
  if (profiles.length === 0) {
    const [profile] = await db.insert(profileTable).values({ currentSavings: 0, crisisMode: false }).returning();
    return profile;
  }
  return profiles[0];
}

// GET /profile
router.get("/profile", async (req, res) => {
  const profile = await ensureProfile();
  res.json(profile);
});

// PATCH /profile
router.patch("/profile", async (req, res) => {
  const profile = await ensureProfile();
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
  const [profile, debts, expenses, incomes] = await Promise.all([
    ensureProfile(),
    db.select().from(debtsTable),
    db.select().from(expensesTable),
    db.select().from(incomesTable),
  ]);

  const totalDebt = debts.reduce((s, d) => s + d.totalDebt, 0);
  const totalMonthlyDebtPayment = debts.reduce((s, d) => s + d.monthlyPayment, 0);
  const totalMonthlyExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const weights: Record<string, number> = { HIGH: 1.0, MEDIUM: 0.65, LOW: 0.3 };
  const totalMonthlyIncome = incomes.reduce((s, i) => s + i.projectedAmount * (weights[i.confidence] ?? 0.5), 0);
  const totalBurn = totalMonthlyExpenses + totalMonthlyDebtPayment;
  const netMonthlyCashFlow = totalMonthlyIncome - totalBurn;
  const financialRunwayMonths = totalBurn > 0 ? profile.currentSavings / totalBurn : 999;

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
  });
});

// GET /crisis/simulation
router.get("/crisis/simulation", async (req, res) => {
  const [profile, expenses, debts, incomes] = await Promise.all([
    ensureProfile(),
    db.select().from(expensesTable),
    db.select().from(debtsTable),
    db.select().from(incomesTable),
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

  // Step-by-step action plan in Russian
  const actionPlan: { priority: number; action: string; monthlySaving: number; description: string }[] = [];
  let priority = 1;

  // Top eliminable expenses by amount
  const sortedEliminable = [...eliminableExpenses].sort((a, b) => b.amount - a.amount);
  for (const exp of sortedEliminable.slice(0, 5)) {
    actionPlan.push({
      priority: priority++,
      action: `Отказаться от «${exp.name}»`,
      monthlySaving: exp.amount,
      description: `Это необязательная трата (${CATEGORY_RU[exp.category] ?? exp.category}): ${fmtSom(exp.amount)} в месяц. Отказ сразу освободит деньги.`,
    });
  }

  // High-interest debt refinancing
  const highInterestDebts = debts.filter(d => d.interestRate > 15).sort((a, b) => b.interestRate - a.interestRate);
  for (const debt of highInterestDebts.slice(0, 2)) {
    const saving = Math.round(debt.monthlyPayment * 0.15 * 100) / 100;
    actionPlan.push({
      priority: priority++,
      action: `Рефинансировать кредит в «${debt.creditorName}»`,
      monthlySaving: saving,
      description: `Высокая ставка ${debt.interestRate}% в «${debt.creditorName}». Перевод в другой банк или рефинансирование может сэкономить около 15% ежемесячного платежа — это ${fmtSom(saving)}.`,
    });
  }

  if (monthlyShortfall > 0) {
    actionPlan.push({
      priority: priority++,
      action: "Найти дополнительный доход",
      monthlySaving: monthlyShortfall,
      description: `Даже после урезания трат не хватает ${fmtSom(monthlyShortfall)} в месяц. Рассмотри подработку, фриланс или продажу ненужных вещей чтобы закрыть этот дефицит.`,
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
