import { Router, type IRouter, type Request, type Response } from "express";
import {
  clearSession,
  createSession,
  getLocalUser,
  getSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
  verifyLocalPassword,
  type SessionData,
} from "../lib/auth";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

router.get("/auth/user", (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ user: req.isAuthenticated() ? req.user : null });
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    if (!verifyLocalPassword(req.body?.password)) {
      res.status(401).json({ error: "Неверный пароль" });
      return;
    }

    const user = await getLocalUser();
    const session: SessionData = {
      user,
      accessToken: "local-session",
      expiresAt: Math.floor(Date.now() / 1000) + Math.floor(SESSION_TTL / 1000),
    };

    setSessionCookie(res, await createSession(session));
    res.json({ user });
  } catch (error) {
    req.log?.error?.(error, "local login failed");
    res.status(500).json({ error: "Ошибка входа" });
  }
});

router.get("/login", (_req, res) => {
  res.status(405).json({ error: "Используйте форму входа" });
});

router.get("/logout", async (req: Request, res: Response) => {
  await clearSession(res, getSessionId(req));
  res.redirect("/");
});

export default router;