import { Router } from "express";
import { runPurchaseCheck } from "./advisor";

const router = Router();

function isAdvisorMessage(text: string) {
  return /^(хочу купить|можно потратить)/iu.test(text)
    || /(совет|можно ли|стоит ли|разумно ли|могу ли|нужно ли|купить|потратить|покупк)/iu.test(text);
}

async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed with status ${response.status}`);
}

// POST /telegram/webhook
router.post("/telegram/webhook", async (req, res) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && req.header("x-telegram-bot-api-secret-token") !== expectedSecret) {
    res.status(401).json({ error: "Invalid Telegram webhook secret" });
    return;
  }

  const update = req.body as {
    message?: { text?: unknown; chat?: { id?: number | string }; from?: { id?: number } };
  };
  const text = typeof update.message?.text === "string" ? update.message.text.trim() : "";
  const chatId = update.message?.chat?.id;
  if (!text || chatId === undefined || !isAdvisorMessage(text)) {
    res.json({ ok: true, routed: "standard_transaction_logger", handled: false });
    return;
  }
  const userId = update.message?.from?.id ?? (typeof chatId === "number" ? chatId : Number(chatId));
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "Telegram message has no valid user id" });
    return;
  }

  try {
    const result = await runPurchaseCheck(text, userId);
    await sendTelegramMessage(chatId, result.responseText);
    res.json({ ok: true, routed: "advisor", response: result.responseText, isFallback: result.isFallback });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram advisor failed";
    if (message === "TELEGRAM_BOT_TOKEN is not configured") {
      res.status(503).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
});

export default router;