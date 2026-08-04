import {
  useGetDashboardSummary,
  useUpdateProfile,
  useGetProfile,
  useGetProjectsSummary,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Wallet, Receipt, ShieldAlert, Activity,
  AlertTriangle, BrainCircuit, BarChart3, PiggyBank
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, ComposedChart, Line
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const fmt = (val: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(val)) + "\u00a0сом";

const fmtCompact = (v: number) =>
  new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(v);

function MetricCard({ title, value, subtext, icon: Icon, trend, colorClass }: any) {
  return (
    <Card className="hover-elevate">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold tracking-tight mb-1">{value}</div>
        {subtext && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
            {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
            <span>{subtext}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RunwayBadge({ months }: { months: number }) {
  let color = "bg-destructive text-destructive-foreground";
  if (months > 6) color = "bg-emerald-500 text-white";
  else if (months >= 3) color = "bg-amber-500 text-white";
  return <Badge className={`${color} px-2.5 py-1 text-sm font-bold border-none`}>{months.toFixed(1)} мес.</Badge>;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({ query: { queryKey: ["/api/dashboard"] } });
  const { data: profile, isLoading: isProfileLoading } = useGetProfile({ query: { queryKey: ["/api/profile"] } });
  const { data: projectsSummary } = useGetProjectsSummary({ query: { queryKey: ["/api/projects/summary"] } });
  const updateProfile = useUpdateProfile();

  const handleCrisisToggle = (checked: boolean) => {
    updateProfile.mutate({ data: { crisisMode: checked } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        toast({
          title: checked ? "КРИЗИСНЫЙ РЕЖИМ ВКЛЮЧЁН" : "Обычный режим восстановлен",
          description: checked ? "Считаются только обязательные траты." : "Возврат к обычному планированию.",
          variant: checked ? "destructive" : "default",
        });
      },
    });
  };

  if (isSummaryLoading || isProfileLoading || !summary || !profile) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Monthly chart — prefer project entries, fallback to personal cash flow
  const monthlyData = (summary.monthlyBreakdown ?? []).map(m => ({
    month: m.month,
    "Оборот": Math.round(m.revenue),
    "Расходы": Math.round(m.expenses),
    "Реинвестиции": Math.round(m.reinvestments),
    "Дивиденды": Math.round(m.dividends),
    "Прибыль": Math.round(m.netProfit),
  }));

  const cashFlowData = [
    { name: "Доходы", amount: summary.totalMonthlyIncome, color: "hsl(var(--primary))" },
    { name: "Расходы", amount: summary.totalMonthlyExpenses, color: "hsl(var(--destructive))" },
    { name: "По кредитам", amount: summary.totalMonthlyDebtPayment, color: "hsl(var(--chart-3))" },
  ];

  const hasProjects = (projectsSummary?.projects?.length ?? 0) > 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header + crisis toggle */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Обзор финансов</h1>
          <p className="text-muted-foreground mt-1">Вся картина ваших денег — одним взглядом.</p>
        </div>
        <Card className={`border-2 ${profile.crisisMode ? "border-destructive bg-destructive/5" : "border-border"} transition-colors duration-500`}>
          <CardContent className="p-4 flex items-center gap-4">
            <ShieldAlert className={`h-6 w-6 ${profile.crisisMode ? "text-destructive" : "text-muted-foreground"}`} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Режим</p>
              <p className={`text-base font-bold ${profile.crisisMode ? "text-destructive" : ""}`}>{profile.crisisMode ? "Кризисный" : "Обычный"}</p>
            </div>
            <div className="w-px h-8 bg-border mx-1" />
            <Switch checked={profile.crisisMode} onCheckedChange={handleCrisisToggle}
              className={profile.crisisMode ? "data-[state=checked]:bg-destructive" : ""} />
          </CardContent>
        </Card>
      </div>

      {/* ── Top metrics bar (Looker-style) ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">💼 Личные финансы</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard title="Свободный остаток" value={fmt(summary.netMonthlyCashFlow)}
            subtext="Остаётся каждый месяц" icon={Activity}
            trend={summary.netMonthlyCashFlow > 0 ? "up" : "down"}
            colorClass={summary.netMonthlyCashFlow > 0 ? "text-emerald-500" : "text-destructive"} />
          <MetricCard title="Подушка безопасности" value={<RunwayBadge months={summary.financialRunwayMonths} />}
            subtext={`${fmt(summary.currentSavings)} накоплений`} icon={AlertTriangle} colorClass="text-amber-500" />
          <MetricCard title="Сумма всех долгов" value={fmt(summary.totalDebt)}
            subtext={`Активных кредитов: ${summary.debtCount}`} icon={Wallet} colorClass="text-destructive" />
          <MetricCard title="Всего трат в месяц" value={fmt(summary.totalMonthlyExpenses + summary.totalMonthlyDebtPayment)}
            subtext="Расходы + выплаты по кредитам" icon={Receipt} colorClass="text-primary" />
        </div>
      </div>

      {/* Project metrics (only if have projects) */}
      {hasProjects && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">📊 Бизнес-проекты (итого за всё время)</p>
            <Link href="/projects"><Button variant="ghost" size="sm" className="text-xs">Все проекты →</Button></Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard title="Общий оборот" value={fmt(summary.totalProjectRevenue ?? 0)}
              subtext="Gross Revenue по всем проектам" icon={BarChart3} colorClass="text-primary" />
            <MetricCard title="Чистая прибыль" value={fmt(summary.totalProjectNetProfit ?? 0)}
              subtext="Net Profit по всем проектам" icon={TrendingUp}
              trend={(summary.totalProjectNetProfit ?? 0) >= 0 ? "up" : "down"}
              colorClass={(summary.totalProjectNetProfit ?? 0) >= 0 ? "text-emerald-500" : "text-destructive"} />
            <MetricCard title="Дивиденды" value={fmt(summary.totalProjectDividends ?? 0)}
              subtext="Выплачено на личный счёт" icon={PiggyBank} colorClass="text-amber-500" />
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Monthly breakdown chart (if project data exists) */}
        {monthlyData.length > 1 ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Месячная динамика</CardTitle>
              <CardDescription>Оборот, расходы, реинвестиции и дивиденды по месяцам</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={fmtCompact} width={55} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(v: number, name: string) => [fmt(v), name]} />
                  <Legend fontSize={11} />
                  <Bar dataKey="Оборот" fill="hsl(var(--primary))" radius={[3,3,0,0]} maxBarSize={32} />
                  <Bar dataKey="Расходы" fill="hsl(var(--destructive))" radius={[3,3,0,0]} maxBarSize={32} />
                  <Bar dataKey="Реинвестиции" fill="#8b5cf6" radius={[3,3,0,0]} maxBarSize={32} />
                  <Bar dataKey="Дивиденды" fill="#f59e0b" radius={[3,3,0,0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Куда идут деньги</CardTitle>
              <CardDescription>Доходы и траты за месяц</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${fmtCompact(v)} сом`} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(v: number) => [fmt(v), "Сумма"]} />
                  <Bar dataKey="amount" radius={[4,4,0,0]} maxBarSize={60}>
                    {cashFlowData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Quick actions */}
        <Card>
          <CardHeader><CardTitle>Быстрые действия</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {[
              { label: "Мои проекты", sub: "P&L по каждому бизнесу", href: "/projects", icon: BarChart3, cls: "bg-primary/10 text-primary" },
              { label: "Метод Давлатова", sub: "Распределить доход по фондам", href: "/davlatov", icon: PiggyBank, cls: "bg-amber-500/10 text-amber-500" },
              { label: "Финансовые цели", sub: "Отслеживай прогресс", href: "/goals", icon: Activity, cls: "bg-emerald-500/10 text-emerald-500" },
              { label: "ИИ-советник", sub: "Советы по улучшению бюджета", href: "/ai", icon: BrainCircuit, cls: "bg-violet-500/10 text-violet-500" },
            ].map(({ label, sub, href, icon: Icon, cls }) => (
              <Link key={href} href={href}>
                <Button variant="outline" className="w-full justify-start h-auto py-3 px-4 hover-elevate">
                  <div className="flex items-center gap-3 text-left w-full">
                    <div className={`p-2 rounded-md shrink-0 ${cls}`}><Icon className="h-4 w-4" /></div>
                    <div>
                      <div className="font-semibold text-sm">{label}</div>
                      <div className="text-xs text-muted-foreground">{sub}</div>
                    </div>
                  </div>
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
