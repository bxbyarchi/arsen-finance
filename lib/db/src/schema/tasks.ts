import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const tasksTable = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    emoji: text("emoji").default("✅").notNull(),
    category: text("category").default("Личное").notNull(),
    type: text("type").default("habit").notNull(), // habit | task | goal
    recurrence: text("recurrence").default("daily").notNull(), // daily | weekly | once
    weekdays: jsonb("weekdays").$type<number[]>().default([0, 1, 2, 3, 4, 5, 6]).notNull(),
    dueDate: text("due_date"), // YYYY-MM-DD for one-time tasks
    weight: integer("weight").default(1).notNull(),
    active: integer("active").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tasks_owner_active_idx").on(table.ownerId, table.active),
    index("tasks_owner_category_idx").on(table.ownerId, table.category),
  ],
);

export const taskCompletionsTable = pgTable(
  "task_completions",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    completedDate: text("completed_date").notNull(), // YYYY-MM-DD in user's calendar
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_completions_task_date_unique").on(table.taskId, table.completedDate),
    index("task_completions_owner_date_idx").on(table.ownerId, table.completedDate),
  ],
);

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, ownerId: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
export type TaskCompletion = typeof taskCompletionsTable.$inferSelect;
