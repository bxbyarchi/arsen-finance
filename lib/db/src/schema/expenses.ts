import { pgEnum, pgTable, serial, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emotionalTriggerEnum = pgEnum("emotional_trigger", [
  "routine",
  "stress_buying",
  "status_validation",
  "burnout_convenience",
]);

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // housing, food, transport, utilities, health, miscellaneous
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  isEssential: boolean("is_essential").notNull().default(true),
  emotionalTrigger: emotionalTriggerEnum("emotional_trigger"),
  isImpulseBuy: boolean("is_impulse_buy").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
