import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const businessHypothesesTable = pgTable("business_hypotheses", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("learning_zone"),
  projectedBudget: real("projected_budget").notNull().default(0),
  actualRiskImpact: real("actual_risk_impact").notNull().default(0),
  expectedMonthlyRevenue: real("expected_monthly_revenue").notNull().default(0),
  expectedMonthlyCosts: real("expected_monthly_costs").notNull().default(0),
  stressTestRevenue: real("stress_test_revenue"),
  stressTestCosts: real("stress_test_costs"),
  conservativePaybackMonths: real("conservative_payback_months"),
  marginOfSafety: real("margin_of_safety"),
  riskRating: text("risk_rating"),
  evaluatedAt: timestamp("evaluated_at"),
  keyLessons: text("key_lessons"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBusinessHypothesisSchema = createInsertSchema(businessHypothesesTable).omit({ id: true, ownerId: true, createdAt: true });
export type InsertBusinessHypothesis = z.infer<typeof insertBusinessHypothesisSchema>;
export type BusinessHypothesis = typeof businessHypothesesTable.$inferSelect;