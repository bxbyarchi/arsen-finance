import { 
  useGetDashboardSummary, 
  useUpdateProfile, 
  useGetProfile 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Receipt, 
  ShieldAlert, 
  Activity,
  AlertTriangle,
  BrainCircuit
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const fmt = (val: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(val)) + "\u00a0сом";

function MetricCard({ title, value, subtext, icon: Icon, trend, trendValue, colorClass }: any) {
  return (
    <Card className="hover-elevate">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight mb-1">{value}</div>
        {(trend || subtext) && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
            {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
            {trendValue && <span className={trend === "up" ? "text-emerald-500" : trend === "down" ? "text-destructive" : ""}>{trendValue}</span>}
            {subtext && <span>{subtext}</span>}
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
  return (
    <Badge className={`${color} px-2.5 py-1 text-sm font-bold border-none`}>
      {months.toFixed(1)} мес.
    </Badge>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({ query: { queryKey: ["/api/dashboard"] }});
  const { data: profile, isLoading: isProfileLoading } = useGetProfile({ query: { queryKey: ["/api/profile"] }});
  const updateProfile = useUpdateProfile();

  const handleCrisisToggle = (checked: boolean) => {
    updateProfile.mutate({ data: { crisisMode: checked } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        toast({
          title: checked ? "КРИЗИСНЫЙ РЕЖИМ ВКЛЮЧЁН" : "Обычный режим восстановлен",
          description: checked ? "Теперь считаются только обязательные траты." : "Возврат к обычному планированию.",
          variant: checked ? "destructive" : "default",
        });
      }
    });
  };

  if (isSummaryLoading || isProfileLoading || !summary || !profile) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </div>
    );
  }

  const chartData = [
    { name: "Доходы",            amount: summary.totalMonthlyIncome,        color: "hsl(var(--primary))" },
    { name: "Расходы",           amount: summary.totalMonthlyExpenses,       color: "hsl(var(--destructive))" },
    { name: "Выплаты по долгам", amount: summary.totalMonthlyDebtPayment,    color: "hsl(var(--chart-3))" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header + mode toggle */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Обзор финансов</h1>
          <p className="text-muted-foreground mt-1">Вся картина ваших денег — одним взглядом.</p>
        </div>
        <Card className={`border-2 ${profile.crisisMode ? 'border-destructive bg-destructive/5' : 'border-border'} transition-colors duration-500`}>
          <CardContent className="p-4 flex items-center gap-4">
            <ShieldAlert className={`h-7 w-7 ${profile.crisisMode ? 'text-destructive' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Режим</p>
              <p className={`text-lg font-bold ${profile.crisisMode ? 'text-destructive' : ''}`}>
                {profile.crisisMode ? 'Кризисный' : 'Обычный'}
              </p>
            </div>
            <div className="w-px h-10 bg-border mx-1" />
            <Switch 
              checked={profile.crisisMode}
              onCheckedChange={handleCrisisToggle}
              className={profile.crisisMode ? 'data-[state=checked]:bg-destructive' : ''}
            />
          </CardContent>
        </Card>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Свободный остаток"
          value={fmt(summary.netMonthlyCashFlow)}
          subtext="Сколько остаётся каждый месяц"
          icon={Activity}
          trend={summary.netMonthlyCashFlow > 0 ? "up" : "down"}
          colorClass={summary.netMonthlyCashFlow > 0 ? "text-emerald-500" : "text-destructive"}
        />
        <MetricCard
          title="Подушка безопасности"
          value={<RunwayBadge months={summary.financialRunwayMonths} />}
          subtext={`На основе ${fmt(summary.currentSavings)} накоплений`}
          icon={AlertTriangle}
          colorClass="text-amber-500"
        />
        <MetricCard
          title="Сумма всех долгов"
          value={fmt(summary.totalDebt)}
          subtext={`Активных кредитов: ${summary.debtCount}`}
          icon={Wallet}
          colorClass="text-destructive"
        />
        <MetricCard
          title="Всего трат в месяц"
          value={fmt(summary.totalMonthlyExpenses + summary.totalMonthlyDebtPayment)}
          subtext="Расходы + выплаты по кредитам"
          icon={Receipt}
          colorClass="text-primary"
        />
      </div>

      {/* Chart + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle>Куда идут деньги</CardTitle>
            <CardDescription>Доходы и траты за месяц</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${new Intl.NumberFormat("ru-RU", { notation: "compact" }).format(v)} сом`}
                  width={80}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted)/0.5)" }}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  formatter={(value: number) => [fmt(value), "Сумма"]}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Быстрые действия</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start h-auto py-4 px-4 hover-elevate">
              <div className="flex items-center gap-4 text-left w-full">
                <div className="bg-primary/10 p-2 rounded-md shrink-0">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold">Добавить доход</div>
                  <div className="text-xs text-muted-foreground">Зарплата, фриланс и т.д.</div>
                </div>
              </div>
            </Button>
            <Button variant="outline" className="w-full justify-start h-auto py-4 px-4 hover-elevate">
              <div className="flex items-center gap-4 text-left w-full">
                <div className="bg-destructive/10 p-2 rounded-md shrink-0">
                  <Receipt className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <div className="font-semibold">Записать расход</div>
                  <div className="text-xs text-muted-foreground">Аренда, еда, транспорт…</div>
                </div>
              </div>
            </Button>
            <Button variant="outline" className="w-full justify-start h-auto py-4 px-4 hover-elevate border-primary/20 bg-primary/5">
              <div className="flex items-center gap-4 text-left w-full">
                <div className="bg-primary p-2 rounded-md text-primary-foreground shrink-0">
                  <BrainCircuit className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">Запустить ИИ-анализ</div>
                  <div className="text-xs text-muted-foreground">Советы по улучшению бюджета</div>
                </div>
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
