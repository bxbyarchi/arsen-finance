import { pgTable, serial, text, real, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const balanceTransactionsTable = pgTable("balance_transactions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  amount: real("amount").notNull(),
  type: text("type").notNull(),
  sourceId: integer("source_id"),
  sourceType: text("source_type"),
  category: text("category"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("balance_transactions_owner_idx").on(table.ownerId),
  index("balance_transactions_source_idx").on(table.sourceType, table.sourceId),
]);

export type BalanceTransaction = typeof balanceTransactionsTable.$inferSelect;
