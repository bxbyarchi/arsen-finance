import { db, marketDataCacheTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const SOURCE = "open.er-api.com + World Bank";

export interface MarketContext {
  usdKgs: number | null;
  eurKgs: number | null;
  inflationAnnualPercent: number | null;
  fetchedAt: string | null;
  status: "live" | "cache" | "unavailable";
  isStale: boolean;
}

type CacheKey = "usd_kgs" | "eur_kgs" | "inflation_kg_annual";

interface ExchangeResponse {
  result?: string;
  rates?: Record<string, number>;
}

interface WorldBankRow {
  value?: number | null;
  date?: string;
}

async function readCache() {
  const rows = await db.select().from(marketDataCacheTable);
  return new Map(rows.map((row) => [row.key, row]));
}

async function fetchJson<T>(url: string): Promise<T> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Market data provider returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function refreshMarketData(): Promise<Record<CacheKey, number>> {
  const [exchange, inflationResponse] = await Promise.all([
    fetchJson<ExchangeResponse>("https://open.er-api.com/v6/latest/USD"),
    fetchJson<unknown>("https://api.worldbank.org/v2/country/KGZ/indicator/FP.CPI.TOTL.ZG?format=json&per_page=5"),
  ]);
  const usdKgs = exchange.rates?.KGS;
  const eurUsd = exchange.rates?.EUR;
  const eurKgs = usdKgs && eurUsd ? usdKgs / eurUsd : undefined;
  const inflationRows = Array.isArray(inflationResponse) && Array.isArray(inflationResponse[1])
    ? inflationResponse[1] as WorldBankRow[]
    : [];
  const inflationAnnualPercent = inflationRows.find((row) => typeof row.value === "number")?.value ?? undefined;
  if (!Number.isFinite(usdKgs) || !Number.isFinite(eurKgs) || !Number.isFinite(inflationAnnualPercent)) {
    throw new Error("Market data provider returned incomplete values");
  }
  return {
    usd_kgs: usdKgs!,
    eur_kgs: eurKgs!,
    inflation_kg_annual: inflationAnnualPercent!,
  };
}

async function saveValues(values: Record<CacheKey, number>, fetchedAt: Date) {
  await Promise.all(Object.entries(values).map(([key, value]) =>
    db.insert(marketDataCacheTable)
      .values({ key, value, fetchedAt, source: SOURCE })
      .onConflictDoUpdate({
        target: marketDataCacheTable.key,
        set: { value, fetchedAt, source: SOURCE },
      }),
  ));
}

function contextFromRows(rows: Map<string, typeof marketDataCacheTable.$inferSelect>, status: MarketContext["status"], isStale: boolean): MarketContext {
  const usd = rows.get("usd_kgs");
  const eur = rows.get("eur_kgs");
  const inflation = rows.get("inflation_kg_annual");
  const timestamps = [usd?.fetchedAt, eur?.fetchedAt, inflation?.fetchedAt].filter(Boolean) as Date[];
  return {
    usdKgs: usd?.value ?? null,
    eurKgs: eur?.value ?? null,
    inflationAnnualPercent: inflation?.value ?? null,
    fetchedAt: timestamps.length ? new Date(Math.min(...timestamps.map((date) => date.getTime()))).toISOString() : null,
    status,
    isStale,
  };
}

export async function getMarketContext(): Promise<MarketContext> {
  const rows = await readCache();
  const requiredKeys: CacheKey[] = ["usd_kgs", "eur_kgs", "inflation_kg_annual"];
  const isFresh = requiredKeys.every((key) => {
    const row = rows.get(key);
    return row && Date.now() - row.fetchedAt.getTime() < CACHE_TTL_MS;
  });
  if (isFresh) return contextFromRows(rows, "cache", false);

  try {
    const values = await refreshMarketData();
    const fetchedAt = new Date();
    await saveValues(values, fetchedAt);
    const refreshed = new Map([...rows, ...Object.entries(values).map(([key, value]) => [
      key,
      { key, value, fetchedAt, source: SOURCE },
    ] as [string, typeof marketDataCacheTable.$inferSelect])]);
    return contextFromRows(refreshed, "live", false);
  } catch {
    const hasAnyCachedValue = requiredKeys.some((key) => rows.has(key));
    return contextFromRows(rows, hasAnyCachedValue ? "cache" : "unavailable", hasAnyCachedValue);
  }
}