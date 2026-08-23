import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, telegramLinkTokensTable, usersTable } from "@workspace/db";

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
const LINK_TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type LinkResult =
  | { status: "linked"; ownerId: string }
  | { status: "invalid_or_expired" }
  | { status: "chat_already_linked" };

function hashToken(token: string) {
  return createHash("sha256").update(token.trim().toUpperCase()).digest("hex");
}

function isLinkToken(value: string) {
  return /^[A-HJ-NP-Z2-9]{6}$/i.test(value.trim());
}

function generateLinkToken() {
  const bytes = randomBytes(6);
  return Array.from(bytes, (byte) => LINK_TOKEN_ALPHABET[byte & 31]).join("");
}

export async function createTelegramLinkToken(ownerId: string) {
  const token = generateLinkToken();
  const now = new Date();
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
  await db.update(telegramLinkTokensTable)
    .set({ usedAt: now })
    .where(and(
      eq(telegramLinkTokensTable.ownerId, ownerId),
      isNull(telegramLinkTokensTable.usedAt),
    ));
  await db.insert(telegramLinkTokensTable).values({
    ownerId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function getTelegramLinkStatus(ownerId: string) {
  const [user] = await db
    .select({ telegramChatId: usersTable.telegramChatId })
    .from(usersTable)
    .where(eq(usersTable.id, ownerId))
    .limit(1);
  return { connected: Boolean(user?.telegramChatId) };
}

export async function unlinkTelegramChat(ownerId: string) {
  await db.update(usersTable)
    .set({ telegramChatId: null, updatedAt: new Date() })
    .where(eq(usersTable.id, ownerId));
  return { connected: false };
}

export async function ownerIdForTelegramChat(chatId: string) {
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.telegramChatId, chatId))
    .limit(1);
  return user?.id ?? null;
}

export async function linkTelegramChat(token: string, chatId: string): Promise<LinkResult> {
  if (!isLinkToken(token)) return { status: "invalid_or_expired" };
  const now = new Date();
  const tokenHash = hashToken(token);
  try {
    return await db.transaction(async (tx): Promise<LinkResult> => {
      const [chatOwner] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.telegramChatId, chatId))
        .limit(1);

      const [claimedToken] = await tx
        .update(telegramLinkTokensTable)
        .set({ usedAt: now })
        .where(and(
          eq(telegramLinkTokensTable.tokenHash, tokenHash),
          isNull(telegramLinkTokensTable.usedAt),
          gt(telegramLinkTokensTable.expiresAt, now),
        ))
        .returning({ ownerId: telegramLinkTokensTable.ownerId });

      if (!claimedToken) {
        const [previousToken] = await tx
          .select({ ownerId: telegramLinkTokensTable.ownerId })
          .from(telegramLinkTokensTable)
          .where(eq(telegramLinkTokensTable.tokenHash, tokenHash))
          .limit(1);
        if (!previousToken) return { status: "invalid_or_expired" };
        const [owner] = await tx
          .select({ telegramChatId: usersTable.telegramChatId })
          .from(usersTable)
          .where(eq(usersTable.id, previousToken.ownerId))
          .limit(1);
        return owner?.telegramChatId === chatId
          ? { status: "linked", ownerId: previousToken.ownerId }
          : { status: "invalid_or_expired" };
      }
      if (chatOwner && chatOwner.id !== claimedToken.ownerId) {
        throw new Error("telegram_chat_already_linked");
      }

      await tx.update(usersTable)
        .set({ telegramChatId: chatId, updatedAt: now })
        .where(eq(usersTable.id, claimedToken.ownerId));
      return { status: "linked", ownerId: claimedToken.ownerId };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "telegram_chat_already_linked") {
      return { status: "chat_already_linked" };
    }
    throw error;
  }
}