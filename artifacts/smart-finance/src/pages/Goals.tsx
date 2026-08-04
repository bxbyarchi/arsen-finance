import { useState } from "react";
import {
  useListGoals,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  useGetDashboardSummary,
  SavingsGoal,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Target, CheckCircle2, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const fmt = (v: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v)) + "\u00a0сом";

const HORIZON_LABELS: Record<number, string> = {
  1: "1 месяц",
  6: "6 месяцев",
  12: "1 год",
  36: "3 года",
};

const goalSchema = z.object({
  title: z.string().min(1, "Обязательное поле"),
  targetAmount: z.coerce.number().min(1, "Должно быть > 0"),
  targetMonths: z.coerce.number().int().min(1, "Обязательное поле"),
  currentAmount: z.coerce.number().min(0).default(0),
});

type GoalForm = z.infer<typeof goalSchema>;

const BLANK: GoalForm = { title: "", targetAmount: 0, targetMonths: 12, currentAmount: 0 };

export default function Goals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: goals, isLoading } = useListGoals({ query: { queryKey: ["/api/goals"] } });
  const { data: dashSummary } = useGetDashboardSummary({ query: { queryKey: ["/api/dashboard"] } });
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [progressGoal, setProgressGoal] = useState<SavingsGoal | null>(null);
  const [progressValue, setProgressValue] = useState<string>("");

  const form = useForm<GoalForm>({ resolver: zodResolver(goalSchema), defaultValues: BLANK });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
    setDialogOpen(false);
  };

  const onSubmit = (data: GoalForm) => {
    if (editingGoal) {
      updateGoal.mutate({ id: editingGoal.id, data }, { onSuccess: () => { toast({ title: "Цель обновлена" }); invalidate(); } });
    } else {
      createGoal.mutate({ data }, { onSuccess: () => { toast({ title: "Цель создана" }); invalidate(); } });
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Удалить эту цель?")) return;
    deleteGoal.mutate({ id }, { onSuccess: () => { toast({ title: "Цель удалена" }); queryClient.invalidateQueries({ queryKey: ["/api/goals"] }); } });
  };

  const handleSaveProgress = () => {
    if (!progressGoal) return;
    const val = parseFloat(progressValue);
    if (isNaN(val) || val < 0) return;
    updateGoal.mutate({ id: progressGoal.id, data: {
      title: progressGoal.title,
      targetAmount: progressGoal.targetAmount,
      targetMonths: progressGoal.targetMonths,
      currentAmount: val,
    }}, {
      onSuccess: () => {
        toast({ title: "Прогресс обновлён" });
        queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
        setProgressDialogOpen(false);
      },
    });
  };

  // Net monthly income from dashboard
  const monthlyNet = dashSummary?.netMonthlyCashFlow ?? 0;
  const currentSavings = dashSummary?.currentSavings ?? 0;

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-12 w-64" /><div className="grid grid-cols-1 md:grid-cols-2 gap-6">{[1,2,3,4].map(i => <Skeleton key={i} className="h-56" />)}</div></div>;

  const goalsSorted = [...(goals ?? [])].sort((a, b) => a.targetMonths - b.targetMonths);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Финансовые цели</h1>
          <p className="text-muted-foreground mt-1">Ставь цели, следи за прогрессом, достигай.</p>
        </div>
        <Button size="lg" onClick={() => { setEditingGoal(null); form.reset(BLANK); setDialogOpen(true); }} className="font-semibold hover-elevate">
          <Plus className="mr-2 h-4 w-4" /> Новая цель
        </Button>
      </div>

      {/* Monthly income hint */}
      <div className={`flex items-center gap-4 p-4 rounded-xl border-2 ${monthlyNet >= 0 ? "border-emerald-500/20 bg-emerald-500/5" : "border-destructive/20 bg-destructive/5"}`}>
        <TrendingUp className={`h-6 w-6 ${monthlyNet >= 0 ? "text-emerald-500" : "text-destructive"} shrink-0`} />
        <div>
          <div className="font-semibold">Свободный остаток в месяц: <span className={monthlyNet >= 0 ? "text-emerald-500" : "text-destructive"}>{fmt(monthlyNet)}</span></div>
          <div className="text-sm text-muted-foreground">Накопления: {fmt(currentSavings)} — используется для расчёта прогресса по целям</div>
        </div>
      </div>

      {/* Create/edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editingGoal ? "Редактировать цель" : "Новая финансовая цель"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Название цели</FormLabel>
                  <FormControl><Input {...field} placeholder="напр. Подушка на 3 месяца, Первоначальный взнос, Отпуск" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="targetAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Целевая сумма (сом)</FormLabel>
                    <FormControl><Input type="number" step="1000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="targetMonths" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Горизонт</FormLabel>
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Выбрать" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="1">1 месяц</SelectItem>
                        <SelectItem value="6">6 месяцев</SelectItem>
                        <SelectItem value="12">1 год</SelectItem>
                        <SelectItem value="36">3 года</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="currentAmount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Уже накоплено (сом)</FormLabel>
                  <FormControl><Input type="number" step="1000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end pt-2">
                <Button type="submit" size="lg" disabled={createGoal.isPending || updateGoal.isPending}>
                  {editingGoal ? "Сохранить" : "Создать"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Progress update dialog */}
      <Dialog open={progressDialogOpen} onOpenChange={setProgressDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Обновить прогресс</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Текущая сумма (сом)</label>
              <Input type="number" step="1000" value={progressValue} onChange={(e) => setProgressValue(e.target.value)} placeholder="Сколько уже накоплено" className="text-lg h-12 font-mono" />
            </div>
            <Button className="w-full" size="lg" onClick={handleSaveProgress} disabled={updateGoal.isPending}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>

      {goalsSorted.length === 0 ? (
        <Card className="border-dashed border-2 py-16 text-center">
          <Target className="h-14 w-14 mx-auto mb-4 text-muted-foreground opacity-20" />
          <h3 className="text-xl font-bold mb-2">Целей пока нет</h3>
          <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
            Поставьте финансовую цель — и система покажет, сколько нужно откладывать каждый месяц.
          </p>
          <Button size="lg" onClick={() => { form.reset(BLANK); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />Первая цель
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {goalsSorted.map((goal) => {
            const pct = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
            const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
            const requiredMonthly = goal.targetMonths > 0 ? goal.targetAmount / goal.targetMonths : goal.targetAmount;
            const monthsWithCurrentSavings = monthlyNet > 0 ? remaining / monthlyNet : Infinity;
            const completed = pct >= 100;
            const horizonLabel = HORIZON_LABELS[goal.targetMonths] ?? `${goal.targetMonths} мес.`;

            return (
              <Card key={goal.id} className={`hover-elevate transition-all ${completed ? "border-emerald-500/30 bg-emerald-500/5" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {completed
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                        : <Target className="h-5 w-5 text-primary shrink-0" />}
                      <CardTitle className="text-lg truncate">{goal.title}</CardTitle>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => { setEditingGoal(goal); form.reset({ title: goal.title, targetAmount: goal.targetAmount, targetMonths: goal.targetMonths, currentAmount: goal.currentAmount }); setDialogOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => handleDelete(goal.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <Badge variant="outline" className="w-fit text-xs">{horizonLabel}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium">{fmt(goal.currentAmount)}</span>
                      <span className="text-muted-foreground">из {fmt(goal.targetAmount)}</span>
                    </div>
                    <Progress value={pct} className={`h-3 ${completed ? "[&>div]:bg-emerald-500" : ""}`} />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{pct.toFixed(0)}% выполнено</span>
                      {!completed && <span>{fmt(remaining)} осталось</span>}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-muted/40 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">Нужно в месяц</div>
                      <div className="font-bold">{fmt(requiredMonthly)}</div>
                    </div>
                    <div className={`rounded-lg p-3 ${monthlyNet > 0 && monthsWithCurrentSavings <= goal.targetMonths ? "bg-emerald-500/10" : "bg-muted/40"}`}>
                      <div className="text-xs text-muted-foreground mb-1">Хватит за (мес)</div>
                      <div className={`font-bold ${monthlyNet > 0 && monthsWithCurrentSavings <= goal.targetMonths ? "text-emerald-500" : ""}`}>
                        {monthlyNet > 0 && isFinite(monthsWithCurrentSavings) ? `${monthsWithCurrentSavings.toFixed(1)}` : "—"}
                      </div>
                    </div>
                  </div>

                  {completed ? (
                    <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-600 text-sm font-semibold text-center">
                      🎉 Цель достигнута!
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => {
                      setProgressGoal(goal);
                      setProgressValue(String(goal.currentAmount));
                      setProgressDialogOpen(true);
                    }}>
                      Обновить прогресс
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
