import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Link2, Target, TrendingUp, Unlink, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fmt = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(value)) + " сом";

interface GoalCard {
  goal: {
    id: number;
    title: string;
    targetAmount: number;
    currentAmount: number;
    targetMonths: number;
    financialProgress: number;
    requiredMonthly: number;
  };
  tasks: { id: number; title: string; emoji: string; category: string; weight: number }[];
  discipline: { due: number; done: number; percentage: number };
  alignment: number;
}

interface Dashboard {
  from: string;
  to: string;
  goals: GoalCard[];
  unlinkedTasks: { id: number; title: string; emoji: string; category: string }[];
}

function scoreClass(value: number) {
  if (value >= 90) return "text-emerald-400";
  if (value >= 70) return "text-cyan-400";
  if (value >= 50) return "text-amber-400";
  return "text-rose-400";
}

export default function GoalDiscipline() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskId, setTaskId] = useState<string>("");
  const [goalId, setGoalId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/task-goals/dashboard", { credentials: "include" });
      if (response.ok) setData(await response.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function linkTask() {
    if (!taskId || !goalId) return;
    const response = await fetch("/api/task-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ taskId: Number(taskId), goalId: Number(goalId) }),
    });
    if (response.ok) {
      setTaskId("");
      setGoalId("");
      await load();
    }
  }

  async function unlinkTask(task: number, goal: number) {
    const response = await fetch(`/api/task-goals/${task}/${goal}`, { method: "DELETE", credentials: "include" });
    if (response.ok) await load();
  }

  const totalGoals = data?.goals.length ?? 0;
  const aligned = data?.goals.filter((item) => item.alignment >= 70).length ?? 0;
  const averageAlignment = totalGoals
    ? Math.round((data!.goals.reduce((sum, item) => sum + item.alignment, 0) / totalGoals))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">ARSEN LIFE OS</p>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Цели + дисциплина</h1>
          <Zap className="h-6 w-6 text-amber-400" />
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">Здесь финансовая цель соединяется с ежедневными действиями. Деньги показывают прогресс цели, а задачник — насколько ты выполняешь действия, которые должны к ней привести.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">Синхронизация <Link2 className="h-4 w-4 text-primary" /></div><div className="mt-2 text-4xl font-bold">{totalGoals}</div><p className="mt-1 text-xs text-muted-foreground">финансовых целей</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">В фокусе <CheckCircle2 className="h-4 w-4 text-emerald-400" /></div><div className="mt-2 text-4xl font-bold">{aligned}</div><p className="mt-1 text-xs text-muted-foreground">целей с alignment ≥ 70%</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">Индекс связи <TrendingUp className="h-4 w-4 text-cyan-400" /></div><div className={`mt-2 text-4xl font-bold ${scoreClass(averageAlignment)}`}>{averageAlignment}%</div><p className="mt-1 text-xs text-muted-foreground">деньги 60% + дисциплина 40%</p></CardContent></Card>
      </div>

      <Card className="border-primary/20">
        <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /> Связать задачу с финансовой целью</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Select value={taskId} onValueChange={setTaskId}>
            <SelectTrigger><SelectValue placeholder="Выбери задачу" /></SelectTrigger>
            <SelectContent>
              {(data?.unlinkedTasks ?? []).map((task) => <SelectItem key={task.id} value={String(task.id)}>{task.emoji} {task.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={goalId} onValueChange={setGoalId}>
            <SelectTrigger><SelectValue placeholder="Выбери финансовую цель" /></SelectTrigger>
            <SelectContent>
              {(data?.goals ?? []).map((item) => <SelectItem key={item.goal.id} value={String(item.goal.id)}><Target className="mr-2 inline h-3.5 w-3.5" />{item.goal.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={linkTask} disabled={!taskId || !goalId || loading}>Связать</Button>
        </CardContent>
      </Card>

      {loading && !data ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Загрузка связи целей и задач...</CardContent></Card>
      ) : data?.goals.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {data.goals.map((item) => {
            const financial = item.goal.financialProgress;
            const discipline = item.discipline.percentage;
            return (
              <Card key={item.goal.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><Target className="h-5 w-5 shrink-0 text-primary" /><CardTitle className="truncate">{item.goal.title}</CardTitle></div>
                      <p className="mt-1 text-xs text-muted-foreground">Осталось откладывать: {fmt(item.goal.requiredMonthly)} / мес.</p>
                    </div>
                    <div className={`text-right text-2xl font-bold ${scoreClass(item.alignment)}`}>{item.alignment}%<div className="text-[10px] font-medium text-muted-foreground">alignment</div></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/40 p-3">
                      <div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">Финансовый прогресс</span><span className="font-bold">{financial}%</span></div>
                      <Progress value={financial} className="h-2 [&>div]:bg-primary" />
                      <div className="mt-2 text-xs text-muted-foreground">{fmt(item.goal.currentAmount)} из {fmt(item.goal.targetAmount)}</div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">Дисциплина</span><span className={`font-bold ${scoreClass(discipline)}`}>{discipline}%</span></div>
                      <Progress value={discipline} className="h-2 [&>div]:bg-emerald-500" />
                      <div className="mt-2 text-xs text-muted-foreground">{item.discipline.done} из {item.discipline.due} действий</div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Действия, ведущие к цели</span><span className="text-xs text-muted-foreground">последние 30 дней</span></div>
                    {item.tasks.length ? <div className="space-y-2">{item.tasks.map((task) => <div key={task.id} className="flex items-center gap-3 rounded-lg border p-3"><span className="text-lg">{task.emoji}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{task.title}</div><div className="text-[10px] text-muted-foreground">{task.category} · вес {task.weight}</div></div><Button variant="ghost" size="icon" className="h-8 w-8" title="Убрать связь" onClick={() => unlinkTask(task.id, item.goal.id)}><Unlink className="h-4 w-4" /></Button></div>)}</div> : <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Пока нет связанных задач</div>}
                  </div>

                  {discipline >= 80 && financial < discipline ? <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm"><ArrowUpRight className="h-4 w-4 text-emerald-400" /><span>Дисциплина уже сильнее финансового прогресса. Продолжай выполнять действия и держи план накоплений.</span></div> : discipline < 50 ? <div className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">⚠️ Действия по этой цели проседают. Сейчас именно дисциплина — главное ограничение.</div> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><CardContent className="p-12 text-center"><Target className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" /><h3 className="font-semibold">Сначала создай финансовую цель</h3><p className="mt-1 text-sm text-muted-foreground">После этого здесь можно связать её с конкретными ежедневными действиями.</p></CardContent></Card>
      )}
    </div>
  );
}
