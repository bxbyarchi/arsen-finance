import { Router } from "express";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import {
  db,
  savingsGoalsTable,
  taskCompletionsTable,
  taskGoalLinksTable,
  tasksTable,
} from "@workspace/db";

const router = Router();

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
    return (task.weekdays ?? []).includes(new Date(`${date}T12:00:00Z`).getUTCDay());
  }
  return true;
}

function validDate(value: unknown, fallback: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

router.get("/task-goals/dashboard", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const defaultFromDate = new Date(`${today}T12:00:00Z`);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  const from = validDate(req.query.from, defaultFromDate.toISOString().slice(0, 10));
  const to = validDate(req.query.to, today);
  const days = dateRange(from, to);

  const [goals, tasks, links, completions] = await Promise.all([
    db.select().from(savingsGoalsTable).where(eq(savingsGoalsTable.ownerId, req.user!.id)).orderBy(savingsGoalsTable.targetMonths),
    db.select().from(tasksTable).where(and(eq(tasksTable.ownerId, req.user!.id), eq(tasksTable.active, 1))).orderBy(tasksTable.createdAt),
    db.select().from(taskGoalLinksTable).innerJoin(tasksTable, eq(taskGoalLinksTable.taskId, tasksTable.id)).where(eq(tasksTable.ownerId, req.user!.id)),
    db.select().from(taskCompletionsTable).where(and(eq(taskCompletionsTable.ownerId, req.user!.id), gte(taskCompletionsTable.completedDate, from), lte(taskCompletionsTable.completedDate, to))),
  ]);

  const completionSet = new Set(completions.map((item) => `${item.taskId}:${item.completedDate}`));
  const linkedByGoal = new Map<number, number[]>();
  for (const row of links) {
    const goalId = row.task_goal_links.goalId;
    const taskId = row.task_goal_links.taskId;
    const current = linkedByGoal.get(goalId) ?? [];
    current.push(taskId);
    linkedByGoal.set(goalId, current);
  }

  const result = goals.map((goal) => {
    const taskIds = linkedByGoal.get(goal.id) ?? [];
    const linkedTasks = tasks.filter((task) => taskIds.includes(task.id));
    let due = 0;
    let done = 0;
    let weightedDue = 0;
    let weightedDone = 0;
    for (const date of days) {
      for (const task of linkedTasks) {
        if (!isDue(task, date)) continue;
        due += 1;
        weightedDue += task.weight;
        if (completionSet.has(`${task.id}:${date}`)) {
          done += 1;
          weightedDone += task.weight;
        }
      }
    }
    const discipline = weightedDue ? Math.round((weightedDone / weightedDue) * 100) : 0;
    const financialProgress = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
    const requiredMonthly = goal.targetMonths > 0 ? Math.max(0, (goal.targetAmount - goal.currentAmount) / goal.targetMonths) : 0;
    const alignment = Math.round(financialProgress * 0.6 + discipline * 0.4);
    return {
      goal: {
        id: goal.id,
        title: goal.title,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        targetMonths: goal.targetMonths,
        financialProgress,
        requiredMonthly,
      },
      tasks: linkedTasks.map((task) => ({ id: task.id, title: task.title, emoji: task.emoji, category: task.category, weight: task.weight })),
      discipline: { due, done, percentage: discipline },
      alignment,
    };
  });

  const linkedTaskIds = new Set(links.map((row) => row.task_goal_links.taskId));
  const unlinkedTasks = tasks.filter((task) => !linkedTaskIds.has(task.id)).map((task) => ({ id: task.id, title: task.title, emoji: task.emoji, category: task.category }));

  res.json({ from, to, goals: result, unlinkedTasks });
});

router.post("/task-goals", async (req, res) => {
  const taskId = Number(req.body?.taskId);
  const goalId = Number(req.body?.goalId);
  if (!Number.isInteger(taskId) || taskId <= 0 || !Number.isInteger(goalId) || goalId <= 0) {
    return res.status(400).json({ error: "Укажите корректную задачу и цель" });
  }

  const [task] = await db.select().from(tasksTable).where(and(eq(tasksTable.id, taskId), eq(tasksTable.ownerId, req.user!.id), eq(tasksTable.active, 1)));
  const [goal] = await db.select().from(savingsGoalsTable).where(and(eq(savingsGoalsTable.id, goalId), eq(savingsGoalsTable.ownerId, req.user!.id)));
  if (!task || !goal) return res.status(404).json({ error: "Задача или цель не найдены" });

  const [existing] = await db.select().from(taskGoalLinksTable).where(and(eq(taskGoalLinksTable.taskId, taskId), eq(taskGoalLinksTable.goalId, goalId)));
  if (existing) return res.json(existing);

  const [link] = await db.insert(taskGoalLinksTable).values({ taskId, goalId }).returning();
  res.status(201).json(link);
});

router.delete("/task-goals/:taskId/:goalId", async (req, res) => {
  const taskId = Number(req.params.taskId);
  const goalId = Number(req.params.goalId);
  if (!Number.isInteger(taskId) || !Number.isInteger(goalId)) return res.status(400).json({ error: "Некорректная связь" });

  const [task] = await db.select().from(tasksTable).where(and(eq(tasksTable.id, taskId), eq(tasksTable.ownerId, req.user!.id)));
  const [goal] = await db.select().from(savingsGoalsTable).where(and(eq(savingsGoalsTable.id, goalId), eq(savingsGoalsTable.ownerId, req.user!.id)));
  if (!task || !goal) return res.status(404).json({ error: "Не найдено" });

  await db.delete(taskGoalLinksTable).where(and(eq(taskGoalLinksTable.taskId, taskId), eq(taskGoalLinksTable.goalId, goalId)));
  res.status(204).send();
});

export default router;
