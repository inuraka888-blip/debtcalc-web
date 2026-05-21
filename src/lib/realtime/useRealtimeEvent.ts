"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Event } from "@/domain/models";
import { useEventsStore } from "@/store/eventsStore";
import { EventSyncQueue } from "./EventSyncQueue";
import { RemoteEventRepository } from "./RemoteEventRepository";

const repository = new RemoteEventRepository();
const syncQueue = new EventSyncQueue();

export function useRealtimeEvent(event: Event | undefined) {
  const link = useEventsStore((state) =>
    event ? state.collaborativeEvents[event.id] : undefined,
  );
  const applyRemoteEvent = useEventsStore((state) => state.applyRemoteEvent);
  const setRealtimeMembers = useEventsStore((state) => state.setRealtimeMembers);
  const setSyncState = useEventsStore((state) => state.setSyncState);
  const previousSerializedEventRef = useRef<string | null>(null);
  const remoteWriteRef = useRef<string | null>(null);

  const canEdit = !link || link.permission === "owner" || link.permission === "editor";

  useEffect(() => {
    if (!event || !link) {
      return undefined;
    }

    let isMounted = true;
    const unsubscribe = repository.subscribeToEvent({
      remoteEventId: link.remoteEventId,
      onEventUpdated: () => {
        void repository
          .loadEvent(link.remoteEventId)
          .then((snapshot) => {
            if (!isMounted) {
              return;
            }

            const remoteEvent = { ...snapshot.event, id: event.id };
            const serialized = JSON.stringify(remoteEvent);
            remoteWriteRef.current = serialized;
            applyRemoteEvent(remoteEvent, snapshot.permission, link.remoteEventId);
            setSyncState("synced");
          })
          .catch((error) => {
            setSyncState("error", error instanceof Error ? error.message : "Failed to load realtime event.");
          });
      },
      onPresenceChanged: (members) => setRealtimeMembers(event.id, members),
      onError: (message) => setSyncState("error", message),
    });

    return () => {
      isMounted = false;
      unsubscribe.unsubscribe();
      setRealtimeMembers(event.id, []);
    };
  }, [applyRemoteEvent, event, link, setRealtimeMembers, setSyncState]);

  useEffect(() => {
    if (!event || !link || !canEdit) {
      previousSerializedEventRef.current = event ? JSON.stringify(event) : null;
      return;
    }

    const serialized = JSON.stringify(event);
    if (remoteWriteRef.current === serialized) {
      previousSerializedEventRef.current = serialized;
      remoteWriteRef.current = null;
      return;
    }

    const previousSerialized = previousSerializedEventRef.current;
    previousSerializedEventRef.current = serialized;
    if (!previousSerialized || previousSerialized === serialized) {
      return;
    }

    const previousEvent = JSON.parse(previousSerialized) as Event;
    syncQueue.enqueue({
      remoteEventId: link.remoteEventId,
      event,
      previousEvent,
      onRollback: (rollbackEvent) => {
        remoteWriteRef.current = JSON.stringify(rollbackEvent);
        applyRemoteEvent(rollbackEvent, link.permission, link.remoteEventId);
      },
      onStatus: setSyncState,
    });
  }, [applyRemoteEvent, canEdit, event, link, setSyncState]);

  return useMemo(
    () => ({
      isRealtimeEnabled: Boolean(link),
      canEdit,
      remoteEventId: link?.remoteEventId,
      permission: link?.permission,
    }),
    [canEdit, link],
  );
}
