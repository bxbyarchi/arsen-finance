import { Router, type Request, type Response } from "express";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, debtsTable, expensesTable, incomesTable, profileTable, telegramWebhookUpdatesTable } from "@workspace/db";
import { runAdvisorChat } from "./advisor";
import { logger } from "../lib/logger";
import {
  createTelegramLinkToken,
  getTelegramLinkStatus,
  linkTelegramChat,
  ownerIdForTelegramChat,
  unlinkTelegramChat,
} from "../services/telegramLink";

const router = Router();
const TELEGRAM_API_TIMEOUT_MS = 8_000;
const TELEGRAM_QUEUE_MAX_ATTEMPTS = 3;
const TELEGRAM_QUEUE_RETRY_DELAY_MS = 1_000;

type TelegramMessage = {
  chat?: { id?: number | string; type?: string };
  text?: unknown;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type QueuedTelegramPayload = {
  chatId: string;
  chatType: string;
  text: string;
};

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
}

function webhookSecret() {
  const configured = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (configured) return configured;
  const secretMaterial = process.env.SESSION_SECRET?.trim() || botToken();
  return secretMaterial
    ? createHash("sha256").update(`arsen-telegram-webhook:${secretMaterial}`).digest("base64url")
    : "";
}

function updateEncryptionKey() {
  const secretMaterial = process.env.SESSION_SECRET?.trim() || botToken();
  if (!secretMaterial) throw new Error("Telegram update encryption material is not configured");
  return createHash("sha256").update(`arsen-telegram-update:${secretMaterial}`).digest();
}

function encryptTelegramPayload(payload: QueuedTelegramPayload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", updateEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decryptTelegramPayload(ciphertext: string): QueuedTelegramPayload {
  const [ivValue, tagValue, dataValue] = ciphertext.split(".");
  if (!ivValue || !tagValue || !dataValue) throw new Error("Invalid encrypted Telegram update");
  const decipher = createDecipheriv("aes-256-gcm", updateEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const payload = JSON.parse(plaintext) as Partial<QueuedTelegramPayload>;
  if (typeof payload.chatId !== "string" || typeof payload.chatType !== "string" || typeof payload.text !== "string") {
    throw new Error("Invalid decrypted Telegram update");
  }
  return { chatId: payload.chatId, chatType: payload.chatType, text: payload.text };
}

function queuedPayloadForUpdate(update: TelegramUpdate): QueuedTelegramPayload | null {
  const chatId = update.message?.chat?.id;
  const text = typeof update.message?.text === "string" ? update.message.text : "";
  if (chatId === undefined || !text) return null;
  return {
    chatId: String(chatId),
    chatType: update.message?.chat?.type ?? "private",
    text,
  };
}

function publicAppUrl() {
  const value = process.env.REPLIT_APP_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("REPLIT_APP_URL is not set; publish the app and set its HTTPS URL first");
  if (!/^https:\/\//i.test(value)) throw new Error("REPLIT_APP_URL must start with https://");
  return value;
}

async function telegramApi<T>(method: string, body: Record<string, unknown>) {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
  });
  const payload = await response.json() as TelegramApiResponse<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `Telegram API returned ${response.status}`);
  }
  return payload.result;
}

async function telegramApiGet<T>(method: string, query: Record<string, string>) {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
  });
  const payload = await response.json() as T;
  return { status: response.status, payload };
}

function webhookUrl() {
  return `${publicAppUrl()}/api/telegram/webhook`;
}

export async function registerTelegramWebhook() {
  if (!botToken()) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN is missing; webhook registration skipped");
    return { registered: false, reason: "missing_token" };
  }
  const secret = webhookSecret();
  if (!secret) {
    console.warn("[telegram] webhook secret material is missing; webhook registration skipped");
    return { registered: false, reason: "missing_webhook_secret" };
  }
  let url: string;
  try {
    url = `${publicAppUrl()}/api/telegram/webhook`;
  } catch (error) {
    console.warn(`[telegram] ${error instanceof Error ? error.message : String(error)}; webhook registration skipped`);
    return { registered: false, reason: "missing_https_app_url" };
  }

  try {
    const result = await telegramApi<{ url: string; pending_update_count: number }>("setWebhook", {
      url,
      allowed_updates: ["message"],
      ...(secret ? { secret_token: secret } : {}),
    });
    console.log(`[telegram] webhook registered: ${url} (pending updates: ${result?.pending_update_count ?? 0})`);
    return { registered: true, url, pendingUpdateCount: result?.pending_update_count ?? 0 };
  } catch (error) {
    console.error("[telegram] webhook registration failed:", error instanceof Error ? error.message : error);
    return { registered: false, reason: "telegram_api_error" };
  }
}

