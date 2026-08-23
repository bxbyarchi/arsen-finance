import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// The current product is single-user. "default" keeps the profile ready for
// a future users table without blocking the current unauthenticated app.
export const userFinancialProfilesTable = pgTable("user_financial_profiles", {
  userId: text("user_id").primaryKey().default("default"),
  moneyScriptType: text("money_script_type").notNull().default("vigilance"),
  riskToleranceIndex: real("risk_tolerance_index").notNull().default(50),
  autonomyScore: integer("autonomy_score").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserFinancialProfileSchema = createInsertSchema(userFinancialProfilesTable);
export type InsertUserFinancialProfile = z.infer<typeof insertUserFinancialProfileSchema>;
export type UserFinancialProfile = typeof userFinancialProfilesTable.$inferSelect;