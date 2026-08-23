import { Router } from "express";
import { db, expensesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router = Router();

const TRIGGERS = ["routine", "stress_buying", "status_validation", "burnout_convenience"] as const;
const CATEGORIES = ["housing", "food", "transport", "utilities", "health", "miscellaneous"] as const;
type EmotionalTrigger = (typeof TRIGGERS)[number];

const guidance: Record<EmotionalTrigger, string> = {
  routine: "Похоже на плановую трату. Хорошая база: продолжайте замечать, что поддерживает ваш бюджет.",
  stress_buying: "Похоже, покупка могла быть способом снять напряжение. Без осуждения: попробуйте сделать паузу и выбрать поддержку, которая не давит на бюджет.",
  status_validation: "Похоже, покупка могла быть связана с образом или статусом. Это нормально замечать; сравните удовольствие от покупки с вашей настоящей целью.",
  burnout_convenience: "Похоже на покупку удобства в напряжённый день. Удобство имеет ценность — подумайте, какой лимит сделает его спокойным.",
};

function isTrigger(value: unknown): value is EmotionalTrigger {
  return typeof value === "string" && TRIGGERS.includes(value as EmotionalTrigger);
}

function isCategory(value: unknown): value is (typeof CATEGORIES)[number] {
  return typeof value === "string" && CATEGORIES.includes(value as (typeof CATEGORIES)[number]);
}

function classifyTransaction(input: Record<string, unknown>): EmotionalTrigger {
  if (isTrigger(input.emotionalTrigger)) return input.emotionalTrigger;

  const text = [
    input.name,
    input.merchant,
    input.category,
    input.note,
  ].filter(Boolean).join(" ").toLowerCase();
  const dateValue = input.occurredAt ?? input.purchaseTime ?? input.timestamp;
  const date = dateValue ? new Date(String(dateValue)) : null;
  const hour = date && !Number.isNaN(date.getTime()) ? date.getHours() : -1;

  if (input.isImpulseBuy === true || (hour >= 22 || (hour >= 0 && hour < 5))) {
    if (/(стресс|устал|тревог|ноч|импульс|shopping|покупк)/i.test(text) || input.isImpulseBuy === true) {
      return "stress_buying";
    }
  }
  if (/(бренд|статус|премиум|люкс|дорог|iphone|дизайнер|имидж)/i.test(text)) {
    return "status_validation";
  }
  if (/(доставк|такси|кофе|готов|консьерж|удоб|convenience|delivery|uber|glovo)/i.test(text)) {
    return "burnout_convenience";
  }
  return "routine";
}

function validAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// POST /transactions/classify
router.post("/transactions/classify", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const expenseId = body.expenseId as number | undefined;
  const amount = body.amount;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category = body.category;
  const isEssential = body.isEssential;

  if (expenseId !== undefined && (typeof expenseId !== "number" || !Number.isInteger(expenseId) || expenseId <= 0)) {
    res.status(400).json({ error: "expenseId must be a positive integer" });
    return;
  }
  if (!name || !isCategory(category) || !validAmount(amount) || typeof isEssential !== "boolean") {
    res.status(400).json({ error: "name, a supported category, a non-negative finite amount, and boolean isEssential are required" });
    return;
  }
  if (body.isImpulseBuy !== undefined && typeof body.isImpulseBuy !== "boolean") {
    res.status(400).json({ error: "isImpulseBuy must be a boolean" });
    return;
  }

  const trigger = classifyTransaction(body);
  const isImpulseBuy = body.isImpulseBuy === true || trigger !== "routine";
  const values = { category, name, amount, isEssential, emotionalTrigger: trigger, isImpulseBuy };

  let expense;
  if (expenseId !== undefined) {
    const [updated] = await db.update(expensesTable)
      .set(values)
      .where(and(eq(expensesTable.id, expenseId), eq(expensesTable.ownerId, req.user!.id)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    expense = updated;
  } else {
    [expense] = await db.insert(expensesTable).values({ ownerId: req.user!.id, ...values }).returning();
  }

  res.status(201).json({
    expense,
    emotionalTrigger: trigger,
    isImpulseBuy,
    guidance: guidance[trigger],
    message: "Трата отмечена без оценок. Наблюдение за привычками — уже полезный шаг.",
  });
});

export default router;