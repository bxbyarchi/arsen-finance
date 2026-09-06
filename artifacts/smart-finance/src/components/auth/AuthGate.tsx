import { useEffect, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuthUserResponse {
  user: { id: string } | null;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/user", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("auth check failed");
        return response.json() as Promise<AuthUserResponse>;
      })
      .then((data) => setIsAuthenticated(Boolean(data.user)))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsLoading(false));
  }, []);

  async function login() {
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Не удалось войти");
        return;
      }
      setIsAuthenticated(true);
      setPassword("");
    } catch {
      setError("Сервер недоступен. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen grid place-items-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Проверяем защищённую сессию…</div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen grid place-items-center bg-background px-6 text-foreground">
        <section className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-primary">ARSEN</p>
          <h1 className="text-2xl font-bold tracking-tight">Ваш финансовый сейф защищён</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Введите пароль, чтобы открыть личный финансовый кабинет.
          </p>
          <div className="mt-7 space-y-3">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && password && !isSubmitting) login();
              }}
              placeholder="Пароль"
              autoComplete="current-password"
              disabled={isSubmitting}
              autoFocus
            />
            <Button className="w-full gap-2" onClick={login} disabled={!password || isSubmitting}>
              <LockKeyhole className="h-4 w-4" />
              {isSubmitting ? "Входим…" : "Войти в защищённый кабинет"}
            </Button>
          </div>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </section>
      </main>
    );
  }

  return <>{children}</>;
}