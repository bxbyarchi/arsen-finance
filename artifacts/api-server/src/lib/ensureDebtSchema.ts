import { pool } from "@workspace/db";

/**
 * Keeps the live Render database compatible with the debt/loan features.
 * All statements are idempotent so deploys can safely run this on startup.
 */
export async function ensureDebtSchema() {
  await pool.query(`
    ALTER TABLE debts
      ADD COLUMN IF NOT EXISTS original_amount real,
      ADD COLUMN IF NOT EXISTS term_months integer;

    UPDATE debts
      SET original_amount = total_debt
      WHERE original_amount IS NULL;

    UPDATE debts
      SET term_months = 0
      WHERE term_months IS NULL;

    ALTER TABLE debts
      ALTER COLUMN original_amount SET DEFAULT 0,
      ALTER COLUMN original_amount SET NOT NULL,
      ALTER COLUMN term_months SET DEFAULT 0,
      ALTER COLUMN term_months SET NOT NULL;

    CREATE TABLE IF NOT EXISTS debt_payments (
      id serial PRIMARY KEY,
      debt_id integer NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
      owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount real NOT NULL,
      principal_paid real NOT NULL,
      interest_paid real NOT NULL,
      payment_type text NOT NULL,
      paid_at text NOT NULL,
      notes text,
      created_at timestamp DEFAULT now() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS debt_payments_debt_id_idx ON debt_payments(debt_id);
    CREATE INDEX IF NOT EXISTS debt_payments_owner_id_idx ON debt_payments(owner_id);
  `);
}
