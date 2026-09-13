import { index, integer, pgTable, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { tasksTable } from "./tasks";
import { savingsGoalsTable } from "./savings-goals";

export const taskGoalLinksTable = pgTable(
  "task_goal_links",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
    goalId: integer("goal_id").notNull().references(() => savingsGoalsTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("task_goal_links_task_goal_unique").on(table.taskId, table.goalId),
    index("task_goal_links_task_idx").on(table.taskId),
    index("task_goal_links_goal_idx").on(table.goalId),
  ],
);

export type TaskGoalLink = typeof taskGoalLinksTable.$inferSelect;
