import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const davlatovAllocationsTable = pgTable("davlatov_allocations", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(), // 'dividend' | 'personal_income'
  sourceAmount: real("source_amount").notNull(),
  charityPct: real("charity_pct").notNull(),
  charityAmt: real("charity_amt").notNull(),
  parentsAmt: real("parents_amt").notNull(),
  savingsAmt: real("savings_amt").notNull(),
  entertainmentAmt: real("entertainment_amt").notNull(),
  largeDreamAmt: real("large_dream_amt").notNull(),
  smallDreamAmt: real("small_dream_amt").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDavlatovAllocationSchema = createInsertSchema(davlatovAllocationsTable).omit({ id: true, ownerId: true, createdAt: true });
export type InsertDavlatovAllocation = z.infer<typeof insertDavlatovAllocationSchema>;
export type DavlatovAllocation = typeof davlatovAllocationsTable.$inferSelect;
