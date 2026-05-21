import { mergeDefaultCategories } from "@/domain/categories";
import { applyMigrations, CURRENT_APP_STATE_VERSION } from "@/domain/migrations";
import type { AppState } from "./appState";
import type { AppStorageAdapter } from "./AppStorageAdapter";
import { getCurrentUser, supabase } from "@/lib/supabase/client";
import { withRetry } from "@/lib/retry";

interface UserAppStateRow {
  user_id: string;
  state: AppState;
  updated_at: string;
}

export class SupabaseStorageAdapter implements AppStorageAdapter {
  async loadState(): Promise<AppState | null> {
    const userId = await getAuthenticatedUserId();
    const { data, error } = await withRetry(async () =>
      supabase
        .from("user_app_state")
        .select("state")
        .eq("user_id", userId)
        .maybeSingle<Pick<UserAppStateRow, "state">>(),
    );

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.state) {
      return null;
    }

    return normalizeAppState(applyMigrations(data.state));
  }

  async saveState(state: AppState): Promise<void> {
    const userId = await getAuthenticatedUserId();
    const { error } = await withRetry(async () =>
      supabase
        .from("user_app_state")
        .upsert(
          {
            user_id: userId,
            state: normalizeAppState(state),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        ),
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  async clearState(): Promise<void> {
    const userId = await getAuthenticatedUserId();
    const { error } = await supabase.from("user_app_state").delete().eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }
  }
}

async function getAuthenticatedUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("User is not authenticated.");
  }

  return user.id;
}

function normalizeAppState(state: AppState): AppState {
  return {
    events: state.events,
    categories: mergeDefaultCategories(state.categories),
    reminders: state.reminders ?? [],
    version: CURRENT_APP_STATE_VERSION,
    settings: state.settings ?? {},
  };
}
