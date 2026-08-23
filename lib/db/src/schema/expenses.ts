import { pgEnum, pgTable, serial, text, real, boolean, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const emotionalTriggerEnum = pgEnum("emotional_trigger", [
  "routine",
  "stress_buying",
  "status_validation",
  "burnout_convenience",
]);

export const expensesTable = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "cascade" }),
    category: text("category").notNull(), // housing, food, transport, utilities, health, miscellaneous
    name: text("name").notNull(),
    amount: real("amount").notNull(),
    isEssential: boolean("is_essential").notNull().default(true),
    emotionalTrigger: emotionalTriggerEnum("emotional_trigger"),
    isImpulseBuy: boolean("is_impulse_buy").notNull().default(false),
    telegramUpdateId: integer("telegram_update_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("expenses_telegram_update_id_unique").on(table.telegramUpdateId)],
);

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, ownerId: true, telegramUpdateId: true, createdAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
