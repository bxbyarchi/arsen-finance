import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const digitalVaultDocsTable = pgTable("digital_vault_docs", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "cascade" }),
  docCategory: text("doc_category").notNull(),
  title: text("title").notNull(),
  encryptedPayload: text("encrypted_payload").notNull(),
  lastVerifiedAt: timestamp("last_verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDigitalVaultDocSchema = createInsertSchema(digitalVaultDocsTable).omit({ id: true, ownerId: true, createdAt: true });
export type InsertDigitalVaultDoc = z.infer<typeof insertDigitalVaultDocSchema>;
export type DigitalVaultDoc = typeof digitalVaultDocsTable.$inferSelect;