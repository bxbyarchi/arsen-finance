/**
 * Test data seed script — populates all modules with realistic Kyrgyz data.
 * Run: pnpm --filter @workspace/db tsx src/seed-test-data.ts
 */
import { db, pool } from "./index";
import {
  expensesTable,
  projectsTable,
  projectEntriesTable,
  savingsGoalsTable,
  davlatovAllocationsTable,
} from "./schema";

async function seed() {
  console.log("🌱 Seeding test data…");

  // ── 1. Personal Expenses ───────────────────────────────────────────────────
  await db.insert(expensesTable).values([
    { category: "utilities",     name: "Кредит банк (ежемесячный платёж)", amount: 9775,  isEssential: true  },
    { category: "miscellaneous", name: "Прочие долги",                     amount: 10000, isEssential: true  },
    { category: "food",          name: "Питание и продукты",               amount: 12000, isEssential: true  },
    { category: "utilities",     name: "Связь и интернет",                 amount: 1000,  isEssential: true  },
    { category: "miscellaneous", name: "Личные мелкие расходы",            amount: 5000,  isEssential: false },
    { category: "miscellaneous", name: "ИИ подписки и тесты ниш",         amount: 7000,  isEssential: false },
    { category: "housing",       name: "Проживание на базе (аренда)",      amount: 0,     isEssential: true  },
  ]);
  console.log("  ✓ Personal expenses (7)");

  // ── 2. Business Projects + P&L entries ────────────────────────────────────
  const MONTHS = ["2026-06", "2026-07", "2026-08"];

  // Project A — Cleaning Company
  const [cleaning] = await db.insert(projectsTable).values({
    name: "Клининговая компания",
    description: "Профессиональная уборка — офисы и квартиры",
    color: "#10b981",
  }).returning();

  // Project B — Content Creation
  const [content] = await db.insert(projectsTable).values({
    name: "Контент (TikTok & YouTube)",
    description: "Монетизация через рекламу и партнёрские программы",
    color: "#6366f1",
  }).returning();

  // Project C — Luna Garden
  const [luna] = await db.insert(projectsTable).values({
    name: "Luna Garden Operations",
    description: "Флагманский проект — операционный бизнес",
    color: "#f59e0b",
  }).returning();

  // P&L entries — slight monthly variance for realistic charts
  const cleaningEntries = MONTHS.map((month, i) => ({
    projectId: cleaning.id,
    month,
    grossRevenue:     60000 + i * 3000,
    directCosts:      15000,
    marketingExpense: 8000,
    logisticsExpense: 4000,
    salaryExpense:    0,
    rentExpense:      0,
    utilitiesExpense: 0,
    reinvestment:     5000,
    dividends:        10000 + i * 1000,
    notes: `Месяц ${month}`,
  }));

  const contentEntries = MONTHS.map((month, i) => ({
    projectId: content.id,
    month,
    grossRevenue:     25000 + i * 2000,
    directCosts:      0,
    marketingExpense: 5000,
    salaryExpense:    3000,  // монтаж/редактура
    rentExpense:      0,
    logisticsExpense: 0,
    utilitiesExpense: 0,
    reinvestment:     2000,
    dividends:        7000 + i * 500,
    notes: `Месяц ${month}`,
  }));

  const lunaEntries = MONTHS.map((month, i) => ({
    projectId: luna.id,
    month,
    grossRevenue:     180000 + i * 5000,
    directCosts:      20000,
    marketingExpense: 0,
    salaryExpense:    45000,
    rentExpense:      0,
    logisticsExpense: 0,
    utilitiesExpense: 12000,
    reinvestment:     15000,
    dividends:        50000 + i * 3000,
    notes: `Месяц ${month}`,
  }));

  await db.insert(projectEntriesTable).values([
    ...cleaningEntries,
    ...contentEntries,
    ...lunaEntries,
  ]);
  console.log("  ✓ Projects (3) + P&L entries (9)");

  // ── 3. Savings Goals ───────────────────────────────────────────────────────
  await db.insert(savingsGoalsTable).values([
    {
      title:         "Краткосрок — Подушка безопасности (1 мес. расходов)",
      targetAmount:  50000,
      targetMonths:  1,
      currentAmount: 15000,
    },
    {
      title:         "Среднесрок — Оборудование и реинвест в бизнес",
      targetAmount:  300000,
      targetMonths:  6,
      currentAmount: 85000,
    },
    {
      title:         "Долгосрок — Крупный актив (авто или недвижимость)",
      targetAmount:  1200000,
      targetMonths:  12,
      currentAmount: 0,
    },
  ]);
  console.log("  ✓ Savings goals (3)");

  // ── 4. Davlatov Allocation sample ─────────────────────────────────────────
  // Based on July 2026 dividends from all 3 projects
  const julyDividends = 10000 + 7000 + 53000; // 70 000 сом
  const charityPct = 2.5;
  const charityAmt     = Math.round(julyDividends * (charityPct / 100) * 100) / 100;
  const parentsAmt     = Math.round(julyDividends * 0.10 * 100) / 100;
  const savingsAmt     = Math.round(julyDividends * 0.10 * 100) / 100;
  const entertainAmt   = Math.round(julyDividends * 0.10 * 100) / 100;
  const distributed    = charityAmt + parentsAmt + savingsAmt + entertainAmt;
  const remaining      = Math.max(0, julyDividends - distributed);
  const largeDreamAmt  = Math.round(remaining * 0.50 * 100) / 100;
  const smallDreamAmt  = Math.round(remaining * 0.50 * 100) / 100;

  await db.insert(davlatovAllocationsTable).values({
    sourceType:      "dividend",
    sourceAmount:    julyDividends,
    charityPct,
    charityAmt,
    parentsAmt,
    savingsAmt,
    entertainmentAmt: entertainAmt,
    largeDreamAmt,
    smallDreamAmt,
    notes:           "Дивиденды июль 2026 — все проекты",
  });
  console.log("  ✓ Davlatov allocation (1 — дивиденды июль 2026)");

  console.log("\n✅ Seed complete. All modules now have realistic test data.");
}

seed()
  .catch((err) => { console.error("❌ Seed failed:", err); process.exit(1); })
  .finally(() => pool.end());