function isAdvisorMessage(text: string) {
  return !text.startsWith("/");
}

const EXPENSE_CATEGORIES: Record<string, string> = {
  еда: "food",
  питание: "food",
  продукты: "food",
  food: "food",
  транспорт: "transport",
  такси: "transport",
  бензин: "transport",
  transport: "transport",
  жилье: "housing",
  жильё: "housing",
  аренда: "housing",
  housing: "housing",
  коммуналка: "utilities",
  связь: "utilities",
  utilities: "utilities",
  здоровье: "health",
  лекарства: "health",
  health: "health",
  разное: "miscellaneous",
  другое: "miscellaneous",
  miscellaneous: "miscellaneous",
};

function parseAmount(text: string) {
  const normalized = text.replace(/\u00a0/g, " ").trim();
  const match = normalized.match(/^(?:сумма\s*)?([\d\s]+(?:[,.]\d{1,2})?)\s*(?:сом|kgs?)?$/iu);
  if (!match) return null;
  const value = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseLinkToken(text: string) {
  const match = text.trim().match(/^\/(?:start|link)(?:@\w+)?(?:\s+([A-Za-z0-9-]+))?\s*$/iu);
  return match ? (match[1]?.trim().toUpperCase() ?? null) : undefined;
}

function parseTelegramExpense(text: string) {
  const match = text.match(/^\/?(?:expense|расход)(?:@\w+)?\s+([\d\s.,]+)\s+(\S+)(?:\s+(.+))?\s*$/iu);
  if (!match) return null;
  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  const category = EXPENSE_CATEGORIES[match[2].toLowerCase()];
  if (!Number.isFinite(amount) || amount <= 0 || !category) return null;
  return {
    amount,
    category,
    name: match[3]?.trim() || `Расход из Telegram: ${match[2]}`,
  };
}

function formatSom(amount: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount)} сом`;
}

function unlinkedMessage() {
  return [
    "Этот Telegram-чат ещё не связан с Arsen Finance.",
    "Откройте «Настройки → Telegram» в веб-приложении, создайте код и отправьте сюда: /link <код>.",
  ].join("\n");
}

function linkedHelpMessage() {
  return [
    "Telegram подключён к вашему Arsen Finance.",
    "",
    "Команды:",
    "• /status — краткий финансовый статус",
    "• /expense 450 еда продукты — добавить расход",
    "• Любой вопрос о деньгах — совет от ИИ",
  ].join("\n");
}

const LINK_SUCCESS_REPLY = "✅ Аккаунт успешно привязан! Теперь вы можете записывать расходы и запрашивать финансовые аналитики прямо здесь.";
const LINK_INVALID_REPLY = "❌ Неверный или истекший код привязки. Сгенерируйте новый код в Настройках веб-приложения.";
const LINK_FAILURE_REPLY = "⚠️ Не удалось привязать аккаунт из-за временной ошибки. Попробуйте сгенерировать новый код в Настройках веб-приложения.";
const TELEGRAM_FAILURE_REPLY = "⚠️ Не удалось обработать сообщение из-за временной ошибки. Попробуйте ещё раз.";

async function replyToChat(chatId: number | string, text: string) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

function validSetupRequest(req: Request) {
  const configuredSecret = process.env.TELEGRAM_SETUP_SECRET?.trim()
    || process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return req.isAuthenticated() || Boolean(configuredSecret && req.header("x-telegram-setup-secret") === configuredSecret);
}

function authenticatedOwnerId(req: Request, res: Response) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id;
}

function botUsername() {
  const configured = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return configured && /^[A-Za-z0-9_]{5,}$/.test(configured) ? configured : "arsenfinancebot";
}

// GET /telegram/link-status — private status for the signed-in web user.
router.get("/telegram/link-status", async (req, res): Promise<void> => {
  const ownerId = authenticatedOwnerId(req, res);
  if (!ownerId) return;
  res.json(await getTelegramLinkStatus(ownerId));
});

// POST /telegram/link-token — issue a one-time, short-lived Telegram linking token.
router.post("/telegram/link-token", async (req, res): Promise<void> => {
  const ownerId = authenticatedOwnerId(req, res);
  if (!ownerId) return;
  const { token, expiresAt } = await createTelegramLinkToken(ownerId);
  const username = botUsername();
  res.status(201).json({
    connected: false,
    command: `/link ${token}`,
    deepLink: `https://t.me/${username}?start=${token}`,
    expiresAt: expiresAt.toISOString(),
  });
});

