import { pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

export const marketDataCacheTable = pgTable("market_data_cache", {
  key: text("key").primaryKey(),
  value: real("value").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  source: text("source").notNull(),
});

export type MarketDataCache = typeof marketDataCacheTable.$inferSelect;