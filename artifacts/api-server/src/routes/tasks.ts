import { Router } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, taskCompletionsTable, tasksTable } from "@workspace/db";

const router = Router();

type TaskType = "habit" | "task" | "goal";
type Recurrence = "daily" | "weekly" | "once";

function isoDate(value: unknown, fallback: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return value;
}

function dateRange(from: string, to: string) {
  const result: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end && result.length < 366) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function isDue(task: typeof tasksTable.$inferSelect, date: string) {
  if (!task.active) return false;
  if (task.recurrence === "once") return task.dueDate === date;
  if (task.recurrence === "weekly") {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return (task.weekdays ?? []).includes(weekday);
  }
  return true;
}

function currentWindow() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 13);
  return { from: start.toISOString().slice(0, 10), to };
}

router.get("/tasks", async (req, res) => {
  const tasks = await db.select().from(tasksTable)
    .where(and(eq(tasksTable.ownerId, req.user!.id), eq(tasksTable.active, 1)))
    .orderBy(tasksTable.createdAt);
  res.json(tasks);
});

router.get("/tasks/dashboard", async (req, res) => {
  const fallback = currentWindow();
  const from = isoDate(req.query.from, fallback.from);
  const to = isoDate(req.query.to, fallback.to);
  const days = dateRange(from, to);

  const tasks = await db.select().from(tasksTable)
    .where(and(eq(tasksTable.ownerId, req.user!.id), eq(tasksTable.active, 1)))
    .orderBy(tasksTable.createdAt);

  const completions = await db.select().from(taskCompletionsTable)
    .where(and(eq(taskCompletionsTable.ownerId, req.user!.id), gte(taskCompletionsTable.completedDate, from), lte(taskCompletionsTable.completedDate, to)));

  const completed = new Set(completions.map((item) => `${item.taskId}:${item.completedDate}`));
  const daily = days.map((date) => {
    const due = tasks.filter((task) => isDue(task, date));
    const done = due.filter((task) => completed.has(`${task.id}:${date}`));
    const dueWeight = due.reduce((sum, task) => sum + task.weight, 0);
    const doneWeight = done.reduce((sum, task) => sum + task.weight, 0);
    return { date, due: due.length, done: done.length, percentage: dueWeight ? Math.round((doneWeight / dueWeight) * 100) : 0 };
  });

  const dueAll = daily.reduce((sum, day) => sum + day.due, 0);
  const doneAll = daily.reduce((sum, day) => sum + day.done, 0);
  const efficiency = dueAll ? Math.round((daily.reduce((sum, day) => sum + day.percentage, 0) / daily.length)) : 0;

  const categories = Array.from(new Set(tasks.map((task) => task.category))).map((category) => {
    const group = tasks.filter((task) => task.category === category);
    const due = days.reduce((sum, date) => sum + group.filter((task) => isDue(task, date)).length, 0);
    const done = days.reduce((sum, date) => sum + group.filter((task) => isDue(task, date) && completed.has(`${task.id}:${date}`)).length, 0);
    return { category, due, done, percentage: due ? Math.round((done / due) * 100) : 0 };
  }).sort((a, b) => b.percentage - a.percentage);

  let streak = 0;
  for (let i = daily.length - 1; i >= 0; i -= 1) {
    if (daily[i].due === 0 || daily[i].percentage === 100) streak += 1;
    else break;
  }

  res.json({ from, to, days, tasks, completions, daily, categories, summary: { efficiency, due: dueAll, done: doneAll, streak } });
});

router.post("/tasks", async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const emoji = typeof req.body?.emoji === "string" && req.body.emoji.trim() ? req.body.emoji.trim() : "✅";
  const category = typeof req.body?.category === "string" && req.body.category.trim() ? req.body.category.trim() : "Личное";
  const type = (["habit", "task", "goal"] as TaskType[]).includes(req.body?.type) ? req.body.type as TaskType : "habit";
  const recurrence = (["daily", "weekly", "once"] as Recurrence[]).includes(req.body?.recurrence) ? req.body.recurrence as Recurrence : "daily";
  const weekdays = Array.isArray(req.body?.weekdays) ? req.body.weekdays.filter((day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6) : [0, 1, 2, 3, 4, 5, 6];
  const dueDate = typeof req.body?.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.dueDate) ? req.body.dueDate : null;
  const weight = Math.max(1, Math.min(10, Number(req.body?.weight) || 1));

  if (!title) return res.status(400).json({ error: "Введите название задачи" });
  if (recurrence === "once" && !dueDate) return res.status(400).json({ error: "Для разовой задачи укажите дату" });

  const [task] = await db.insert(tasksTable).values({
    ownerId: req.user!.id,
    title,
    emoji,
    category,
    type,
    recurrence,
    weekdays,
    dueDate,
    weight,
    active: 1,
  }).returning();

  res.status(201).json(task);
});

router.post("/tasks/:id/toggle", async (req, res) => {
  const id = Number(req.params.id);
  const date = isoDate(req.body?.date, new Date().toISOString().slice(0, 10));
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Некорректная задача" });

  const [task] = await db.select().from(tasksTable).where(and(eq(tasksTable.id, id), eq(tasksTable.ownerId, req.user!.id), eq(tasksTable.active, 1)));
  if (!task) return res.status(404).json({ error: "Задача не найдена" });
  if (!isDue(task, date)) return res.status(400).json({ error: "Задача не запланирована на эту дату" });

  const [existing] = await db.select().from(taskCompletionsTable).where(and(eq(taskCompletionsTable.taskId, id), eq(taskCompletionsTable.ownerId, req.user!.id), eq(taskCompletionsTable.completedDate, date)));
  if (existing) {
    await db.delete(taskCompletionsTable).where(eq(taskCompletionsTable.id, existing.id));
    return res.json({ completed: false, date });
  }

  await db.insert(taskCompletionsTable).values({ taskId: id, ownerId: req.user!.id, completedDate: date });
  res.json({ completed: true, date });
});

router.delete("/tasks/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Некорректная задача" });
  const [updated] = await db.update(tasksTable).set({ active: 0 }).where(and(eq(tasksTable.id, id), eq(tasksTable.ownerId, req.user!.id), eq(tasksTable.active, 1))).returning();
  if (!updated) return res.status(404).json({ error: "Задача не найдена" });
  res.status(204).send();
});

export default router;
