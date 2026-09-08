import { useEffect, useState } from "react";
import {
  FinancialAutonomyProfileMoneyScriptType,
  VaultDocumentInputDocCategory,
  useCreateVaultDocument,
  useDeleteVaultDocument,
  useGetFinancialAutonomyProfile,
  useGetVaultSummary,
  useUpdateFinancialAutonomyProfile,
  useVerifyVaultDocument,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileKey2, ShieldCheck, Trash2, Wallet, Target, Landmark } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

const SCRIPT_LABELS: Record<string, string> = {
  avoidance: "Избегание — хочется не смотреть на цифры",
  worship: "Поклонение — деньги кажутся мерой ценности",
  status: "Статус — деньги подтверждают образ",
  vigilance: "Бдительность — деньги дают чувство безопасности",
};
const CATEGORY_LABELS: Record<string, string> = {
  bank_account: "Банковский доступ",
  tax_file: "Налоговые документы",
  contract: "Контракты и обязательства",
  emergency_plan: "Экстренный план",
};
const fmt = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v)) + " сом";

type FinancialMetrics = {
  balance: number;
  essentialMonthly: number;
  debtMinimums: number;
  goalsSaved: number;
  goalsTarget: number;
};

export default function Autonomy() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useGetFinancialAutonomyProfile({ query: { queryKey: ["/api/financial-profile"] } });
  const { data: vault } = useGetVaultSummary({ query: { queryKey: ["/api/vault"] } });
  const updateProfile = useUpdateFinancialAutonomyProfile();
  const createDocument = useCreateVaultDocument();
  const verifyDocument = useVerifyVaultDocument();
  const deleteDocument = useDeleteVaultDocument();
  const [document, setDocument] = useState({ docCategory: "bank_account", title: "", encryptedPayload: "" });
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/balance").then(r => r.ok ? r.json() : null),
      fetch("/api/expenses").then(r => r.ok ? r.json() : []),
      fetch("/api/debts").then(r => r.ok ? r.json() : []),
      fetch("/api/goals").then(r => r.ok ? r.json() : []),
    ]).then(([balanceData, expenses, debts, goals]) => {
      if (cancelled) return;
      const essentialMonthly = (Array.isArray(expenses) ? expenses : []).filter((e: any) => e.isEssential).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const debtMinimums = (Array.isArray(debts) ? debts : []).reduce((s: number, d: any) => s + Number(d.monthlyPayment || 0), 0);
      const goalList = Array.isArray(goals) ? goals : [];
      setMetrics({
        balance: Number(balanceData?.balance || 0),
        essentialMonthly,
        debtMinimums,
        goalsSaved: goalList.reduce((s: number, g: any) => s + Number(g.currentAmount || 0), 0),
        goalsTarget: goalList.reduce((s: number, g: any) => s + Number(g.targetAmount || 0), 0),
      });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [queryClient]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/vault"] });
    queryClient.invalidateQueries({ queryKey: ["/api/financial-profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
    window.dispatchEvent(new Event("balance-updated"));
  };
  const changeProfile = (data: { moneyScriptType?: FinancialAutonomyProfileMoneyScriptType; riskToleranceIndex?: number }) => {
    updateProfile.mutate({ data }, { onSuccess: refresh });
  };
  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!document.title.trim() || !document.encryptedPayload.trim()) {
      toast({ title: "Укажите название и безопасную зашифрованную ссылку", description: "Не вводите пароли, коды или номера карт.", variant: "destructive" });
      return;
    }
    createDocument.mutate({ data: {
      docCategory: document.docCategory as VaultDocumentInputDocCategory,
      title: document.title.trim(), encryptedPayload: document.encryptedPayload.trim(), lastVerifiedAt: new Date().toISOString(),
    }}, { onSuccess: () => {
      setDocument({ docCategory: "bank_account", title: "", encryptedPayload: "" }); refresh();
      toast({ title: "Запись добавлена", description: "Содержимое не выводится в интерфейсе." });
    }});
  };

  const score = vault?.autonomyScore ?? profile?.autonomyScore ?? 0;
  const monthlySafetyNeed = (metrics?.essentialMonthly ?? 0) + (metrics?.debtMinimums ?? 0);
  const runway = monthlySafetyNeed > 0 ? (metrics?.balance ?? 0) / monthlySafetyNeed : 0;
  const reserveTarget = monthlySafetyNeed * 2;
  const reservePct = reserveTarget > 0 ? Math.min(100, ((metrics?.balance ?? 0) / reserveTarget) * 100) : 100;
  const goalPct = (metrics?.goalsTarget ?? 0) > 0 ? Math.min(100, ((metrics?.goalsSaved ?? 0) / (metrics?.goalsTarget ?? 1)) * 100) : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500"><ShieldCheck className="h-6 w-6" /></div>
        <div><h1 className="text-3xl font-bold tracking-tight">Финансовая автономия</h1><p className="text-muted-foreground mt-1">Теперь это не просто анкета: здесь видно, насколько текущие деньги защищают тебя от финансового стресса.</p></div>
      </div>

      <Card className="border-emerald-500/20">
        <CardHeader><CardTitle>Что означает автономия</CardTitle><CardDescription>Главный вопрос: «Если завтра доход остановится, сколько времени я смогу жить без новых денег?»</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl bg-muted/40 p-4"><Wallet className="h-5 w-5 mb-2 text-primary" /><p className="text-xs text-muted-foreground">Доступно сейчас</p><p className="text-2xl font-bold">{fmt(metrics?.balance ?? 0)}</p></div>
          <div className="rounded-xl bg-muted/40 p-4"><Landmark className="h-5 w-5 mb-2 text-amber-500" /><p className="text-xs text-muted-foreground">Обязательное / месяц</p><p className="text-2xl font-bold">{fmt(monthlySafetyNeed)}</p></div>
          <div className={`rounded-xl p-4 ${runway >= 2 ? "bg-emerald-500/10" : "bg-amber-500/10"}`}><ShieldCheck className="h-5 w-5 mb-2" /><p className="text-xs text-muted-foreground">Запас прочности</p><p className="text-2xl font-bold">{runway ? `${runway.toFixed(1)} мес.` : "—"}</p></div>
          <div className="rounded-xl bg-muted/40 p-4"><Target className="h-5 w-5 mb-2 text-violet-500" /><p className="text-xs text-muted-foreground">Накоплено в целях</p><p className="text-2xl font-bold">{fmt(metrics?.goalsSaved ?? 0)}</p></div>
        </CardContent>
        <CardContent className="pt-0 space-y-3">
          <div className="flex justify-between text-sm"><span>Резерв на 2 месяца</span><span className="font-semibold">{fmt(Math.min(metrics?.balance ?? 0, reserveTarget))} / {fmt(reserveTarget)}</span></div>
          <Progress value={reservePct} className="h-3" />
          <p className="text-sm text-muted-foreground">Цель автономии: сначала закрыть 2 месяца обязательных расходов и минимальных платежей, затем ускорять цели и погашение дорогих долгов.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Финансовые цели тоже входят в автономию</CardTitle><CardDescription>Цели — это деньги, которые ты уже зарезервировал под будущее. Они не должны незаметно считаться свободным балансом.</CardDescription></CardHeader>
        <CardContent className="space-y-3"><div className="flex justify-between text-sm"><span>Прогресс всех целей</span><span className="font-semibold">{fmt(metrics?.goalsSaved ?? 0)} / {fmt(metrics?.goalsTarget ?? 0)}</span></div><Progress value={goalPct} className="h-3" /><p className="text-xs text-muted-foreground">Пополнение цели списывает деньги с текущего баланса; возврат из цели возвращает их обратно.</p></CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-emerald-500/20"><CardHeader><CardTitle>Индекс готовности</CardTitle><CardDescription>Цифровая готовность: 4 категории × 25 баллов.</CardDescription></CardHeader><CardContent><div className="text-5xl font-bold text-emerald-500">{score}<span className="text-lg text-muted-foreground">/100</span></div><Progress value={score} className="mt-4 h-3" /><p className="text-sm text-muted-foreground mt-4">Это отдельный показатель документов и доступа, а не сумма денег.</p></CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Ваш денежный сценарий</CardTitle><CardDescription>Не диагноз. Просто настройка, помогающая замечать собственные финансовые привычки.</CardDescription></CardHeader><CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-2"><Label>Денежный сценарий</Label><Select value={profile?.moneyScriptType ?? "vigilance"} onValueChange={(moneyScriptType) => changeProfile({ moneyScriptType: moneyScriptType as FinancialAutonomyProfileMoneyScriptType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SCRIPT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-3"><div className="flex justify-between"><Label>Толерантность к риску</Label><span className="font-mono text-sm">{Math.round(profile?.riskToleranceIndex ?? 50)}/100</span></div><Slider value={[profile?.riskToleranceIndex ?? 50]} min={0} max={100} step={5} onValueCommit={([riskToleranceIndex]) => changeProfile({ riskToleranceIndex })} /><p className="text-xs text-muted-foreground">0 — важнее предсказуемость, 100 — комфортнее контролируемые эксперименты.</p></div></CardContent></Card>
      </div>

      {vault?.warnings.length ? <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="p-4 flex gap-3"><AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" /><div><p className="font-semibold">Нужна проверка цифровой готовности</p><ul className="mt-1 text-sm text-muted-foreground list-disc ml-4">{vault.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div></CardContent></Card> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileKey2 className="h-5 w-5 text-primary" /> Цифровой сейф</CardTitle><CardDescription>Сохраняй только зашифрованную ссылку/payload. Пароли, коды и номера карт сюда не вводи.</CardDescription></CardHeader><CardContent><form onSubmit={create} className="space-y-4"><div className="space-y-2"><Label>Категория</Label><Select value={document.docCategory} onValueChange={(docCategory) => setDocument({ ...document, docCategory })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Нейтральное название</Label><Input value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} placeholder="Например: резервный банковский план" /></div><div className="space-y-2"><Label>Зашифрованный payload или ссылка</Label><Input value={document.encryptedPayload} onChange={(event) => setDocument({ ...document, encryptedPayload: event.target.value })} placeholder="opaque://secure-reference" /></div><Button type="submit" disabled={createDocument.isPending}>Добавить защищённую запись</Button></form></CardContent></Card>
        <Card><CardHeader><CardTitle>Проверка готовности</CardTitle><CardDescription>Содержимое защищённых записей здесь не отображается.</CardDescription></CardHeader><CardContent className="space-y-3">{(vault?.categoryStatus ?? []).map((status) => <div key={status.category} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="flex items-center gap-3"><CheckCircle2 className={`h-5 w-5 ${status.verified ? "text-emerald-500" : "text-muted-foreground"}`} /><div><p className="font-medium text-sm">{CATEGORY_LABELS[status.category]}</p><p className="text-xs text-muted-foreground">{status.verified ? "Проверено в последние 60 дней" : status.present ? "Нужно перепроверить" : "Запись отсутствует"}</p></div></div><span className={`text-xs font-semibold ${status.verified ? "text-emerald-500" : "text-amber-500"}`}>{status.verified ? "Готово" : "Внимание"}</span></div>)}</CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle>Сохранённые записи</CardTitle></CardHeader><CardContent className="space-y-3">{(vault?.documents ?? []).length === 0 ? <p className="text-center py-6 text-muted-foreground">Сейф пока пуст.</p> : vault?.documents.map((doc) => <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4"><div><p className="font-semibold">{doc.title}</p><p className="text-sm text-muted-foreground">{CATEGORY_LABELS[doc.docCategory]} · {doc.lastVerifiedAt ? `проверено ${new Date(doc.lastVerifiedAt).toLocaleDateString("ru-RU")}` : "ещё не проверено"}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => verifyDocument.mutate({ id: doc.id }, { onSuccess: refresh })}>Проверить сегодня</Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteDocument.mutate({ id: doc.id }, { onSuccess: refresh })}><Trash2 className="h-4 w-4" /></Button></div></div>)}</CardContent></Card>
    </div>
  );
}
