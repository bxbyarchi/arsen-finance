import { Router, type Request } from "express";
import { runAdvisorChat } from "./advisor";

const router = Router();
const TELEGRAM_API_TIMEOUT_MS = 8_000;

type TelegramMessage = {
  chat?: { id?: number | string };
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

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
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

function webhookUrlForRequest(req: Request) {
  const queryUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  const configuredUrl = process.env.REPLIT_APP_URL?.trim() ?? "";
  const requestHost = req.get("host")?.trim() ?? "";
  const baseUrl = (queryUrl || configuredUrl || `https://${requestHost}`).replace(/\/+$/, "");
  if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
    throw new Error("Webhook URL must start with https://. Pass ?url=https://your-public-app.example");
  }
  return `${baseUrl}/api/telegram/webhook`;
}

export async function registerTelegramWebhook() {
  if (!botToken()) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN is missing; webhook registration skipped");
    return { registered: false, reason: "missing_token" };
  }
  let url: string;
  try {
    url = `${publicAppUrl()}/api/telegram/webhook`;
  } catch (error) {
    console.warn(`[telegram] ${error instanceof Error ? error.message : String(error)}; webhook registration skipped`);
    return { registered: false, reason: "missing_https_app_url" };
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
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

function parseAmount(text: string) {
  const normalized = text.replace(/\u00a0/g, " ").trim();
  const match = normalized.match(/^(?:сумма\s*)?([\d\s]+(?:[,.]\d{1,2})?)\s*(?:сом|kgs?)?$/iu);
  if (!match) return null;
  const value = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatSom(amount: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount)} сом`;
}

function helpMessage() {
  return [
    "Привет! Я Arsen Finance.",
    "",
    "Напишите сумму, например: 400 или 555 — я подтвержу получение.",
    "Для финансового совета: «Можно ли купить курс за 5000 сом?»",
    "Чтобы совет учитывал ваш личный профиль, сначала свяжите Telegram с аккаунтом приложения.",
  ].join("\n");
}

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

// GET /telegram/set-webhook — manually force Telegram to use the public webhook URL.
router.get("/telegram/set-webhook", async (req, res): Promise<void> => {
  if (!validSetupRequest(req)) {
    res.status(401).json({ error: "Authentication or Telegram setup secret required" });
    return;
  }
  try {
    const webhookUrl = webhookUrlForRequest(req);
    const result = await telegramApiGet<TelegramApiResponse<{ url: string }>>("setWebhook", {
      url: webhookUrl,
      ...(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
        ? { secret_token: process.env.TELEGRAM_WEBHOOK_SECRET.trim() }
        : {}),
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
    res.status(401).json({ error: "Authentication or Telegram setup secret required" });
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
    res.status(401).json({ error: "Authentication or Telegram setup secret required" });
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

async function processTelegramUpdate(update: TelegramUpdate) {
  const chatId = update?.message?.chat?.id;
  const text = typeof update?.message?.text === "string" ? update.message.text.trim() : "";
  if (chatId === undefined || !text) {
    return;
  }

  let reply = helpMessage();
  if (/^\/start(?:@\w+)?(?:\s|$)/iu.test(text)) {
    reply = helpMessage();
  } else {
    const amount = parseAmount(text);
    if (amount !== null) {
      console.log(`[telegram] parsed numeric transaction amount: ${amount}`);
      reply = `Получил сумму ${formatSom(amount)}.\nЧтобы записать расход с категорией, напишите, например: «еда ${formatSom(amount)}».`;
    } else if (isAdvisorMessage(text)) {
      const ownerId = process.env.TELEGRAM_OWNER_USER_ID?.trim();
      if (!ownerId) {
        reply = "Чтобы дать персональный совет, сначала свяжите этот Telegram-чат с аккаунтом Arsen Finance.";
      } else {
        const advice = await runAdvisorChat(text, [], ownerId);
        reply = advice.responseText;
      }
    }
  }

  await replyToChat(chatId, reply);
  console.log(`[telegram] reply sent to chat ${chatId}`);
}

// POST /telegram/webhook — Telegram calls this endpoint with each update.
router.post("/telegram/webhook", (req, res): void => {
  console.log("INCOMING TELEGRAM UPDATE:", JSON.stringify(req.body));
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (expectedSecret && req.header("x-telegram-bot-api-secret-token") !== expectedSecret) {
    console.warn("[telegram] rejected webhook with invalid secret header");
    res.status(401).json({ error: "Invalid Telegram webhook secret" });
    return;
  }

  const update = req.body as TelegramUpdate;
  res.status(200).json({ ok: true, accepted: true });
  void processTelegramUpdate(update).catch((error) => {
    console.error("[telegram] webhook processing failed:", error instanceof Error ? error.message : error);
  });
});

export default router;