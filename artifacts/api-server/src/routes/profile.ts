import { Router } from "express";
import { db, profileTable, debtsTable, expensesTable, incomesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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

  // Generate step-by-step action plan
  const actionPlan: { priority: number; action: string; monthlySaving: number; description: string }[] = [];
  let priority = 1;

  // Sort eliminable expenses by amount descending
  const sortedEliminable = [...eliminableExpenses].sort((a, b) => b.amount - a.amount);
  for (const exp of sortedEliminable.slice(0, 5)) {
    actionPlan.push({
      priority: priority++,
      action: `Cut ${exp.name}`,
      monthlySaving: exp.amount,
      description: `Eliminate the ${exp.category} expense "${exp.name}" ($${exp.amount.toFixed(2)}/mo) — marked as non-essential.`,
    });
  }

  // Suggest debt refinancing if high interest
  const highInterestDebts = debts.filter(d => d.interestRate > 15).sort((a, b) => b.interestRate - a.interestRate);
  for (const debt of highInterestDebts.slice(0, 2)) {
    actionPlan.push({
      priority: priority++,
      action: `Refinance ${debt.creditorName}`,
      monthlySaving: Math.round(debt.monthlyPayment * 0.15 * 100) / 100,
      description: `High interest rate (${debt.interestRate}%) on ${debt.creditorName}. Refinancing or balance transfer could save ~15% on monthly payments.`,
    });
  }

  if (monthlyShortfall > 0) {
    actionPlan.push({
      priority: priority++,
      action: "Seek additional income",
      monthlySaving: monthlyShortfall,
      description: `Monthly shortfall of $${monthlyShortfall.toFixed(2)}. Consider freelance work, part-time job, or selling unused assets to cover this gap.`,
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

export default router;
