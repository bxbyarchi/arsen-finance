import { pool } from "@workspace/db";

export async function ensureBalanceSchema() {
  await pool.query(`
    ALTER TABLE financial_profile
      ADD COLUMN IF NOT EXISTS current_balance real NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS balance_transactions (
      id serial PRIMARY KEY,
      owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount real NOT NULL,
      type text NOT NULL,
      source_id integer,
      source_type text,
      category text,
      note text,
      created_at timestamp DEFAULT now() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS balance_transactions_owner_idx ON balance_transactions(owner_id);
    CREATE INDEX IF NOT EXISTS balance_transactions_source_idx ON balance_transactions(source_type, source_id);

    DO $$
    BEGIN
      CREATE TYPE expense_frequency AS ENUM ('daily', 'monthly');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    ALTER TABLE expenses
      ADD COLUMN IF NOT EXISTS frequency expense_frequency NOT NULL DEFAULT 'monthly';
  `);
}
