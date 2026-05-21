"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildValidatedExpense } from "@/domain/expenseValidation";
import type { ExpenseInput } from "@/domain/expenseValidation";
import type { Event, ParticipantGroupId, UserId } from "@/domain/models";
import { createId } from "@/lib/id";
import { CloudEventRepository, shouldUseNormalizedCloudEvents } from "@/lib/cloud";
import { supabase } from "@/lib/supabase/client";
import {
  loadSharedEvent,
  loadSharedEventById,
  saveSharedEvent,
} from "@/lib/supabase/sharedEvents";
import type { SharePermission } from "@/lib/supabase/sharedEvents";

type SaveStatus = "idle" | "saving" | "synced" | "offline" | "error";

interface SharedEventRow {
  id: string;
  event_data: Event;
  version: number;
  updated_at: string;
}

export function useSharedEventCollaboration(token: string) {
  const [event, setEvent] = useState<Event | null>(null);
  const [permission, setPermission] = useState<SharePermission>("view");
  const [sharedEventId, setSharedEventId] = useState<string | null>(null);
  const [remoteEventId, setRemoteEventId] = useState<string | undefined>(undefined);
  const [version, setVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connectedUsers, setConnectedUsers] = useState(1);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const eventRef = useRef<Event | null>(null);
  const versionRef = useRef(0);
  const sharedEventIdRef = useRef<string | null>(null);
  const remoteEventIdRef = useRef<string | undefined>(undefined);
  const cloudRepositoryRef = useRef(new CloudEventRepository());
  const isNormalizedCloud = shouldUseNormalizedCloudEvents();

  useEffect(() => {
    eventRef.current = event;
  }, [event]);

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  useEffect(() => {
    sharedEventIdRef.current = sharedEventId;
  }, [sharedEventId]);

  useEffect(() => {
    remoteEventIdRef.current = remoteEventId;
  }, [remoteEventId]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setSaveStatus((status) => (status === "offline" ? "idle" : status));
    }

    function handleOffline() {
      setIsOnline(false);
      setSaveStatus("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    void loadSharedEvent(token)
      .then(async (payload) => {
        if (!isMounted) {
          return;
        }

        if (!payload) {
          setError("Share link is invalid or expired.");
          return;
        }

        if (isNormalizedCloud && payload.remoteEventId) {
          const snapshot = await cloudRepositoryRef.current.getEvent(payload.remoteEventId);
          setEvent(snapshot.event);
        } else {
          setEvent(payload.event);
        }
        setPermission(payload.permission);
        setSharedEventId(payload.sharedEventId);
        setRemoteEventId(payload.remoteEventId);
        setVersion(payload.version);
        setSaveStatus("synced");
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load shared event.");
          setSaveStatus("error");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isNormalizedCloud, token]);

  useEffect(() => {
    if (isNormalizedCloud && remoteEventId) {
      const subscription = cloudRepositoryRef.current.subscribeToEvent({
        remoteEventId,
        onEventUpdated: () => {
          void cloudRepositoryRef.current
            .getEvent(remoteEventId)
            .then((snapshot) => {
              setEvent(snapshot.event);
              setVersion((current) => current + 1);
              setSaveStatus("synced");
              setError(null);
            })
            .catch((loadError: unknown) => {
              setSaveStatus("error");
              setError(loadError instanceof Error ? loadError.message : "Failed to load shared event.");
            });
        },
        onPresenceChanged: (members) => setConnectedUsers(Math.max(1, members.length)),
        onError: (message) => {
          setSaveStatus("error");
          setError(message);
        },
      });

      return () => subscription.unsubscribe();
    }

    if (!sharedEventId) {
      return;
    }

    const channel = supabase.channel(`shared_event:${sharedEventId}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channel
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events_shared",
          filter: `id=eq.${sharedEventId}`,
        },
        (payload) => {
          const row = payload.new as SharedEventRow;
          if (!row?.event_data || row.version <= versionRef.current) {
            return;
          }

          setEvent(row.event_data);
          setVersion(row.version);
          setSaveStatus("synced");
          setError(null);
        },
      )
      .on("presence", { event: "sync" }, () => {
        setConnectedUsers(countPresenceUsers(channel.presenceState()));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ onlineAt: new Date().toISOString() });
          setConnectedUsers(countPresenceUsers(channel.presenceState()));
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isNormalizedCloud, remoteEventId, sharedEventId]);

  const reloadLatest = useCallback(async () => {
    const remoteId = remoteEventIdRef.current;
    if (isNormalizedCloud && remoteId) {
      const latest = await cloudRepositoryRef.current.getEvent(remoteId);
      setEvent(latest.event);
      setVersion((current) => current + 1);
      setSaveStatus("synced");
      return;
    }

    const id = sharedEventIdRef.current;
    if (id) {
      const latest = await loadSharedEventById(id);
      if (latest) {
        setEvent(latest.event);
        setVersion(latest.version);
        setSaveStatus("synced");
      }
    }
  }, [isNormalizedCloud]);

  const commitEvent = useCallback(
    async (producer: (current: Event) => Event | null): Promise<boolean> => {
      if (permission !== "edit") {
        setError("This share link is view only.");
        return false;
      }
      if (!isOnline) {
        setSaveStatus("offline");
        setError("You are offline. Shared event editing is disabled.");
        return false;
      }

      const current = eventRef.current;
      const id = sharedEventIdRef.current;
      const remoteId = remoteEventIdRef.current;
      if (!current || (!id && !remoteId)) {
        return false;
      }

      const nextEvent = producer(current);
      if (!nextEvent) {
        return false;
      }

      const nextVersion = versionRef.current + 1;
      setEvent(nextEvent);
      setVersion(nextVersion);
      setSaveStatus("saving");
      setError(null);

      try {
        if (isNormalizedCloud && remoteId) {
          await cloudRepositoryRef.current.updateEvent(remoteId, nextEvent);
        } else if (id) {
          await saveSharedEvent({ sharedEventId: id, event: nextEvent, nextVersion });
        }
        setSaveStatus("synced");
        return true;
      } catch (saveError) {
        setSaveStatus("error");
        setError(saveError instanceof Error ? saveError.message : "Failed to save shared event.");
        await reloadLatest().catch(() => undefined);
        return false;
      }
    },
    [isNormalizedCloud, isOnline, permission, reloadLatest],
  );

  return {
    event,
    permission,
    remoteEventId,
    version,
    isLoading,
    saveStatus: isOnline ? saveStatus : "offline",
    error,
    connectedUsers,
    canEdit: permission === "edit" && isOnline,
    addParticipant: (name: string) =>
      commitEvent((current) => addParticipant(current, name)),
    updateParticipant: (participantId: UserId, name: string) =>
      commitEvent((current) => updateParticipant(current, participantId, name)),
    removeParticipant: (participantId: UserId) =>
      commitEvent((current) => removeParticipant(current, participantId)),
    addParticipantGroup: (name: string) =>
      commitEvent((current) => addParticipantGroup(current, name)),
    updateParticipantGroup: (groupId: ParticipantGroupId, name: string) =>
      commitEvent((current) => updateParticipantGroup(current, groupId, name)),
    deleteParticipantGroup: (groupId: ParticipantGroupId) =>
      commitEvent((current) => deleteParticipantGroup(current, groupId)),
    moveParticipantToGroup: (participantId: UserId, groupId: ParticipantGroupId) =>
      commitEvent((current) => moveParticipantToGroup(current, participantId, groupId)),
    moveParticipantToIndividuals: (participantId: UserId) =>
      commitEvent((current) => moveParticipantToIndividuals(current, participantId)),
    addExpense: (input: ExpenseInput) =>
      commitEvent((current) => addExpense(current, input)),
    updateExpense: (expenseId: string, input: ExpenseInput) =>
      commitEvent((current) => updateExpense(current, expenseId, input)),
    deleteExpense: (expenseId: string) =>
      commitEvent((current) => ({
        ...current,
        expenses: current.expenses.filter((expense) => expense.id !== expenseId),
      })),
  };
}

function addParticipant(event: Event, name: string): Event | null {
  const trimmedName = name.trim();
  if (!trimmedName || hasParticipantName(event, trimmedName)) {
    return null;
  }

  return {
    ...event,
    users: [...event.users, { id: createId("participant"), name: trimmedName }],
  };
}

function updateParticipant(event: Event, participantId: UserId, name: string): Event | null {
  const trimmedName = name.trim();
  if (!trimmedName || hasParticipantName(event, trimmedName, participantId)) {
    return null;
  }

  return {
    ...event,
    users: event.users.map((participant) =>
      participant.id === participantId ? { ...participant, name: trimmedName } : participant,
    ),
  };
}

function removeParticipant(event: Event, participantId: UserId): Event | null {
  const isUsed = event.expenses.some(
    (expense) =>
      expense.paidBySplits.some((split) => split.participantId === participantId) ||
      expense.splits.some((split) => split.participantId === participantId),
  );
  if (isUsed) {
    return null;
  }

  return {
    ...event,
    users: event.users.filter((participant) => participant.id !== participantId),
    participantGroups: event.participantGroups.map((group) => ({
      ...group,
      participantIds: group.participantIds.filter((id) => id !== participantId),
    })),
  };
}

function addParticipantGroup(event: Event, name: string): Event | null {
  const trimmedName = name.trim();
  if (!trimmedName || hasParticipantGroupName(event, trimmedName)) {
    return null;
  }

  return {
    ...event,
    participantGroups: [
      ...event.participantGroups,
      { id: createId("participant-group"), name: trimmedName, participantIds: [] },
    ],
  };
}

function updateParticipantGroup(event: Event, groupId: ParticipantGroupId, name: string): Event | null {
  const trimmedName = name.trim();
  if (!trimmedName || hasParticipantGroupName(event, trimmedName, groupId)) {
    return null;
  }

  return {
    ...event,
    participantGroups: event.participantGroups.map((group) =>
      group.id === groupId ? { ...group, name: trimmedName } : group,
    ),
  };
}

function deleteParticipantGroup(event: Event, groupId: ParticipantGroupId): Event {
  return {
    ...event,
    participantGroups: event.participantGroups.filter((group) => group.id !== groupId),
  };
}

function moveParticipantToGroup(event: Event, participantId: UserId, groupId: ParticipantGroupId): Event | null {
  if (!event.users.some((participant) => participant.id === participantId)) {
    return null;
  }
  if (!event.participantGroups.some((group) => group.id === groupId)) {
    return null;
  }

  return {
    ...event,
    participantGroups: event.participantGroups.map((group) => {
      const participantIds = group.participantIds.filter((id) => id !== participantId);
      return group.id === groupId ? { ...group, participantIds: [...participantIds, participantId] } : { ...group, participantIds };
    }),
  };
}

function moveParticipantToIndividuals(event: Event, participantId: UserId): Event {
  return {
    ...event,
    participantGroups: event.participantGroups.map((group) => ({
      ...group,
      participantIds: group.participantIds.filter((id) => id !== participantId),
    })),
  };
}

function addExpense(event: Event, input: ExpenseInput): Event | null {
  const result = buildValidatedExpense(event, createId("expense"), input);
  return result.ok ? { ...event, expenses: [result.expense, ...event.expenses] } : null;
}

function updateExpense(event: Event, expenseId: string, input: ExpenseInput): Event | null {
  const result = buildValidatedExpense(event, expenseId, input);
  return result.ok
    ? {
        ...event,
        expenses: event.expenses.map((expense) => (expense.id === expenseId ? result.expense : expense)),
      }
    : null;
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function hasParticipantName(event: Event, name: string, excludingParticipantId?: UserId): boolean {
  const normalizedName = normalizeName(name);
  return event.users.some(
    (participant) => participant.id !== excludingParticipantId && normalizeName(participant.name) === normalizedName,
  );
}

function hasParticipantGroupName(event: Event, name: string, excludingGroupId?: ParticipantGroupId): boolean {
  const normalizedName = normalizeName(name);
  return event.participantGroups.some(
    (group) => group.id !== excludingGroupId && normalizeName(group.name) === normalizedName,
  );
}

function countPresenceUsers(presenceState: Record<string, unknown[]>): number {
  return Math.max(1, Object.values(presenceState).reduce((sum, users) => sum + users.length, 0));
}
