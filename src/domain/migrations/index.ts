import type { AppState } from "@/lib/storage/appState";
import { parseAppState } from "@/domain/schemas";

export const CURRENT_APP_STATE_VERSION = 3;

type VersionedState = Partial<AppState> & {
  version?: number;
  events?: unknown;
  categories?: unknown;
  reminders?: unknown;
  settings?: unknown;
};

export class AppStateMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppStateMigrationError";
  }
}

export function migrateV1toV2(state: VersionedState): VersionedState {
  return {
    ...state,
    version: 2,
    reminders: Array.isArray(state.reminders) ? state.reminders : [],
  };
}

export function migrateV2toV3(state: VersionedState): VersionedState {
  const settings = typeof state.settings === "object" && state.settings !== null ? state.settings : {};
  return {
    ...state,
    version: 3,
    settings,
  };
}

export function applyMigrations(rawState: unknown): AppState {
  if (!rawState || typeof rawState !== "object") {
    throw new AppStateMigrationError("Stored data is not a valid object.");
  }

  let state = { ...(rawState as VersionedState) };
  const version = typeof state.version === "number" ? state.version : 1;

  try {
    if (version < 2) {
      state = migrateV1toV2(state);
    }
    if ((state.version ?? version) < 3) {
      state = migrateV2toV3(state);
    }
    if ((state.version ?? CURRENT_APP_STATE_VERSION) > CURRENT_APP_STATE_VERSION) {
      throw new AppStateMigrationError("Stored data was created by a newer app version.");
    }

    const parsed = parseAppState({
      ...state,
      version: CURRENT_APP_STATE_VERSION,
    });
    return {
      version: CURRENT_APP_STATE_VERSION,
      events: parsed.events,
      categories: parsed.categories,
      reminders: parsed.reminders,
      settings: parsed.settings,
    };
  } catch (error) {
    if (error instanceof AppStateMigrationError) {
      throw error;
    }
    throw new AppStateMigrationError(error instanceof Error ? error.message : "Failed to migrate app state.");
  }
}