// DELETE /telegram/link — disconnect the signed-in user's Telegram chat.
router.delete("/telegram/link", async (req, res): Promise<void> => {
  const ownerId = authenticatedOwnerId(req, res);
  if (!ownerId) return;
  res.json(await unlinkTelegramChat(ownerId));
});

// GET /telegram/set-webhook — manually force Telegram to use the configured public webhook URL.
router.get("/telegram/set-webhook", async (req, res): Promise<void> => {
  if (!validSetupRequest(req)) {
    res.status(401).json({ error: "Telegram setup secret required" });
    return;
  }
  try {
    const configuredSecret = webhookSecret();
    if (!configuredSecret) {
      res.status(503).json({ ok: false, description: "Telegram webhook secret material is unavailable" });
      return;
    }
    const configuredWebhookUrl = webhookUrl();
    const result = await telegramApiGet<TelegramApiResponse<{ url: string }>>("setWebhook", {
      url: configuredWebhookUrl,
      secret_token: configuredSecret,
    });
    res.status(result.status).json(result.payload);
  } catch (error) {
    console.error("[telegram] manual webhook setup failed:", error instanceof Error ? error.message : error);
    res.status(502).json({
      ok: false,
      description: error instanceof Error ? error.message : "Telegram webhook setup failed",
    });
  }
});

// GET /telegram/status — return Telegram's current webhook configuration.
router.get("/telegram/status", async (req, res): Promise<void> => {
  if (!validSetupRequest(req)) {
    res.status(401).json({ error: "Telegram setup secret required" });
    return;
  }
  try {
    const result = await telegramApiGet<TelegramApiResponse<unknown>>("getWebhookInfo", {});
    res.status(result.status).json(result.payload);
  } catch (error) {
    console.error("[telegram] webhook status check failed:", error instanceof Error ? error.message : error);
    res.status(502).json({
      ok: false,
      description: error instanceof Error ? error.message : "Telegram webhook status unavailable",
    });
  }
});

// POST /telegram/setup-webhook — authenticated admin retry after publishing.
router.post("/telegram/setup-webhook", async (req, res) => {
  if (!validSetupRequest(req)) {
    res.status(401).json({ error: "Telegram setup secret required" });
    return;
  }
  const result = await registerTelegramWebhook();
  if (!result.registered) {
    res.status(503).json({
      error: "Webhook was not registered",
      reason: result.reason,
      hint: "Set REPLIT_APP_URL to the published HTTPS domain, then retry.",
    });
    return;
  }
  res.json(result);
});

