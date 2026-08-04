import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savingsGoalsTable = pgTable("savings_goals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  targetAmount: real("target_amount").notNull(),
  targetMonths: integer("target_months").notNull(), // 1, 6, 12, 36
  currentAmount: real("current_amount").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSavingsGoalSchema = createInsertSchema(savingsGoalsTable).omit({ id: true, createdAt: true });
export type InsertSavingsGoal = z.infer<typeof insertSavingsGoalSchema>;
export type SavingsGoal = typeof savingsGoalsTable.$inferSelect;
