import { mergeDefaultCategories } from "@/domain/categories";
import { CURRENT_APP_STATE_VERSION } from "@/domain/migrations";
import { parseAppState } from "@/domain/schemas";
import type { Event, ExpenseCategory, Reminder } from "@/domain/models";

export const BACKUP_VERSION = 1;

export interface BackupSettings {
  activeEventId?: string;
}

export interface DebtCalcBackup {
  version: 1;
  exportedAt: string;
  events: Event[];
  categories: ExpenseCategory[];
  reminders: Reminder[];
  settings: BackupSettings;
}

export type BackupImportResult =
  | { ok: true; backup: DebtCalcBackup }
  | { ok: false; error: BackupImportError };

export type BackupImportError =
  | "invalidJson"
  | "invalidVersion"
  | "invalidStructure";

export function createBackup({
  events,
  categories,
  activeEventId,
  reminders,
}: {
  events: Event[];
  categories: ExpenseCategory[];
  reminders?: Reminder[];
  activeEventId?: string;
}): DebtCalcBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    events,
    categories,
    reminders: reminders ?? [],
    settings: {
      activeEventId,
    },
  };
}

export function exportBackupToJSON(backup: DebtCalcBackup): string {
  return JSON.stringify(backup, null, 2);
}

export function importBackupFromJSON(jsonText: string): BackupImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "invalidJson" };
  }

  if (!isRecord(parsed) || parsed.version !== BACKUP_VERSION) {
    return { ok: false, error: "invalidVersion" };
  }

  if (
    typeof parsed.exportedAt !== "string" ||
    !Array.isArray(parsed.events) ||
    !Array.isArray(parsed.categories) ||
    (parsed.reminders !== undefined && !Array.isArray(parsed.reminders)) ||
    !isRecord(parsed.settings)
  ) {
    return { ok: false, error: "invalidStructure" };
  }

  if (
    !parsed.events.every(isEvent) ||
    !parsed.categories.every(isCategory) ||
    (Array.isArray(parsed.reminders) && !parsed.reminders.every(isReminder))
  ) {
    return { ok: false, error: "invalidStructure" };
  }

  const activeEventId =
    typeof parsed.settings.activeEventId === "string" ? parsed.settings.activeEventId : undefined;
  let appState: ReturnType<typeof parseAppState>;
  try {
    appState = parseAppState({
      version: CURRENT_APP_STATE_VERSION,
      events: parsed.events,
      categories: parsed.categories,
      reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
      settings: { activeEventId },
    });
  } catch {
    return { ok: false, error: "invalidStructure" };
  }

  return {
    ok: true,
    backup: {
      version: BACKUP_VERSION,
      exportedAt: parsed.exportedAt,
      events: appState.events,
      categories: mergeDefaultCategories(appState.categories),
      reminders: appState.reminders,
      settings: appState.settings,
    },
  };
}

function isEvent(value: unknown): value is Event {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.users) &&
    value.users.every(isParticipant) &&
    Array.isArray(value.participantGroups) &&
    value.participantGroups.every(isParticipantGroup) &&
    Array.isArray(value.expenses) &&
    value.expenses.every(isExpense)
  );
}

function isParticipant(value: unknown) {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}

function isParticipantGroup(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.participantIds) &&
    value.participantIds.every((participantId) => typeof participantId === "string")
  );
}

function isExpense(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Number.isSafeInteger(value.amountCents) &&
    Array.isArray(value.paidBySplits) &&
    value.paidBySplits.every(isExpenseSplit) &&
    Array.isArray(value.splits) &&
    value.splits.every(isExpenseSplit) &&
    (value.categoryId === undefined || typeof value.categoryId === "string") &&
    (value.note === undefined || typeof value.note === "string") &&
    (value.splitMode === "equal" || value.splitMode === "custom") &&
    typeof value.date === "string"
  );
}

function isExpenseSplit(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.participantId === "string" &&
    Number.isSafeInteger(value.amountCents)
  );
}

function isCategory(value: unknown): value is ExpenseCategory {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.icon === "string"
  );
}

function isReminder(value: unknown): value is Reminder {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.eventId === "string" &&
    (value.expenseId === undefined || typeof value.expenseId === "string") &&
    typeof value.title === "string" &&
    (value.message === undefined || typeof value.message === "string") &&
    typeof value.remindAt === "string" &&
    (value.status === "scheduled" || value.status === "sent" || value.status === "cancelled") &&
    typeof value.createdAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
