import type { Event } from "@/domain/models";
import { withRetry } from "@/lib/retry";
import { RemoteEventRepository } from "./RemoteEventRepository";

type QueueStatus = "syncing" | "synced" | "error";

export class EventSyncQueue {
  private repository = new RemoteEventRepository();
  private activeSave: Promise<void> | null = null;
  private pending: {
    remoteEventId: string;
    event: Event;
    previousEvent: Event;
    onRollback: (event: Event) => void;
    onStatus: (status: QueueStatus, error?: string) => void;
  } | null = null;

  enqueue(input: {
    remoteEventId: string;
    event: Event;
    previousEvent: Event;
    onRollback: (event: Event) => void;
    onStatus: (status: QueueStatus, error?: string) => void;
  }): void {
    this.pending = input;
    if (!this.activeSave) {
      this.activeSave = this.flush().finally(() => {
        this.activeSave = null;
      });
    }
  }

  private async flush(): Promise<void> {
    while (this.pending) {
      const current = this.pending;
      this.pending = null;
      current.onStatus("syncing");

      try {
        await withRetry(() => this.repository.saveEventSnapshot(current.remoteEventId, current.event));
        current.onStatus("synced");
      } catch (error) {
        current.onRollback(current.previousEvent);
        current.onStatus("error", error instanceof Error ? error.message : "Failed to sync event.");
      }
    }
  }
}
