import app from "./app";
import { logger } from "./lib/logger";
import { ensureDebtSchema } from "./lib/ensureDebtSchema";
import { ensureBalanceSchema } from "./lib/ensureBalanceSchema";
import { registerBookkeepingWebhook } from "./routes/telegramBookkeeping";

const rawPort = process.env.PORT ?? process.env.API_PORT ?? "8080";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

async function start() {
  try { await ensureDebtSchema(); await ensureBalanceSchema(); }
  catch (err) { logger.error({ err }, "Failed to prepare database schema"); process.exit(1); }
  app.listen(port, (err) => {
    if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
    logger.info({ port }, "Server listening");
    void registerBookkeepingWebhook();
  });
}
void start();
