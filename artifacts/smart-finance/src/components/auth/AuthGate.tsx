import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, login } = useAuth();

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
            Войдите, чтобы видеть только свои финансы, документы и гипотезы.
          </p>
          <Button className="mt-7 w-full gap-2" onClick={login}>
            <LockKeyhole className="h-4 w-4" />
            Войти в защищённый кабинет
          </Button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}