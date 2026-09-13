import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Flame, Plus, Target, Trash2, Trophy, X } from "lucide-react";
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
];

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

type Dashboard = {
  tasks: Task[];
  completions: { taskId: number; completedDate: string }[];
  daily: { date: string; due: number; done: number; percentage: number }[];
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

function percentageClass(value: number) {
  if (value >= 90) return "text-emerald-400";
  if (value >= 70) return "text-cyan-400";
  if (value >= 50) return "text-amber-400";
  return "text-rose-400";
}

export default function Tasks() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("✅");
  const [category, setCategory] = useState("Личное");
  const [recurrence, setRecurrence] = useState("daily");
  const [showAdd, setShowAdd] = useState(false);
  const [period, setPeriod] = useState<"14" | "30">("14");

  const from = useMemo(() => localDate(-(Number(period) - 1)), [period]);
  const to = useMemo(() => localDate(), []);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/tasks/dashboard?from=${from}&to=${to}`, { credentials: "include" });
    if (response.ok) setDashboard(await response.json());
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const completionSet = useMemo(() => new Set((dashboard?.completions ?? []).map((item) => `${item.taskId}:${item.completedDate}`)), [dashboard]);
  const days = dashboard?.daily ?? [];
  const matrixDays = days.slice(-14);

  async function toggle(taskId: number, date: string) {
    await fetch(`/api/tasks/${taskId}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ date }),
    });
    await load();
  }

  async function addTask() {
    if (!title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, emoji, category, recurrence, weekdays: [0, 1, 2, 3, 4, 5, 6] }),
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
    if (task.recurrence === "weekly") {
      return task.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay());
    }
    return true;
  }

  const average = dashboard?.summary.efficiency ?? 0;
  const bestDay = days.length ? days.reduce((best, item) => item.percentage > best.percentage ? item : best, days[0]) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">ARSEN LIFE OS</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">Задачник</h2>
          <p className="mt-1 text-sm text-muted-foreground">Не просто список дел — система измерения твоей эффективности.</p>
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
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="daily">Каждый день</option><option value="weekly">Еженедельно</option>
            </select>
            <Button onClick={addTask}>Создать</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="overflow-hidden border-primary/20"><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Эффективность</span><BarChart3 className="h-4 w-4 text-primary" /></div><div className={`mt-2 text-4xl font-bold ${percentageClass(average)}`}>{average}%</div><p className="mt-1 text-xs text-muted-foreground">за выбранный период</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Серия</span><Flame className="h-4 w-4 text-orange-400" /></div><div className="mt-2 text-4xl font-bold">{dashboard?.summary.streak ?? 0}</div><p className="mt-1 text-xs text-muted-foreground">дней подряд по плану</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Выполнено</span><Check className="h-4 w-4 text-emerald-400" /></div><div className="mt-2 text-4xl font-bold">{dashboard?.summary.done ?? 0}</div><p className="mt-1 text-xs text-muted-foreground">из {dashboard?.summary.due ?? 0} запланированных</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Лучший день</span><Trophy className="h-4 w-4 text-amber-400" /></div><div className="mt-2 text-2xl font-bold">{bestDay ? formatDay(bestDay.date) : "—"}</div><p className={`mt-1 text-xs font-semibold ${percentageClass(bestDay?.percentage ?? 0)}`}>{bestDay?.percentage ?? 0}% выполнения</p></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0"><div><CardTitle>Динамика эффективности</CardTitle><p className="mt-1 text-xs text-muted-foreground">Процент выполненных задач по дням</p></div><div className="flex gap-1 rounded-lg bg-muted p-1"><button onClick={() => setPeriod("14")} className={`rounded px-2 py-1 text-xs ${period === "14" ? "bg-background shadow" : "text-muted-foreground"}`}>14 дней</button><button onClick={() => setPeriod("30")} className={`rounded px-2 py-1 text-xs ${period === "30" ? "bg-background shadow" : "text-muted-foreground"}`}>30 дней</button></div></CardHeader>
          <CardContent><div className="h-[260px]">{loading ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Загрузка...</div> : <ResponsiveContainer width="100%" height="100%"><LineChart data={days}><CartesianGrid strokeDasharray="3 3" opacity={0.12} /><XAxis dataKey="date" tickFormatter={(v) => new Date(`${v}T12:00:00Z`).getUTCDate().toString()} tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => [`${v}%`, "Выполнение"]} labelFormatter={(v) => formatDay(v as string)} /><Line type="monotone" dataKey="percentage" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer>}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>По категориям</CardTitle><p className="text-xs text-muted-foreground">Где ты стабилен, а где проседаешь</p></CardHeader>
          <CardContent><div className="h-[260px]">{dashboard?.categories.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.categories} layout="vertical" margin={{ left: 5, right: 10 }}><CartesianGrid strokeDasharray="3 3" opacity={0.12} /><XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="category" width={80} tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => [`${v}%`, "Выполнение"]} /><Bar dataKey="percentage" fill="hsl(var(--primary))" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Добавь первую задачу</div>}</div></CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0"><div><CardTitle>Матрица выполнения</CardTitle><p className="mt-1 text-xs text-muted-foreground">Нажимай на клетку — отметка сохраняется сразу</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Target className="h-4 w-4" /> {matrixDays.length} дней</div></CardHeader>
        <CardContent className="p-0">
          {dashboard?.tasks.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse"><thead><tr className="border-y bg-muted/30"><th className="sticky left-0 z-10 min-w-[260px] bg-background/95 px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Задача</th>{matrixDays.map((day) => <th key={day.date} className="w-12 px-1 py-3 text-center text-[10px] font-semibold text-muted-foreground">{formatDay(day.date)}</th>)}<th className="w-16 px-2 text-center text-xs font-semibold text-muted-foreground">%</th><th className="w-10" /></tr></thead><tbody>{dashboard.tasks.map((task) => { const due = matrixDays.filter((d) => isDue(task, d.date)); const done = due.filter((d) => completionSet.has(`${task.id}:${d.date}`)); const pct = due.length ? Math.round((done.length / due.length) * 100) : 0; return <tr key={task.id} className="border-b transition-colors hover:bg-muted/20"><td className="sticky left-0 z-10 bg-background/95 px-4 py-3"><div className="flex items-center gap-3"><span className="text-xl">{task.emoji}</span><div><div className="font-medium">{task.title}</div><div className="text-[10px] text-muted-foreground">{task.category}</div></div></div></td>{matrixDays.map((day) => { const dueToday = isDue(task, day.date); const checked = completionSet.has(`${task.id}:${day.date}`); return <td key={day.date} className="px-1 py-2 text-center">{dueToday ? <button aria-label={`${task.title}: ${day.date}`} onClick={() => toggle(task.id, day.date)} className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md border transition-all ${checked ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400" : "border-border bg-muted/20 text-transparent hover:border-primary/50"}`}><Check className="h-4 w-4" /></button> : <span className="text-muted-foreground/20">—</span>}</td> })}<td className={`text-center text-xs font-bold ${percentageClass(pct)}`}>{pct}%</td><td className="text-center"><button onClick={() => deleteTask(task.id)} className="text-muted-foreground/40 hover:text-rose-400" title="Удалить"><Trash2 className="h-4 w-4" /></button></td></tr> })}</tbody></table></div> : <div className="p-10 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Target className="h-6 w-6" /></div><h3 className="font-semibold">Пока нет задач</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Создай привычки и задачи — ARSEN начнёт считать процент выполнения, серию и динамику эффективности.</p><Button onClick={() => setShowAdd(true)} className="mt-4 gap-2"><Plus className="h-4 w-4" /> Добавить первую</Button></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Быстрый старт</CardTitle><p className="text-xs text-muted-foreground">Примеры из твоего референса</p></CardHeader>
        <CardContent className="flex flex-wrap gap-2">{presets.map(([e, name, cat]) => <button key={name} onClick={async () => { await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ title: name, emoji: e, category: cat, type: "habit", recurrence: "daily", weekdays: [0,1,2,3,4,5,6] }) }); await load(); }} className="rounded-full border bg-muted/20 px-3 py-2 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5">{e} {name}</button>)}</CardContent>
      </Card>
    </div>
  );
}
