import { Router } from "express";
import { db, debtsTable, expensesTable, incomesTable, profileTable } from "@workspace/db";

const router = Router();

// POST /ai/analyze - Rule-based financial analysis
router.post("/ai/analyze", async (req, res) => {
  const [debts, expenses, incomes, profiles] = await Promise.all([
    db.select().from(debtsTable),
    db.select().from(expensesTable),
    db.select().from(incomesTable),
    db.select().from(profileTable).limit(1),
  ]);

  const profile = profiles[0] ?? { currentSavings: 0, crisisMode: false };

  // Compute key metrics
  const totalDebt = debts.reduce((s, d) => s + d.totalDebt, 0);
  const totalMonthlyDebt = debts.reduce((s, d) => s + d.monthlyPayment, 0);
  const totalMonthlyExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const variableExpenses = expenses.filter(e => !e.isEssential);
  const totalVariable = variableExpenses.reduce((s, e) => s + e.amount, 0);
  const weights: Record<string, number> = { HIGH: 1.0, MEDIUM: 0.65, LOW: 0.3 };
  const weightedIncome = incomes.reduce((s, i) => s + i.projectedAmount * (weights[i.confidence] ?? 0.5), 0);
  const totalBurn = totalMonthlyExpenses + totalMonthlyDebt;
  const netCashFlow = weightedIncome - totalBurn;
  const runway = totalBurn > 0 ? profile.currentSavings / totalBurn : 999;
  const highInterestDebts = debts.filter(d => d.interestRate > 20);
  const lowConfidenceIncome = incomes.filter(i => i.confidence === "LOW");
  const savingsRatio = weightedIncome > 0 ? profile.currentSavings / weightedIncome : 0;
  const debtToIncome = weightedIncome > 0 ? totalMonthlyDebt / weightedIncome : 0;

  // Build optimizations
  const optimizations: { title: string; description: string; estimatedMonthlySaving: number; urgency: string }[] = [];

  // 1. High interest debt
  if (highInterestDebts.length > 0) {
    const avgRate = highInterestDebts.reduce((s, d) => s + d.interestRate, 0) / highInterestDebts.length;
    const potentialSaving = highInterestDebts.reduce((s, d) => s + d.monthlyPayment * 0.2, 0);
    optimizations.push({
      title: "Refinance High-Interest Debt",
      description: `You have ${highInterestDebts.length} loan(s) with rates above 20% (avg ${avgRate.toFixed(1)}%). Refinancing or consolidating to a lower rate could save significantly on interest payments each month.`,
      estimatedMonthlySaving: Math.round(potentialSaving * 100) / 100,
      urgency: avgRate > 25 ? "critical" : "high",
    });
  }

  // 2. Variable expenses reduction
  if (totalVariable > 0) {
    const top3 = [...variableExpenses].sort((a, b) => b.amount - a.amount).slice(0, 3);
    const saving = Math.round(totalVariable * 0.3 * 100) / 100;
    optimizations.push({
      title: "Reduce Non-Essential Spending",
      description: `Your variable expenses total $${totalVariable.toFixed(2)}/mo. Cutting back 30% on non-essentials${top3.length ? ` (especially ${top3.map(e => e.name).join(", ")})` : ""} would improve your monthly cash flow immediately.`,
      estimatedMonthlySaving: saving,
      urgency: netCashFlow < 0 ? "critical" : totalVariable > weightedIncome * 0.2 ? "high" : "medium",
    });
  }

  // 3. Debt snowball / avalanche
  if (debts.length > 1) {
    const smallestDebt = [...debts].sort((a, b) => a.totalDebt - b.totalDebt)[0];
    const highestRate = [...debts].sort((a, b) => b.interestRate - a.interestRate)[0];
    optimizations.push({
      title: "Adopt Debt Avalanche Strategy",
      description: `Pay minimums on all debts, then direct extra cash toward ${highestRate.creditorName} (${highestRate.interestRate}% APR). After that's cleared, cascade to ${smallestDebt.creditorName}. This minimizes total interest vs. the Snowball method.`,
      estimatedMonthlySaving: Math.round(totalDebt * 0.005 * 100) / 100,
      urgency: "high",
    });
  }

  // 4. Emergency fund
  if (savingsRatio < 3) {
    optimizations.push({
      title: `Build Emergency Fund to 3-Month Runway`,
      description: `Your current savings cover ${runway.toFixed(1)} months at current spend. Financial best practice is 3–6 months. Work toward saving $${(totalBurn * 3 - profile.currentSavings).toFixed(0)} more.`,
      estimatedMonthlySaving: 0,
      urgency: runway < 1 ? "critical" : runway < 2 ? "high" : "medium",
    });
  }

  // Keep top 3
  const topOptimizations = optimizations.slice(0, 3);

  // Build risk alerts
  const riskAlerts: { title: string; description: string; severity: string }[] = [];

  if (netCashFlow < 0) {
    riskAlerts.push({
      title: "Negative Monthly Cash Flow",
      description: `You are spending $${Math.abs(netCashFlow).toFixed(2)} more than you earn each month. Without correction, you will exhaust savings in ${runway.toFixed(1)} months.`,
      severity: "critical",
    });
  }

  if (debtToIncome > 0.43) {
    riskAlerts.push({
      title: "High Debt-to-Income Ratio",
      description: `Your debt payments consume ${(debtToIncome * 100).toFixed(0)}% of income. Lenders consider above 43% a risk threshold. This limits borrowing options and financial flexibility.`,
      severity: debtToIncome > 0.6 ? "critical" : "warning",
    });
  }

  if (lowConfidenceIncome.length > 0 && lowConfidenceIncome.reduce((s, i) => s + i.projectedAmount, 0) > weightedIncome * 0.3) {
    riskAlerts.push({
      title: "High Income Uncertainty",
      description: `More than 30% of your projected income is marked LOW confidence. Budget based on your worst-case income scenario to avoid shortfalls.`,
      severity: "warning",
    });
  }

  if (runway < 2) {
    riskAlerts.push({
      title: "Critical Savings Runway",
      description: `At current burn rate, savings will last only ${runway.toFixed(1)} months. Activate Crisis Mode to identify immediate cost cuts and extend runway.`,
      severity: "critical",
    });
  }

  if (highInterestDebts.length === 0 && netCashFlow >= 0 && runway >= 3) {
    riskAlerts.push({
      title: "Financial Position Stable",
      description: "No critical risk factors detected. Focus on building savings and accelerating debt payoff to improve long-term resilience.",
      severity: "info",
    });
  }

  // Overall health score (0-100)
  let score = 50;
  if (netCashFlow > 0) score += Math.min(20, (netCashFlow / (totalBurn || 1)) * 20);
  if (netCashFlow < 0) score -= Math.min(30, Math.abs(netCashFlow / (totalBurn || 1)) * 30);
  if (runway >= 6) score += 15;
  else if (runway >= 3) score += 8;
  else if (runway < 1) score -= 20;
  if (debtToIncome < 0.28) score += 10;
  else if (debtToIncome > 0.43) score -= 10;
  if (highInterestDebts.length === 0) score += 5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const summary =
    score >= 70
      ? `Your finances are in reasonably good shape (score: ${score}/100). Focus on debt elimination and building your savings buffer.`
      : score >= 40
      ? `Your financial position needs attention (score: ${score}/100). Address the optimizations above — especially cash flow — to avoid a crisis.`
      : `Your finances are under serious stress (score: ${score}/100). Activate Crisis Mode now, cut non-essential spending immediately, and prioritize stabilizing monthly cash flow.`;

  res.json({
    optimizations: topOptimizations,
    riskAlerts: riskAlerts.slice(0, 4),
    overallHealthScore: score,
    summary,
    analyzedAt: new Date().toISOString(),
  });
});

export default router;
