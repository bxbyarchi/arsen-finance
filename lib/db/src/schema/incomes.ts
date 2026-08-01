import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const incomesTable = pgTable("incomes", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  projectedAmount: real("projected_amount").notNull(),
  actualAmount: real("actual_amount"),
  confidence: text("confidence").notNull().default("MEDIUM"), // HIGH, MEDIUM, LOW
  month: text("month").notNull(), // YYYY-MM format
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIncomeSchema = createInsertSchema(incomesTable).omit({ id: true, createdAt: true });
export type InsertIncome = z.infer<typeof insertIncomeSchema>;
export type Income = typeof incomesTable.$inferSelect;
