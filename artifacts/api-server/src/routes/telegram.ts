import { Router } from "express";

const router = Router();

function isAdvisorMessage(text: string) {
  return /^(хочу купить|можно потратить)/iu.test(text)
    || /(совет|можно ли|стоит ли|разумно ли|могу ли|нужно ли|купить|потратить|покупк)/iu.test(text);
}

// POST /telegram/webhook
router.post("/telegram/webhook", async (req, res) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    res.status(503).json({ error: "Telegram webhook is not configured" });
    return;
  }
  if (req.header("x-telegram-bot-api-secret-token") !== expectedSecret) {
    res.status(401).json({ error: "Invalid Telegram webhook secret" });
    return;
  }

  const update = req.body as { message?: { text?: unknown } };
  const text = typeof update.message?.text === "string" ? update.message.text.trim() : "";
  if (!text || !isAdvisorMessage(text)) {
    res.json({ ok: true, routed: "standard_transaction_logger", handled: false });
    return;
  }
  res.status(409).json({
    error: "Telegram financial advice requires an account-linking feature before it can access private data",
  });
});

export default router;