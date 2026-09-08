import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, ArrowUpRight, Wallet, CreditCard, Activity, Clock3, ReceiptText, TrendingUp, AlertTriangle } from "lucide-react";
import { CurrentBalanceCard } from "@/components/CurrentBalanceCard";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const fmt = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v)) + " сом";
const monthLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(new Date(Date.UTC(y, mo - 1, 1))).replace(".", ""); };
const colors = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--muted-foreground))"];
const categoryFallback: Record<string, string> = { housing: "Жильё", food: "Питание", transport: "Транспорт", utilities: "Коммунальные / связь", health: "Здоровье", miscellaneous: "Разное", debt: "Платежи по долгам", withdrawal: "Списания", allocation: "Распределение", goals: "Финансовые цели", other: "Прочее" };

type Detailed = { currentBalance: number; currentMonthIncome: number; currentMonthOutflow: number; currentMonthNet: number; plannedMonthlyExpenses: number; categoryBreakdown: Array<{ category: string; label: string; amount: number }>; debtPayments: Array<{ creditorName: string; amount: number }>; monthlyCashFlow: Array<{ month: string; income: number; expenses: number; net: number }>; recentTransactions: Array<{ id: number; amount: number; type: string; categoryLabel: string; note?: string | null; createdAt: string }> };
type Summary = { totalDebt: number; totalMonthlyDebtPayment: number; financialRunwayMonths: number; debtCount: number; totalMonthlyIncome: number; totalMonthlyExpenses: number; netMonthlyCashFlow: number; currentBalance: number };

async function getJson<T>(url: string): Promise<T> { const r = await fetch(url); if (!r.ok) throw new Error("Не удалось загрузить данные"); return r.json(); }

