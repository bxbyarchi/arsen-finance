import { pgTable, serial, real, boolean, timestamp, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const profileTable = pgTable(
  "financial_profile",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "cascade" }),
    currentSavings: real("current_savings").notNull().default(0),
    crisisMode: boolean("crisis_mode").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("financial_profile_owner_id_unique").on(table.ownerId)],
);

export const insertProfileSchema = createInsertSchema(profileTable).omit({ id: true, ownerId: true, createdAt: true, updatedAt: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profileTable.$inferSelect;
