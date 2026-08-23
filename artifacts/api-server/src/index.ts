import app from "./app";
import { logger } from "./lib/logger";
import { recoverTelegramWebhookUpdates, registerTelegramWebhook } from "./routes/telegram";

const rawPort = process.env.PORT ?? process.env.API_PORT ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void registerTelegramWebhook();
  void recoverTelegramWebhookUpdates();
});
