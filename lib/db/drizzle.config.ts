import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_CONNECTION_STRING;

if (!databaseUrl) {
  throw new Error(
    "Set DATABASE_URL, POSTGRES_URL, or POSTGRES_CONNECTION_STRING before running Drizzle.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
