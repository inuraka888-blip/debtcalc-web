import { z } from "zod";

export const ExpenseSplitSchema = z.object({
  participantId: z.string().min(1),
  amountCents: z.number().int().safe().nonnegative(),
});

export const ExpenseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  amountCents: z.number().int().safe().positive(),
  paidBySplits: z.array(ExpenseSplitSchema),
  splits: z.array(ExpenseSplitSchema),
  categoryId: z.string().optional(),
  note: z.string().optional(),
  splitMode: z.enum(["equal", "custom"]),
  date: z.string().min(1),
});

export const ParticipantSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

export const ParticipantGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  participantIds: z.array(z.string()),
});

export const EventSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  users: z.array(ParticipantSchema),
  participantGroups: z.array(ParticipantGroupSchema).default([]),
  expenses: z.array(ExpenseSchema),
});

export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  icon: z.string(),
});

export const ReminderSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  expenseId: z.string().optional(),
  title: z.string(),
  message: z.string().optional(),
  remindAt: z.string().min(1),
  status: z.enum(["scheduled", "sent", "cancelled"]),
  createdAt: z.string().min(1),
});

export const AppStateSchema = z.object({
  version: z.number().int().positive().optional(),
  events: z.array(EventSchema),
  categories: z.array(CategorySchema),
  reminders: z.array(ReminderSchema).default([]),
  settings: z
    .object({
      activeEventId: z.string().optional(),
      collaborativeEvents: z
        .record(
          z.string(),
          z.object({
            remoteEventId: z.string(),
            permission: z.enum(["owner", "editor", "viewer"]),
          }),
        )
        .optional(),
    })
    .default({}),
});

export type ParsedAppState = z.infer<typeof AppStateSchema>;

export function parseAppState(value: unknown): ParsedAppState {
  return AppStateSchema.parse(value);
}
