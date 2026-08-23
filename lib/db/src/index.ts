import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_CONNECTION_STRING;

if (!databaseUrl) {
  throw new Error(
    "Set DATABASE_URL, POSTGRES_URL, or POSTGRES_CONNECTION_STRING before starting the API server.",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema";
