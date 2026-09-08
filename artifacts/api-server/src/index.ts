import app from "./app";
import { logger } from "./lib/logger";
import { ensureDebtSchema } from "./lib/ensureDebtSchema";
import { ensureBalanceSchema } from "./lib/ensureBalanceSchema";

const rawPort = process.env.PORT ?? process.env.API_PORT ?? "8080";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

async function registerTelegramWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const publicUrl = process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || process.env.REPLIT_APP_URL || "https://arsen-finance.onrender.com";
  const webhookUrl = `${publicUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }) });
    const result = await response.json();
    logger.info({ webhookUrl, telegramOk: result?.ok }, "Telegram webhook registration completed");
  } catch (err) {
    logger.warn({ err }, "Telegram webhook registration failed");
  }
}

async function start() {
  try { await ensureDebtSchema(); await ensureBalanceSchema(); }
  catch (err) { logger.error({ err }, "Failed to prepare database schema"); process.exit(1); }
  app.listen(port, (err) => {
    if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
    logger.info({ port }, "Server listening");
    void registerTelegramWebhook();
  });
}
void start();
