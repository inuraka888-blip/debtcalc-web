import type { AppState } from "./appState";
import type { AppStorageAdapter } from "./AppStorageAdapter";

export class RemoteStorageAdapter implements AppStorageAdapter {
  async loadState(): Promise<AppState | null> {
    // Future Supabase/Firebase sync entry point.
    // This will load authenticated user data from a remote backend.
    // Conflict resolution will merge local and remote AppState versions here.
    // User auth/session handling will also be connected at this boundary.
    return null;
  }

  async saveState(state: AppState): Promise<void> {
    void state;
    // Future Supabase/Firebase sync entry point.
    // This will push local AppState changes to a remote backend.
    // Conflict resolution and retry queues will live behind this adapter.
  }

  async clearState(): Promise<void> {
    // Future Supabase/Firebase sync entry point.
    // This will clear or disconnect remote user data after auth is available.
  }
}
