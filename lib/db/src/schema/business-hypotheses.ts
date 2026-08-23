import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const businessHypothesesTable = pgTable("business_hypotheses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("learning_zone"),
  projectedBudget: real("projected_budget").notNull().default(0),
  actualRiskImpact: real("actual_risk_impact").notNull().default(0),
  keyLessons: text("key_lessons"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBusinessHypothesisSchema = createInsertSchema(businessHypothesesTable).omit({ id: true, createdAt: true });
export type InsertBusinessHypothesis = z.infer<typeof insertBusinessHypothesisSchema>;
export type BusinessHypothesis = typeof businessHypothesesTable.$inferSelect;