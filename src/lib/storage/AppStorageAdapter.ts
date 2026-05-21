import type { AppState } from "./appState";

export interface AppStorageAdapter {
  loadState(): Promise<AppState | null>;
  saveState(state: AppState): Promise<void>;
  clearState(): Promise<void>;
}
