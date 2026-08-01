import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { db, debtsTable, expensesTable, incomesTable, profileTable } from "@workspace/db";

const router = Router();

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

interface Optimization {
  title: string;
  description: string;
  estimatedMonthlySaving: number;
  urgency: "critical" | "high" | "medium" | "low";
}

interface RiskAlert {
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
}

interface AnalysisResult {
  optimizations: Optimization[];
  riskAlerts: RiskAlert[];
  overallHealthScore: number;
  summary: string;
}

// POST /ai/analyze - Gemini-powered financial analysis
router.post("/ai/analyze", async (req, res) => {
  const [debts, expenses, incomes, profiles] = await Promise.all([
    db.select().from(debtsTable),
    db.select().from(expensesTable),
    db.select().from(incomesTable),
    db.select().from(profileTable).limit(1),
  ]);

  const profile = profiles[0] ?? { currentSavings: 0, crisisMode: false };

  // Pre-compute key metrics for context
  const weights: Record<string, number> = { HIGH: 1.0, MEDIUM: 0.65, LOW: 0.3 };
  const totalDebt = debts.reduce((s, d) => s + d.totalDebt, 0);
  const totalMonthlyDebt = debts.reduce((s, d) => s + d.monthlyPayment, 0);
  const totalMonthlyExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const weightedIncome = incomes.reduce((s, i) => s + i.projectedAmount * (weights[i.confidence] ?? 0.5), 0);
  const totalBurn = totalMonthlyExpenses + totalMonthlyDebt;
  const netCashFlow = weightedIncome - totalBurn;
  const runway = totalBurn > 0 ? profile.currentSavings / totalBurn : 999;
  const debtToIncome = weightedIncome > 0 ? (totalMonthlyDebt / weightedIncome) * 100 : 0;

  const focusArea = req.body?.focusArea ?? null;

  const prompt = `You are an expert personal finance advisor. Analyze this user's financial data and provide actionable insights.

## Financial Snapshot
- Current Savings: $${profile.currentSavings.toFixed(2)}
- Financial Runway: ${runway.toFixed(1)} months at current burn
- Net Monthly Cash Flow: $${netCashFlow.toFixed(2)} (${netCashFlow >= 0 ? "surplus" : "DEFICIT"})
- Monthly Burn Rate: $${totalBurn.toFixed(2)} (expenses: $${totalMonthlyExpenses.toFixed(2)} + debt payments: $${totalMonthlyDebt.toFixed(2)})
- Confidence-Weighted Monthly Income: $${weightedIncome.toFixed(2)}
- Total Debt: $${totalDebt.toFixed(2)}
- Debt-to-Income Ratio: ${debtToIncome.toFixed(1)}%
${focusArea ? `- Focus Area: ${focusArea}` : ""}

## Debts (${debts.length} total)
${debts.length === 0 ? "No debts recorded." : debts.map(d =>
  `- ${d.creditorName}: $${d.totalDebt.toFixed(2)} remaining, $${d.monthlyPayment.toFixed(2)}/mo, ${d.interestRate}% APR, due ${d.dueDate}${d.notes ? ` (${d.notes})` : ""}`
).join("\n")}

## Monthly Expenses (${expenses.length} items)
${expenses.length === 0 ? "No expenses recorded." : expenses.map(e =>
  `- [${e.isEssential ? "ESSENTIAL" : "VARIABLE"}] ${e.name} (${e.category}): $${e.amount.toFixed(2)}/mo`
).join("\n")}

## Income Sources (${incomes.length} entries)
${incomes.length === 0 ? "No income recorded." : incomes.map(i =>
  `- ${i.source} [${i.confidence} confidence]: projected $${i.projectedAmount.toFixed(2)}${i.actualAmount != null ? `, actual $${i.actualAmount.toFixed(2)}` : ", actual not yet recorded"} (${i.month})`
).join("\n")}

## Your Task
Respond ONLY with a valid JSON object (no markdown, no explanation outside the JSON) with this exact structure:
{
  "optimizations": [
    {
      "title": "Short action title (max 8 words)",
      "description": "2-3 sentence specific, actionable advice referencing the user's actual numbers.",
      "estimatedMonthlySaving": 0,
      "urgency": "critical|high|medium|low"
    }
  ],
  "riskAlerts": [
    {
      "title": "Short risk title (max 8 words)",
      "description": "1-2 sentence description of the risk and its impact.",
      "severity": "critical|warning|info"
    }
  ],
  "overallHealthScore": 0,
  "summary": "2-3 sentence overall assessment."
}

Rules:
- Provide exactly 3 optimizations, ordered by urgency (most urgent first).
- Provide 2-4 risk alerts based on actual data patterns.
- overallHealthScore must be an integer from 0 to 100.
- estimatedMonthlySaving must be a number (use 0 if not quantifiable).
- Be specific — mention actual creditor names, amounts, and percentages from the data.
- urgency values: "critical", "high", "medium", "low" only.
- severity values: "critical", "warning", "info" only.`;

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";
    // Strip any accidental markdown fences
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed: AnalysisResult = JSON.parse(clean);

    // Clamp and validate the score
    const score = Math.max(0, Math.min(100, Math.round(parsed.overallHealthScore ?? 50)));

    return res.json({
      optimizations: (parsed.optimizations ?? []).slice(0, 3),
      riskAlerts: (parsed.riskAlerts ?? []).slice(0, 4),
      overallHealthScore: score,
      summary: parsed.summary ?? "",
      analyzedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    req.log.warn({ err: err?.message ?? String(err) }, "Gemini API call failed — falling back to rule-based analysis");
    // Graceful fallback to rule-based analysis
    const highInterestDebts = debts.filter(d => d.interestRate > 20);
    const variableExpenses = expenses.filter(e => !e.isEssential);
    const totalVariable = variableExpenses.reduce((s, e) => s + e.amount, 0);
    const lowConfidenceIncome = incomes.filter(i => i.confidence === "LOW");

    const optimizations: Optimization[] = [];

    if (highInterestDebts.length > 0) {
      const avgRate = highInterestDebts.reduce((s, d) => s + d.interestRate, 0) / highInterestDebts.length;
      optimizations.push({
        title: "Refinance High-Interest Debt",
        description: `You have ${highInterestDebts.length} loan(s) above 20% APR (avg ${avgRate.toFixed(1)}%). Consolidating or refinancing could meaningfully reduce monthly interest.`,
        estimatedMonthlySaving: Math.round(highInterestDebts.reduce((s, d) => s + d.monthlyPayment * 0.2, 0) * 100) / 100,
        urgency: avgRate > 25 ? "critical" : "high",
      });
    }

    if (totalVariable > 0) {
      const top3 = [...variableExpenses].sort((a, b) => b.amount - a.amount).slice(0, 3);
      optimizations.push({
        title: "Cut Non-Essential Spending",
        description: `Variable expenses total $${totalVariable.toFixed(2)}/mo. Trimming 30% — starting with ${top3.map(e => e.name).join(", ")} — improves cash flow immediately.`,
        estimatedMonthlySaving: Math.round(totalVariable * 0.3 * 100) / 100,
        urgency: netCashFlow < 0 ? "critical" : "high",
      });
    }

    if (debts.length > 1) {
      const highestRate = [...debts].sort((a, b) => b.interestRate - a.interestRate)[0];
      optimizations.push({
        title: "Use Debt Avalanche Strategy",
        description: `Pay minimums on all debts and direct extra cash to ${highestRate.creditorName} (${highestRate.interestRate}% APR) first. This minimises total interest paid.`,
        estimatedMonthlySaving: 0,
        urgency: "high",
      });
    }

    const riskAlerts: RiskAlert[] = [];
    if (netCashFlow < 0) {
      riskAlerts.push({ title: "Negative Monthly Cash Flow", description: `Spending $${Math.abs(netCashFlow).toFixed(2)} more than income each month. Savings will last ${runway.toFixed(1)} months.`, severity: "critical" });
    }
    if (debtToIncome > 43) {
      riskAlerts.push({ title: "High Debt-to-Income Ratio", description: `Debt payments consume ${debtToIncome.toFixed(0)}% of income. Above 43% limits borrowing options and financial flexibility.`, severity: debtToIncome > 60 ? "critical" : "warning" });
    }
    if (lowConfidenceIncome.length > 0) {
      riskAlerts.push({ title: "Uncertain Income Sources", description: `${lowConfidenceIncome.length} income source(s) marked LOW confidence. Budget conservatively based on worst-case income.`, severity: "warning" });
    }
    if (runway < 2) {
      riskAlerts.push({ title: "Critical Savings Runway", description: `At current burn rate, savings last only ${runway.toFixed(1)} months. Activate Crisis Mode to extend runway.`, severity: "critical" });
    }

    let score = 50;
    if (netCashFlow > 0) score += Math.min(20, (netCashFlow / (totalBurn || 1)) * 20);
    if (netCashFlow < 0) score -= Math.min(30, Math.abs(netCashFlow / (totalBurn || 1)) * 30);
    if (runway >= 6) score += 15; else if (runway >= 3) score += 8; else if (runway < 1) score -= 20;
    if (debtToIncome < 28) score += 10; else if (debtToIncome > 43) score -= 10;
    if (highInterestDebts.length === 0) score += 5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return res.json({
      optimizations: optimizations.slice(0, 3),
      riskAlerts: riskAlerts.slice(0, 4),
      overallHealthScore: score,
      summary: score >= 70
        ? `Finances are in reasonable shape (score: ${score}/100). Focus on debt elimination and growing your savings buffer.`
        : score >= 40
        ? `Financial position needs attention (score: ${score}/100). Address the top optimizations above — especially cash flow.`
        : `Finances are under serious stress (score: ${score}/100). Activate Crisis Mode and cut non-essential spending immediately.`,
      analyzedAt: new Date().toISOString(),
      _fallback: true,
    });
  }
});

export default router;
