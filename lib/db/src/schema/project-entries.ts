import { pgTable, serial, integer, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const projectEntriesTable = pgTable("project_entries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // YYYY-MM
  grossRevenue: real("gross_revenue").notNull().default(0),
  directCosts: real("direct_costs").notNull().default(0),
  marketingExpense: real("marketing_expense").notNull().default(0),
  salaryExpense: real("salary_expense").notNull().default(0),
  rentExpense: real("rent_expense").notNull().default(0),
  logisticsExpense: real("logistics_expense").notNull().default(0),
  utilitiesExpense: real("utilities_expense").notNull().default(0),
  reinvestment: real("reinvestment").notNull().default(0),
  dividends: real("dividends").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectEntrySchema = createInsertSchema(projectEntriesTable).omit({ id: true, createdAt: true });
export type InsertProjectEntry = z.infer<typeof insertProjectEntrySchema>;
export type ProjectEntry = typeof projectEntriesTable.$inferSelect;
