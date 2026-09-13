import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Flame, Plus, Target, Trash2, Trophy, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const presets = [
  ["🚿", "Холодный душ", "Здоровье"],
  ["💧", "3л воды", "Здоровье"],
  ["😴", "7+ часов сна", "Здоровье"],
  ["🏃", "10к шагов", "Здоровье"],
  ["🧠", "5 побед за день", "Развитие"],
] as const;

type Task = {
  id: number;
  title: string;
  emoji: string;
  category: string;
  type: string;
  recurrence: string;
  weekdays: number[];
  dueDate: string | null;
  weight: number;
};

type Daily = { date: string; due: number; done: number; percentage: number };
type Dashboard = {
  tasks: Task[];
  completions: { taskId: number; completedDate: string }[];
  daily: Daily[];
  categories: { category: string; due: number; done: number; percentage: number }[];
  summary: { efficiency: number; due: number; done: number; streak: number };
};

function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function formatDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return `${dayNames[d.getUTCDay()]} ${d.getUTCDate()}`;
}

function pctClass(value: number) {
  if (value >= 90) return "text-emerald-400";
  if (value >= 70) return "text-cyan-400";
  if (value >= 50) return "text-amber-400";
  return "text-rose-400";
}

function heatClass(value: number, due: number) {
  if (!due) return "bg-muted/20";
  if (value >= 100) return "bg-emerald-500/90";
  if (value >= 75) return "bg-emerald-500/65";
  if (value >= 50) return "bg-emerald-500/40";
  if (value > 0) return "bg-emerald-500/20";
  return "bg-rose-500/15";
}

