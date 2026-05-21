import type { Event, EventId, ExpenseCategory, Reminder } from "@/domain/models";
import type { CollaborativeEventLink } from "@/lib/realtime";

export interface AppSettings {
  activeEventId?: EventId;
  collaborativeEvents?: Record<EventId, CollaborativeEventLink>;
}

export interface AppState {
  version: number;
  events: Event[];
  categories: ExpenseCategory[];
  reminders: Reminder[];
  settings: AppSettings;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error";