async function financialStatusMessage(ownerId: string) {
  const [profiles, debts, expenses, incomes] = await Promise.all([
    db.select({ currentSavings: profileTable.currentSavings }).from(profileTable).where(eq(profileTable.ownerId, ownerId)).limit(1),
    db.select({ totalDebt: debtsTable.totalDebt, monthlyPayment: debtsTable.monthlyPayment }).from(debtsTable).where(eq(debtsTable.ownerId, ownerId)),
    db.select({ amount: expensesTable.amount }).from(expensesTable).where(eq(expensesTable.ownerId, ownerId)),
    db.select({ projectedAmount: incomesTable.projectedAmount }).from(incomesTable).where(eq(incomesTable.ownerId, ownerId)),
  ]);
  const totalDebt = debts.reduce((sum, debt) => sum + debt.totalDebt, 0);
  const monthlyDebtPayment = debts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
  const monthlyExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const monthlyIncome = incomes.reduce((sum, income) => sum + income.projectedAmount, 0);
  return [
    "Ваш финансовый статус:",
    `Накопления: ${formatSom(profiles[0]?.currentSavings ?? 0)}`,
    `Долги: ${formatSom(totalDebt)}; платежи: ${formatSom(monthlyDebtPayment)}/мес`,
    `План расходов: ${formatSom(monthlyExpenses)}/мес`,
    `План доходов: ${formatSom(monthlyIncome)}/мес`,
  ].join("\n");
}

async function processTelegramUpdateInner(update: TelegramUpdate, updateId: number) {
  const chatId = update?.message?.chat?.id;
  const text = typeof update?.message?.text === "string" ? update.message.text.trim() : "";
  if (chatId === undefined || !text) {
    return;
  }
  if (update.message?.chat?.type && update.message.chat.type !== "private") {
    await replyToChat(chatId, "Для защиты финансовых данных бот работает только в личном чате.");
    return;
  }

  const chatIdValue = String(chatId);
  const linkToken = parseLinkToken(text);
  if (linkToken !== undefined) {
    if (!linkToken) {
      await replyToChat(chatId, LINK_INVALID_REPLY);
      return;
    }
    const result = await linkTelegramChat(linkToken, chatIdValue);
    const reply = result.status === "linked"
      ? LINK_SUCCESS_REPLY
      : result.status === "chat_already_linked"
        ? "Этот Telegram-чат уже связан с другим аккаунтом. Сначала отключите его в настройках того аккаунта."
        : LINK_INVALID_REPLY;
    await replyToChat(chatId, reply);
    return;
  }

  const ownerId = await ownerIdForTelegramChat(chatIdValue);
  if (!ownerId) {
    await replyToChat(chatId, unlinkedMessage());
    return;
  }

  let reply: string;
  if (/^\/status(?:@\w+)?\s*$/iu.test(text) || /^(?:статус|мой баланс)$/iu.test(text)) {
    reply = await financialStatusMessage(ownerId);
  } else {
    const expense = parseTelegramExpense(text);
    if (expense) {
      const [createdExpense] = await db.insert(expensesTable).values({
        ownerId,
        ...expense,
        isEssential: false,
        emotionalTrigger: "routine",
        isImpulseBuy: false,
        telegramUpdateId: updateId,
      }).onConflictDoNothing().returning({ id: expensesTable.id });
      reply = createdExpense
        ? `Расход добавлен: ${expense.name} — ${formatSom(expense.amount)}.`
        : "Этот расход уже учтён.";
    } else if (parseAmount(text) !== null) {
      reply = "Чтобы записать расход, добавьте категорию: /expense 450 еда продукты.";
    } else if (isAdvisorMessage(text)) {
      const advice = await runAdvisorChat(text, [], ownerId);
      reply = advice.responseText;
    } else {
      reply = linkedHelpMessage();
    }
  }
  await replyToChat(chatId, reply);
  console.log(`[telegram] reply sent to chat ${chatId}`);
}

async function processTelegramUpdate(update: TelegramUpdate, updateId: number) {
  const chatId = update?.message?.chat?.id;
  const text = typeof update?.message?.text === "string" ? update.message.text.trim() : "";
  try {
    await processTelegramUpdateInner(update, updateId);
  } catch (error) {
    const isLinkingFailure = parseLinkToken(text) !== undefined;
    logger.error({ err: error, updateId }, "[telegram] update processing failed");
    if (chatId !== undefined) {
      try {
        await replyToChat(chatId, isLinkingFailure ? LINK_FAILURE_REPLY : TELEGRAM_FAILURE_REPLY);
      } catch (replyError) {
        logger.error({ err: replyError, updateId }, "[telegram] failed to send processing error reply");
      }
    }
    throw error;
  }
}

