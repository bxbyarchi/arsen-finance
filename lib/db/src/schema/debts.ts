import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const debtsTable = pgTable("debts", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "cascade" }),
  creditorName: text("creditor_name").notNull(),
  totalDebt: real("total_debt").notNull(),
  monthlyPayment: real("monthly_payment").notNull(),
  interestRate: real("interest_rate").notNull(),
  dueDate: text("due_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDebtSchema = createInsertSchema(debtsTable).omit({ id: true, ownerId: true, createdAt: true });
export type InsertDebt = z.infer<typeof insertDebtSchema>;
export type Debt = typeof debtsTable.$inferSelect;
