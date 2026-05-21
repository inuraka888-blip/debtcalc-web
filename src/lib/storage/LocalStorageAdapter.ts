import { mergeDefaultCategories } from "@/domain/categories";
import { applyMigrations, CURRENT_APP_STATE_VERSION } from "@/domain/migrations";
import type { Event, ExpenseCategory, Reminder } from "@/domain/models";
import type { CollaborativeEventLink } from "@/lib/realtime";
import { logger } from "@/lib/logger";
import type { AppState } from "./appState";
import type { AppStorageAdapter } from "./AppStorageAdapter";

export const LOCAL_STORAGE_KEY = "debtcalc-events-v1";
const LOCAL_STORAGE_BACKUP_KEY = "debtcalc-events-v1-pre-migration-backup";

interface PersistedZustandState {
  state?: {
    events?: Event[];
    categories?: ExpenseCategory[];
    reminders?: Reminder[];
    activeEventId?: string;
    groups?: Event[];
    activeGroupId?: string;
  };
}

export class LocalStorageAdapter implements AppStorageAdapter {
  constructor(private readonly key = LOCAL_STORAGE_KEY) {}

  async loadState(): Promise<AppState | null> {
    if (typeof window === "undefined") {
      return null;
    }

    const rawValue = window.localStorage.getItem(this.key);
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      const appState = toAppState(parsed);
      if (appState && appState.version < CURRENT_APP_STATE_VERSION) {
        window.localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, rawValue);
        await this.saveState(appState);
      }
      return appState;
    } catch (error) {
      logger.error("Failed to restore local app state.", error);
      window.localStorage.setItem(`${this.key}-corrupted-${Date.now()}`, rawValue);
      return null;
    }
  }

  async saveState(state: AppState): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      this.key,
      JSON.stringify({
        version: 1,
        appStateVersion: CURRENT_APP_STATE_VERSION,
        events: state.events,
        categories: mergeDefaultCategories(state.categories),
        reminders: state.reminders,
        settings: state.settings,
      }),
    );
  }

  async clearState(): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(this.key);
  }

  approximateSize(): string {
    if (typeof window === "undefined") {
      return "-";
    }

    const value = window.localStorage.getItem(this.key);
    if (!value) {
      return "0 KB";
    }

    const bytes = new Blob([value]).size;
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    return `${(bytes / 1024).toFixed(1)} KB`;
  }
}

function toAppState(parsed: unknown): AppState | null {
  if (!isRecord(parsed)) {
    return null;
  }

  if (Array.isArray(parsed.events) && Array.isArray(parsed.categories)) {
    return applyMigrations({
      version: typeof parsed.appStateVersion === "number" ? parsed.appStateVersion : parsed.version,
      events: parsed.events as Event[],
      categories: mergeDefaultCategories(parsed.categories as ExpenseCategory[]),
      reminders: Array.isArray(parsed.reminders) ? (parsed.reminders as Reminder[]) : [],
      settings: isRecord(parsed.settings)
        ? {
            activeEventId: typeof parsed.settings.activeEventId === "string" ? parsed.settings.activeEventId : undefined,
            collaborativeEvents: isRecord(parsed.settings.collaborativeEvents)
              ? (parsed.settings.collaborativeEvents as Record<string, CollaborativeEventLink>)
              : undefined,
          }
        : {},
    });
  }

  const persisted = parsed as PersistedZustandState;
  if (persisted.state) {
    const events = persisted.state.events ?? persisted.state.groups ?? [];
    return applyMigrations({
      events,
      categories: mergeDefaultCategories(persisted.state.categories),
      reminders: persisted.state.reminders ?? [],
      settings: {
        activeEventId: persisted.state.activeEventId ?? persisted.state.activeGroupId,
      },
    });
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
