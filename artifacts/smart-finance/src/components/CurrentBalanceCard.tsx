import { useEffect, useState } from "react";
import { Wallet, Plus, Minus, Sparkles, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const fmt = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v)) + " сом";

type Distribution = { balance: number; reserve: number; debts: { creditorName: string; amount: number }[]; goals: number; free: number; reason: string; source: string };

export default function CurrentBalanceCard() {
  const { toast } = useToast();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<"set" | "transaction" | null>(null);
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await fetch("/api/balance"); const d = await r.json(); setBalance(Number(d.balance ?? 0)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const saveSet = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) return;
    const r = await fetch("/api/balance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ balance: value }) });
    if (!r.ok) { toast({ title: "Не удалось сохранить баланс", variant: "destructive" }); return; }
    setBalance(value); setDialog(null); setAmount(""); toast({ title: "Текущий баланс обновлён" });
  };

  const addTransaction = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    const r = await fetch("/api/balance/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: value, type, note }) });
    const d = await r.json().catch(() => null);
    if (!r.ok) { toast({ title: d?.error ?? "Операция не выполнена", variant: "destructive" }); return; }
    setBalance(Number(d.balance)); setDialog(null); setAmount(""); setNote(""); toast({ title: type === "deposit" ? "Баланс пополнен" : "Деньги списаны" });
  };

  const askAI = async () => {
    setAiLoading(true);
    try {
      const r = await fetch("/api/ai/balance-distribution");
      if (!r.ok) throw new Error();
      setDistribution(await r.json());
    } catch { toast({ title: "Не удалось получить распределение", variant: "destructive" }); }
    finally { setAiLoading(false); }
  };

  return (
    <>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div><CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Мой текущий баланс</CardTitle><CardDescription>Реальные деньги, которыми ты сейчас располагаешь</CardDescription></div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold tracking-tight mb-5">{fmt(balance)}</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setType("deposit"); setDialog("transaction"); }}><Plus className="mr-2 h-4 w-4" /> Пополнить</Button>
            <Button variant="outline" onClick={() => { setType("withdrawal"); setDialog("transaction"); }}><Minus className="mr-2 h-4 w-4" /> Списать</Button>
            <Button variant="secondary" onClick={() => { setAmount(String(balance)); setDialog("set"); }}>Изменить баланс</Button>
            <Button variant="outline" onClick={askAI} disabled={aiLoading}><Sparkles className="mr-2 h-4 w-4" /> {aiLoading ? "ИИ считает…" : "Как распределить деньги"}</Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle>{dialog === "set" ? "Текущий баланс" : type === "deposit" ? "Пополнить баланс" : "Списать с баланса"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">{dialog === "set" ? "Сумма баланса (сом)" : "Сумма (сом)"}</label><Input className="mt-2" type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} autoFocus /></div>
            {dialog === "transaction" && <div><label className="text-sm font-medium">Комментарий</label><Input className="mt-2" value={note} onChange={e => setNote(e.target.value)} placeholder="Например: получил зарплату" /></div>}
            <Button className="w-full" onClick={dialog === "set" ? saveSet : addTransaction}>{dialog === "set" ? "Сохранить" : type === "deposit" ? "Пополнить" : "Списать"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={distribution !== null} onOpenChange={(open) => !open && setDistribution(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> ИИ: как распределить текущий баланс</DialogTitle></DialogHeader>
          {distribution && <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4"><div className="text-xs text-muted-foreground">Сейчас доступно</div><div className="text-2xl font-bold">{fmt(distribution.balance)}</div></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Резерв</div><div className="font-bold">{fmt(distribution.reserve)}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Цели</div><div className="font-bold">{fmt(distribution.goals)}</div></div>
            </div>
            {distribution.debts.length > 0 && <div><div className="text-sm font-semibold mb-2">Долги</div>{distribution.debts.map((d, i) => <div key={`${d.creditorName}-${i}`} className="flex justify-between border-b py-2 text-sm"><span>{d.creditorName}</span><span className="font-mono">{fmt(d.amount)}</span></div>)}</div>}
            <div className="flex justify-between rounded-lg border p-3"><span className="font-semibold">Свободный остаток</span><span className="font-bold">{fmt(distribution.free)}</span></div>
            <p className="text-sm text-muted-foreground">{distribution.reason}</p>
            <p className="text-xs text-muted-foreground">ИИ только предлагает распределение. Деньги автоматически никуда не переводятся.</p>
          </div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