async function processQueuedTelegramUpdate(updateId: number) {
  const [queued] = await db.update(telegramWebhookUpdatesTable)
    .set({
      status: "processing",
      attempts: sql`${telegramWebhookUpdatesTable.attempts} + 1`,
      lastError: null,
    })
    .where(and(
      eq(telegramWebhookUpdatesTable.updateId, updateId),
      inArray(telegramWebhookUpdatesTable.status, ["pending", "failed"]),
    ))
    .returning({
      updateId: telegramWebhookUpdatesTable.updateId,
      chatId: telegramWebhookUpdatesTable.chatId,
      chatType: telegramWebhookUpdatesTable.chatType,
      messageCiphertext: telegramWebhookUpdatesTable.messageCiphertext,
      attempts: telegramWebhookUpdatesTable.attempts,
    });
  if (!queued) return;

  try {
    const payload = decryptTelegramPayload(queued.messageCiphertext);
    await processTelegramUpdate({
      update_id: queued.updateId,
      message: {
        chat: { id: payload.chatId, type: payload.chatType },
        text: payload.text,
      },
    }, queued.updateId);
    await db.update(telegramWebhookUpdatesTable)
      .set({ status: "succeeded", processedAt: new Date(), lastError: null })
      .where(eq(telegramWebhookUpdatesTable.updateId, queued.updateId));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Telegram update processing failed";
    await db.update(telegramWebhookUpdatesTable)
      .set({ status: "failed", lastError: message })
      .where(eq(telegramWebhookUpdatesTable.updateId, queued.updateId));
    logger.error({ err: error, updateId: queued.updateId }, "[telegram] queued webhook processing failed");
    if (queued.attempts < TELEGRAM_QUEUE_MAX_ATTEMPTS) {
      setTimeout(() => {
        void processQueuedTelegramUpdate(queued.updateId);
      }, TELEGRAM_QUEUE_RETRY_DELAY_MS);
    }
  }
}

export async function recoverTelegramWebhookUpdates() {
  await db.update(telegramWebhookUpdatesTable)
    .set({ status: "pending" })
    .where(eq(telegramWebhookUpdatesTable.status, "processing"));
  const queued = await db.select({ updateId: telegramWebhookUpdatesTable.updateId })
    .from(telegramWebhookUpdatesTable)
    .where(and(
      inArray(telegramWebhookUpdatesTable.status, ["pending", "failed"]),
      sql`${telegramWebhookUpdatesTable.attempts} < ${TELEGRAM_QUEUE_MAX_ATTEMPTS}`,
    ))
    .limit(100);
  for (const update of queued) {
    void processQueuedTelegramUpdate(update.updateId);
  }
}

// POST /telegram/webhook — Telegram calls this endpoint with each update.
router.post("/telegram/webhook", async (req, res): Promise<void> => {
  const expectedSecret = webhookSecret();
  if (!expectedSecret) {
    logger.error("[telegram] webhook rejected because secret material is not configured");
    res.status(503).json({ error: "Telegram webhook secret is not configured" });
    return;
  }
  if (req.header("x-telegram-bot-api-secret-token") !== expectedSecret) {
    console.warn("[telegram] rejected webhook with invalid secret header");
    res.status(401).json({ error: "Invalid Telegram webhook secret" });
    return;
  }

  const update = req.body as TelegramUpdate;
  if (!Number.isInteger(update.update_id) || update.update_id === undefined || update.update_id < 0) {
    res.status(400).json({ error: "Telegram update_id is required" });
    return;
  }
  const payload = queuedPayloadForUpdate(update);
  if (!payload) {
    res.status(200).json({ ok: true, accepted: true });
    return;
  }
  const [storedUpdate] = await db.insert(telegramWebhookUpdatesTable)
    .values({
      updateId: update.update_id,
      chatId: payload.chatId,
      chatType: payload.chatType,
      messageCiphertext: encryptTelegramPayload(payload),
    })
    .onConflictDoNothing()
    .returning({ updateId: telegramWebhookUpdatesTable.updateId });
  logger.info({ updateId: update.update_id }, "[telegram] verified webhook update accepted");
  res.status(200).json({ ok: true, accepted: Boolean(storedUpdate) });
  void processQueuedTelegramUpdate(update.update_id);
});

export default router;