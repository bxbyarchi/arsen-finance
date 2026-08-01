# Smart Finance & Crisis Manager

A comprehensive personal and crisis financial planning web app for tracking debts, expenses, income projections, and running financial survival simulations.

## Run & Operate

- `pnpm --filter @workspace/smart-finance run dev` — frontend (port auto-assigned)
- `pnpm --filter @workspace/api-server run dev` — API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, Recharts, shadcn/ui, wouter, TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle schemas: debts.ts, expenses.ts, incomes.ts, profile.ts
- `artifacts/api-server/src/routes/` — Express route handlers per domain
- `artifacts/smart-finance/src/pages/` — React pages: Dashboard, Debts, Expenses, Income, Crisis, AIAdvisor

## Features

1. **Debt Tracker** — CRUD debts; Snowball vs Avalanche payoff schedule comparison
2. **Expenses** — Essential vs variable categorized expenses; burn rate breakdown
3. **Income Projections** — Actual vs projected with HIGH/MEDIUM/LOW confidence weighting
4. **Crisis Simulator** — Toggle crisis mode; shows essential-only runway, eliminable expenses, step-by-step action plan
5. **AI Advisor** — Rule-based analysis delivering 3 optimizations + risk alerts + health score (0–100)

## Architecture decisions

- All integer fields in OpenAPI spec use `type: number` (not `type: integer`) — Orval targets Zod v3 which has no `.int()` method; `integer` generates invalid Zod code
- Financial profile is a singleton row (ensureProfile() auto-creates on first request)
- AI analysis is fully rule-based (no external LLM) — runs on debts + expenses + incomes in real-time
- Confidence-weighted income: HIGH=100%, MEDIUM=65%, LOW=30% of projected amount

## User preferences

_None set yet._

## Gotchas

- After any OpenAPI spec change, run codegen: `pnpm --filter @workspace/api-spec run codegen`
- Do not use `type: integer` in openapi.yaml — use `type: number` instead (Orval/Zod v3 compatibility)
- Payoff schedule route `/debts/payoff-schedules` must be registered BEFORE `/debts/:id` in the Express router
- `pnpm --filter @workspace/db run push` after schema changes

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