export default function Dashboard() {
  const detailed = useQuery({ queryKey: ["/api/dashboard/detailed"], queryFn: () => getJson<Detailed>("/api/dashboard/detailed"), staleTime: 15_000 });
  const summary = useQuery({ queryKey: ["/api/dashboard/summary"], queryFn: () => getJson<Summary>("/api/dashboard/summary"), staleTime: 15_000 });

  if (detailed.isLoading || summary.isLoading) return <div className="space-y-6"><Skeleton className="h-12 w-72" /><div className="grid grid-cols-1 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div><Skeleton className="h-[420px]" /></div>;
  if (detailed.isError || summary.isError || !detailed.data || !summary.data) return <Card><CardContent className="py-16 text-center text-muted-foreground">Не удалось загрузить подробный дашборд.</CardContent></Card>;

  const d = detailed.data;
  const s = summary.data;
  const cashFlow = d.monthlyCashFlow.map(x => ({ ...x, label: monthLabel(x.month) }));
  const categories = d.categoryBreakdown.map(x => ({ ...x, name: x.label || categoryFallback[x.category] || x.category }));
  const debtData = d.debtPayments.map(x => ({ name: x.creditorName, amount: x.amount }));

  return (
    <div className="space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div><h1 className="text-3xl font-bold tracking-tight">Обзор финансов</h1><p className="text-muted-foreground mt-1">Теперь дашборд показывает не только планы, а реальные движения денег по балансу.</p></div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-1"><CurrentBalanceCard /></div>
        <Metric title="Пришло за месяц" value={fmt(d.currentMonthIncome)} icon={<ArrowUpRight className="h-5 w-5" />} tone="positive" subtitle="Фактические поступления" />
        <Metric title="Ушло за месяц" value={fmt(d.currentMonthOutflow)} icon={<ArrowDownRight className="h-5 w-5" />} tone="negative" subtitle="Все списания с баланса" />
        <Metric title="Итог месяца" value={fmt(d.currentMonthNet)} icon={<Activity className="h-5 w-5" />} tone={d.currentMonthNet >= 0 ? "positive" : "negative"} subtitle="Приходы − все списания" />
        <Metric title="Запас хода" value={s.financialRunwayMonths >= 99 ? "∞" : `${s.financialRunwayMonths.toFixed(1)} мес.`} icon={<Clock3 className="h-5 w-5" />} tone={s.financialRunwayMonths >= 3 ? "positive" : "negative"} subtitle={`Долгов: ${s.debtCount}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Денежный поток</CardTitle><CardDescription>Фактические приходы и все списания по балансу, последние месяцы</CardDescription></CardHeader><CardContent className="h-[340px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={cashFlow}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="label" /><YAxis tickFormatter={(v) => `${Math.round(v / 1000)}к`} /><Tooltip formatter={(v: number) => fmt(v)} /><Legend /><Line type="monotone" dataKey="income" name="Приходы" stroke="hsl(var(--chart-2))" strokeWidth={3} dot={false} /><Line type="monotone" dataKey="expenses" name="Списания" stroke="hsl(var(--destructive))" strokeWidth={3} dot={false} /><Line type="monotone" dataKey="net" name="Нетто" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Куда ушли деньги</CardTitle><CardDescription>Текущий месяц, включая платежи по долгам</CardDescription></CardHeader><CardContent className="h-[340px] p-3"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categories} dataKey="amount" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={2}>{categories.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie><Tooltip formatter={(v: number) => fmt(v)} /></PieChart></ResponsiveContainer><div className="space-y-2 max-h-28 overflow-auto px-3">{categories.slice(0, 6).map((x, i) => <div key={x.category} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[i % colors.length] }} />{x.name}</span><span className="font-mono">{fmt(x.amount)}</span></div>)}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Расходы по категориям</CardTitle><CardDescription>Реальные списания с баланса, а не только регулярный план</CardDescription></CardHeader><CardContent className="h-[340px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={categories.slice(0, 8)} layout="vertical" margin={{ left: 20, right: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}к`} /><YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 12 }} /><Tooltip formatter={(v: number) => fmt(v)} /><Bar dataKey="amount" name="Списано" fill="hsl(var(--primary))" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Платежи по долгам</CardTitle><CardDescription>Сколько реально ушло на кредиты и другие долги</CardDescription></CardHeader><CardContent>{debtData.length === 0 ? <div className="h-[280px] flex items-center justify-center text-muted-foreground">Платежей по долгам за этот месяц пока нет.</div> : <div className="space-y-5 pt-2">{debtData.map((x, i) => <div key={x.name}><div className="flex justify-between mb-2"><span className="font-medium">{x.name}</span><span className="font-mono">{fmt(x.amount)}</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, x.amount / Math.max(1, Math.max(...debtData.map(y => y.amount))) * 100)}%`, background: colors[i % colors.length] }} /></div></div>)}</div>}</CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Последние движения денег</CardTitle><CardDescription>Единая лента: доходы, обычные расходы, кредиты и другие списания</CardDescription></CardHeader><CardContent>{d.recentTransactions.length === 0 ? <div className="py-12 text-center text-muted-foreground">Операций пока нет.</div> : <div className="divide-y">{d.recentTransactions.slice(0, 12).map(tx => <div key={tx.id} className="py-3 flex items-center justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-medium truncate">{tx.note || tx.categoryLabel}</span><Badge variant={tx.amount >= 0 ? "default" : "secondary"}>{tx.categoryLabel}</Badge></div><div className="text-xs text-muted-foreground mt-1">{new Date(tx.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div></div><div className={`font-mono font-semibold whitespace-nowrap ${tx.amount >= 0 ? "text-emerald-400" : "text-destructive"}`}>{tx.amount >= 0 ? "+" : ""}{fmt(tx.amount)}</div></div>)}</div>}</CardContent></Card>
        <div className="space-y-6">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> План vs факт</CardTitle></CardHeader><CardContent className="space-y-4"><InfoRow label="Регулярный план расходов" value={fmt(d.plannedMonthlyExpenses)} /><InfoRow label="План платежей по долгам" value={fmt(s.totalMonthlyDebtPayment)} /><InfoRow label="Планируемый доход" value={fmt(s.totalMonthlyIncome)} /><InfoRow label="Планируемый результат" value={fmt(s.netMonthlyCashFlow)} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Долговая нагрузка</CardTitle></CardHeader><CardContent className="space-y-4"><div className="text-3xl font-bold">{fmt(s.totalDebt)}</div><p className="text-sm text-muted-foreground">Общий остаток по {s.debtCount} активным долгам.</p><InfoRow label="Минимум в месяц" value={fmt(s.totalMonthlyDebtPayment)} /><InfoRow label="Баланс сейчас" value={fmt(d.currentBalance)} /></CardContent></Card>
          {d.currentMonthNet < 0 && <Card className="border-destructive/30"><CardContent className="p-5 flex gap-3"><AlertTriangle className="h-5 w-5 text-destructive shrink-0" /><div><div className="font-semibold">В этом месяце денег ушло больше, чем пришло</div><p className="text-sm text-muted-foreground mt-1">Разница: {fmt(Math.abs(d.currentMonthNet))}. Смотри категории и ленту операций выше.</p></div></CardContent></Card>}
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value, icon, tone, subtitle }: { title: string; value: string; icon: React.ReactNode; tone: "positive" | "negative"; subtitle: string }) {
  return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{title}</div><div className={tone === "positive" ? "text-emerald-400" : "text-destructive"}>{icon}</div></div><div className="text-2xl font-bold mt-3">{value}</div><div className="text-xs text-muted-foreground mt-1">{subtitle}</div></CardContent></Card>;
}
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-mono font-semibold text-right">{value}</span></div>; }
