import { pgTable, serial, text, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";
import { debtsTable } from "./debts";

export const debtPaymentsTable = pgTable("debt_payments", {
  id: serial("id").primaryKey(),
  debtId: integer("debt_id").references(() => debtsTable.id, { onDelete: "cascade" }).notNull(),
  ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  amount: real("amount").notNull(),
  principalPaid: real("principal_paid").notNull(),
  interestPaid: real("interest_paid").notNull(),
  paymentType: text("payment_type").notNull(),
  paidAt: text("paid_at").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDebtPaymentSchema = createInsertSchema(debtPaymentsTable).omit({ id: true, createdAt: true });
export type InsertDebtPayment = z.infer<typeof insertDebtPaymentSchema>;
export type DebtPayment = typeof debtPaymentsTable.$inferSelect;
