import { db, profileTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const RISK_RATINGS = ["Low", "Medium", "High", "Barbell Violation"] as const;
export type RiskRating = (typeof RISK_RATINGS)[number];

export interface HypothesisFinancialInputs {
  projectedBudget: number;
  expectedMonthlyRevenue: number;
  expectedMonthlyCosts: number;
}

export interface HypothesisEvaluation extends HypothesisFinancialInputs {
  stressTestRevenue: number;
  stressTestCosts: number;
  conservativePaybackMonths: number | null;
  marginOfSafety: number;
  riskRating: RiskRating;
  riskCapitalLimit: number;
  isBarbellViolation: boolean;
}

const rounded = (value: number) => Math.round(value * 100) / 100;

export async function evaluateHypothesis(ownerId: string, input: HypothesisFinancialInputs): Promise<HypothesisEvaluation> {
  const [profile] = await db.select({ currentSavings: profileTable.currentSavings })
    .from(profileTable)
    .where(eq(profileTable.ownerId, ownerId))
    .limit(1);
  const stressTestRevenue = rounded(input.expectedMonthlyRevenue * 0.7);
  const stressTestCosts = rounded(input.expectedMonthlyCosts * 1.2);
  const stressNet = stressTestRevenue - stressTestCosts;
  const baseNet = input.expectedMonthlyRevenue - input.expectedMonthlyCosts;
  const conservativePaybackMonths = stressNet > 0 && input.projectedBudget > 0
    ? rounded(input.projectedBudget / stressNet)
    : input.projectedBudget === 0 ? 0 : null;
  const marginOfSafety = baseNet > 0
    ? rounded((stressNet / baseNet) * 100)
    : 0;
  const riskCapitalLimit = rounded(Math.max(0, profile?.currentSavings ?? 0) * 0.2);
  const isBarbellViolation = input.projectedBudget > riskCapitalLimit;

  let riskRating: RiskRating;
  if (isBarbellViolation) riskRating = "Barbell Violation";
  else if (stressNet <= 0 || conservativePaybackMonths === null || conservativePaybackMonths > 24) riskRating = "High";
  else if (conservativePaybackMonths > 12 || marginOfSafety < 20) riskRating = "Medium";
  else riskRating = "Low";

  return {
    ...input,
    stressTestRevenue,
    stressTestCosts,
    conservativePaybackMonths,
    marginOfSafety,
    riskRating,
    riskCapitalLimit,
    isBarbellViolation,
  };
}