export default function Tasks() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("✅");
  const [category, setCategory] = useState("Личное");
  const [recurrence, setRecurrence] = useState("daily");
  const [showAdd, setShowAdd] = useState(false);
  const [period, setPeriod] = useState<"14" | "30">("30");

  const from = useMemo(() => localDate(-(Number(period) - 1)), [period]);
  const to = useMemo(() => localDate(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/dashboard?from=${from}&to=${to}`, { credentials: "include" });
      if (response.ok) setDashboard(await response.json());
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const completionSet = useMemo(
    () => new Set((dashboard?.completions ?? []).map((item) => `${item.taskId}:${item.completedDate}`)),
    [dashboard],
  );
  const days = dashboard?.daily ?? [];
  const matrixDays = days.slice(-14);
  const average = dashboard?.summary.efficiency ?? 0;
  const daysWithTasks = days.filter((d) => d.due > 0);
  const perfectDays = daysWithTasks.filter((d) => d.done === d.due).length;
  const consistency = daysWithTasks.length ? Math.round((perfectDays / daysWithTasks.length) * 100) : 0;
  const discipline = Math.round(average * 0.7 + consistency * 0.2 + Math.min(100, (dashboard?.summary.streak ?? 0) * 5) * 0.1);
  const bestDay = days.length ? days.reduce((best, item) => item.percentage > best.percentage ? item : best, days[0]) : null;
  const week = days.slice(-7);
  const weekScore = week.length ? Math.round(week.reduce((s, d) => s + d.percentage, 0) / week.length) : 0;

  const weeks = useMemo(() => {
    const result: { label: string; value: number }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      result.push({ label: `${formatDay(chunk[0].date)}–${formatDay(chunk[chunk.length - 1].date)}`, value: Math.round(chunk.reduce((s, d) => s + d.percentage, 0) / chunk.length) });
    }
    return result;
  }, [days]);

  async function toggle(taskId: number, date: string) {
    await fetch(`/api/tasks/${taskId}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ date }),
    });
    await load();
  }

  async function addTask(values = { title, emoji, category, recurrence }) {
    if (!values.title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...values, weekdays: [0, 1, 2, 3, 4, 5, 6] }),
    });
    setTitle("");
    setShowAdd(false);
    await load();
  }

  async function deleteTask(id: number) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE", credentials: "include" });
    await load();
  }

  function isDue(task: Task, date: string) {
    if (task.recurrence === "once") return task.dueDate === date;
    if (task.recurrence === "weekly") return task.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay());
    return true;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">ARSEN LIFE OS</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">Задачник</h2>
          <p className="mt-1 text-sm text-muted-foreground">Превращаем дисциплину в измеримый результат.</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} className="gap-2"><Plus className="h-4 w-4" /> Новая задача</Button>
      </div>

      {showAdd && (
        <Card className="border-primary/30 bg-card/80">
          <CardHeader><CardTitle className="text-base">Добавить задачу / привычку</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[80px_1fr_180px_160px_auto]">
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="text-center text-xl" />
            <Input autoFocus placeholder="Например: написать 1000 слов" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} />
            <Input placeholder="Категория" value={category} onChange={(e) => setCategory(e.target.value)} />
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="daily">Каждый день</option><option value="weekly">Еженедельно</option></select>
            <Button onClick={() => addTask()}>Создать</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="border-primary/20"><CardContent className="p-5"><div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">Эффективность <BarChart3 className="h-4 w-4 text-primary" /></div><div className={`mt-2 text-4xl font-bold ${pctClass(average)}`}>{average}%</div><p className="mt-1 text-xs text-muted-foreground">за {period} дней</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">Индекс дисциплины <Zap className="h-4 w-4 text-amber-400" /></div><div className={`mt-2 text-4xl font-bold ${pctClass(discipline)}`}>{discipline}</div><p className="mt-1 text-xs text-muted-foreground">эффективность + стабильность</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">Серия <Flame className="h-4 w-4 text-orange-400" /></div><div className="mt-2 text-4xl font-bold">{dashboard?.summary.streak ?? 0}</div><p className="mt-1 text-xs text-muted-foreground">дней подряд 100%</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">Выполнено <Check className="h-4 w-4 text-emerald-400" /></div><div className="mt-2 text-4xl font-bold">{dashboard?.summary.done ?? 0}</div><p className="mt-1 text-xs text-muted-foreground">из {dashboard?.summary.due ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">Лучший день <Trophy className="h-4 w-4 text-amber-400" /></div><div className="mt-2 text-2xl font-bold">{bestDay ? formatDay(bestDay.date) : "—"}</div><p className={`mt-1 text-xs font-semibold ${pctClass(bestDay?.percentage ?? 0)}`}>{bestDay?.percentage ?? 0}%</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0"><div><CardTitle>Тепловая карта дисциплины</CardTitle><p className="mt-1 text-xs text-muted-foreground">Каждая клетка — один день. Чем ярче, тем больше задач выполнено.</p></div><div className="flex gap-1 rounded-lg bg-muted p-1"><button onClick={() => setPeriod("14")} className={`rounded px-2 py-1 text-xs ${period === "14" ? "bg-background shadow" : "text-muted-foreground"}`}>14</button><button onClick={() => setPeriod("30")} className={`rounded px-2 py-1 text-xs ${period === "30" ? "bg-background shadow" : "text-muted-foreground"}`}>30</button></div></CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2 sm:grid-cols-10 md:grid-cols-15 xl:grid-cols-[repeat(30,minmax(0,1fr))]">
            {days.map((day) => <div key={day.date} title={`${formatDay(day.date)} — ${day.percentage}% (${day.done}/${day.due})`} className={`aspect-square rounded-md ${heatClass(day.percentage, day.due)} transition-transform hover:scale-110`} />)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground"><span>{days[0] ? formatDay(days[0].date) : ""}</span><div className="flex items-center gap-1"><span>0%</span><span className="h-3 w-3 rounded-sm bg-muted/20" /><span className="h-3 w-3 rounded-sm bg-emerald-500/20" /><span className="h-3 w-3 rounded-sm bg-emerald-500/40" /><span className="h-3 w-3 rounded-sm bg-emerald-500/65" /><span className="h-3 w-3 rounded-sm bg-emerald-500/90" /><span>100%</span></div><span>{days.length ? formatDay(days[days.length - 1].date) : ""}</span></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Динамика эффективности</CardTitle><p className="mt-1 text-xs text-muted-foreground">Процент выполненных задач по дням</p></CardHeader>
          <CardContent><div className="h-[260px]">{loading ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Загрузка...</div> : <ResponsiveContainer width="100%" height="100%"><LineChart data={days}><CartesianGrid strokeDasharray="3 3" opacity={0.12} /><XAxis dataKey="date" tickFormatter={(v) => new Date(`${v}T12:00:00Z`).getUTCDate().toString()} tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => [`${v}%`, "Выполнение"]} labelFormatter={(v) => formatDay(v as string)} /><Line type="monotone" dataKey="percentage" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer>}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>По категориям</CardTitle><p className="text-xs text-muted-foreground">Где ты стабилен, а где проседаешь</p></CardHeader>
          <CardContent><div className="h-[260px]">{dashboard?.categories.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.categories} layout="vertical" margin={{ left: 5, right: 10 }}><CartesianGrid strokeDasharray="3 3" opacity={0.12} /><XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="category" width={80} tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => [`${v}%`, "Выполнение"]} /><Bar dataKey="percentage" fill="hsl(var(--primary))" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Добавь первую задачу</div>}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Ритм по неделям</CardTitle><p className="text-xs text-muted-foreground">Так видно, растёт ли твоя дисциплина.</p></CardHeader><CardContent><div className="space-y-3">{weeks.map((item) => <div key={item.label}><div className="mb-1 flex justify-between text-xs"><span>{item.label}</span><span className={pctClass(item.value)}>{item.value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.value}%` }} /></div></div>)}{!weeks.length && <p className="text-sm text-muted-foreground">Нет данных.</p>}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Последние 7 дней</CardTitle><p className="text-xs text-muted-foreground">Текущий контроль без самообмана.</p></CardHeader><CardContent><div className="flex items-end justify-between"><div><div className={`text-5xl font-bold ${pctClass(weekScore)}`}>{weekScore}%</div><p className="mt-1 text-sm text-muted-foreground">средняя эффективность</p></div><Target className="h-12 w-12 text-primary/30" /></div><div className="mt-5 grid grid-cols-7 gap-2">{week.map((day) => <div key={day.date} className="text-center"><div className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${heatClass(day.percentage, day.due)}`}>{day.percentage}</div><div className="mt-1 text-[9px] text-muted-foreground">{new Date(`${day.date}T12:00:00Z`).getUTCDate()}</div></div>)}</div></CardContent></Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0"><div><CardTitle>Матрица выполнения</CardTitle><p className="mt-1 text-xs text-muted-foreground">Нажимай на клетку — отметка сохраняется сразу.</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Target className="h-4 w-4" /> {matrixDays.length} дней</div></CardHeader>
        <CardContent className="p-0">
          {dashboard?.tasks.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse"><thead><tr className="border-y bg-muted/30"><th className="sticky left-0 z-10 min-w-[260px] bg-background/95 px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Задача</th>{matrixDays.map((day) => <th key={day.date} className="w-12 px-1 py-3 text-center text-[10px] font-semibold text-muted-foreground">{formatDay(day.date)}</th>)}<th className="w-16 px-2 text-center text-xs font-semibold text-muted-foreground">%</th><th className="w-10" /></tr></thead><tbody>{dashboard.tasks.map((task) => { const due = matrixDays.filter((d) => isDue(task, d.date)); const done = due.filter((d) => completionSet.has(`${task.id}:${d.date}`)); const taskPct = due.length ? Math.round((done.length / due.length) * 100) : 0; return <tr key={task.id} className="border-b transition-colors hover:bg-muted/20"><td className="sticky left-0 z-10 bg-background/95 px-4 py-3"><div className="flex items-center gap-3"><span className="text-xl">{task.emoji}</span><div><div className="font-medium">{task.title}</div><div className="text-[10px] text-muted-foreground">{task.category}</div></div></div></td>{matrixDays.map((day) => { const dueToday = isDue(task, day.date); const checked = completionSet.has(`${task.id}:${day.date}`); return <td key={day.date} className="px-1 py-2 text-center">{dueToday ? <button aria-label={`${task.title}: ${day.date}`} onClick={() => toggle(task.id, day.date)} className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md border transition-all ${checked ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400" : "border-border bg-muted/20 text-transparent hover:border-primary/50"}`}><Check className="h-4 w-4" /></button> : <span className="text-muted-foreground/20">—</span>}</td>; })}<td className={`text-center text-xs font-bold ${pctClass(taskPct)}`}>{taskPct}%</td><td className="text-center"><button onClick={() => deleteTask(task.id)} className="text-muted-foreground/40 hover:text-rose-400" title="Удалить"><Trash2 className="h-4 w-4" /></button></td></tr>; })}</tbody></table></div> : <div className="p-10 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Target className="h-6 w-6" /></div><h3 className="font-semibold">Пока нет задач</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Создай привычки и задачи — ARSEN начнёт считать процент выполнения, серию и динамику эффективности.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{presets.map(([pEmoji, pTitle, pCategory]) => <Button key={pTitle} variant="outline" size="sm" onClick={() => addTask({ title: pTitle, emoji: pEmoji, category: pCategory, recurrence: "daily" })}>{pEmoji} {pTitle}</Button>)}</div></div>}
        </CardContent>
      </Card>
    </div>
  );
}
