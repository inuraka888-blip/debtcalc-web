import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Event, Expense, ExpenseSplit, ParticipantGroup } from "@/domain/models";
import { withRetry } from "@/lib/retry";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { EventPresenceMember, RemoteEventPermission, RealtimeEventSnapshot } from "./types";

type EventRow = {
  id: string;
  owner_id: string;
  local_event_id: string;
  title: string;
  updated_at: string;
};

type ParticipantRow = {
  id: string;
  event_id: string;
  name: string;
};

type ParticipantGroupRow = {
  id: string;
  event_id: string;
  name: string;
};

type ParticipantGroupMemberRow = {
  participant_group_id: string;
  participant_id: string;
  event_id: string;
};

type ExpenseRow = {
  id: string;
  event_id: string;
  title: string;
  amount_cents: number;
  category_id: string | null;
  note: string | null;
  split_mode: "equal" | "custom";
  date: string;
};

type ExpenseSplitRow = {
  expense_id: string;
  participant_id: string;
  amount_cents: number;
  event_id: string;
};

export class RemoteEventRepository {
  async ensureRemoteEvent(event: Event): Promise<RealtimeEventSnapshot> {
    const userId = await requireUserId();

    const { data: existing, error: selectError } = await supabase
      .from("events")
      .select("id, owner_id, local_event_id, title, updated_at")
      .eq("owner_id", userId)
      .eq("local_event_id", event.id)
      .maybeSingle<EventRow>();

    if (selectError) {
      throw new Error(selectError.message);
    }

    const remoteEventId = existing?.id ?? (await this.createRemoteEvent(event, userId));
    if (!existing) {
      await this.ensureOwnerMembership(remoteEventId, userId);
    }

    await withRetry(() => this.saveEventSnapshot(remoteEventId, event));
    return {
      event,
      remoteEventId,
      permission: "owner",
    };
  }

  async loadEvent(remoteEventId: string): Promise<RealtimeEventSnapshot> {
    assertConfigured();

    const [
      eventResult,
      permissionResult,
      participantsResult,
      groupsResult,
      groupMembersResult,
      expensesResult,
      paidBySplitsResult,
      splitsResult,
    ] = await Promise.all([
      supabase.from("events").select("id, owner_id, local_event_id, title, updated_at").eq("id", remoteEventId).single<EventRow>(),
      supabase.rpc("current_event_permission", { p_event_id: remoteEventId }),
      supabase.from("participants").select("id, event_id, name").eq("event_id", remoteEventId).order("name"),
      supabase.from("participant_groups").select("id, event_id, name").eq("event_id", remoteEventId).order("name"),
      supabase.from("participant_group_members").select("participant_group_id, participant_id, event_id").eq("event_id", remoteEventId),
      supabase.from("expenses").select("id, event_id, title, amount_cents, category_id, note, split_mode, date").eq("event_id", remoteEventId),
      supabase.from("expense_paid_by_splits").select("expense_id, participant_id, amount_cents, event_id").eq("event_id", remoteEventId),
      supabase.from("expense_splits").select("expense_id, participant_id, amount_cents, event_id").eq("event_id", remoteEventId),
    ]);

    throwIfSupabaseError(eventResult.error);
    throwIfSupabaseError(permissionResult.error);
    throwIfSupabaseError(participantsResult.error);
    throwIfSupabaseError(groupsResult.error);
    throwIfSupabaseError(groupMembersResult.error);
    throwIfSupabaseError(expensesResult.error);
    throwIfSupabaseError(paidBySplitsResult.error);
    throwIfSupabaseError(splitsResult.error);

    return {
      remoteEventId,
      permission: normalizePermission(permissionResult.data),
      event: toDomainEvent({
        event: eventResult.data,
        participants: participantsResult.data ?? [],
        groups: groupsResult.data ?? [],
        groupMembers: groupMembersResult.data ?? [],
        expenses: expensesResult.data ?? [],
        paidBySplits: paidBySplitsResult.data ?? [],
        splits: splitsResult.data ?? [],
      }),
    };
  }

  async saveEventSnapshot(remoteEventId: string, event: Event): Promise<void> {
    assertConfigured();

    const { error: eventError } = await supabase
      .from("events")
      .update({ name: event.name, title: event.name })
      .eq("id", remoteEventId);
    throwIfSupabaseError(eventError);

    await this.upsertParticipants(remoteEventId, event);
    await this.replaceParticipantGroups(remoteEventId, event.participantGroups);
    await this.replaceExpenses(remoteEventId, event.expenses);
    await deleteMissingRows("participants", remoteEventId, event.users.map((participant) => participant.id));
  }

  subscribeToEvent({
    remoteEventId,
    onEventUpdated,
    onPresenceChanged,
    onError,
  }: {
    remoteEventId: string;
    onEventUpdated: () => void;
    onPresenceChanged: (members: EventPresenceMember[]) => void;
    onError: (message: string) => void;
  }): { unsubscribe: () => void } {
    if (!isSupabaseConfigured()) {
      onError("Supabase is not configured.");
      return { unsubscribe: () => undefined };
    }

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(onEventUpdated, 250);
    };

    const channel = supabase
      .channel(`event:${remoteEventId}`, {
        config: {
          presence: { key: crypto.randomUUID() },
        },
      })
      .on("postgres_changes", tableFilter("events", remoteEventId), scheduleRefresh)
      .on("postgres_changes", tableFilter("participants", remoteEventId), scheduleRefresh)
      .on("postgres_changes", tableFilter("participant_groups", remoteEventId), scheduleRefresh)
      .on("postgres_changes", tableFilter("participant_group_members", remoteEventId), scheduleRefresh)
      .on("postgres_changes", tableFilter("expenses", remoteEventId), scheduleRefresh)
      .on("postgres_changes", tableFilter("expense_paid_by_splits", remoteEventId), scheduleRefresh)
      .on("postgres_changes", tableFilter("expense_splits", remoteEventId), scheduleRefresh)
      .on("presence", { event: "sync" }, () => onPresenceChanged(readPresence(channel)))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data } = await supabase.auth.getUser();
          await channel.track({
            id: data.user?.id ?? crypto.randomUUID(),
            email: data.user?.email ?? "Anonymous",
            joinedAt: new Date().toISOString(),
          });
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          onError("Realtime connection failed.");
        }
      });

    return {
      unsubscribe: () => {
        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }
        void supabase.removeChannel(channel);
      },
    };
  }

  private async createRemoteEvent(event: Event, userId: string): Promise<string> {
    const { data, error } = await supabase
      .from("events")
      .insert({
        owner_id: userId,
        local_event_id: event.id,
        name: event.name,
        title: event.name,
      })
      .select("id")
      .single<{ id: string }>();
    throwIfSupabaseError(error);
    return data.id;
  }

  private async ensureOwnerMembership(remoteEventId: string, userId: string): Promise<void> {
    const { error } = await supabase.from("event_members").upsert({
      event_id: remoteEventId,
      user_id: userId,
      role: "owner",
      permission: "owner",
    });
    throwIfSupabaseError(error);
  }

  private async upsertParticipants(remoteEventId: string, event: Event): Promise<void> {
    if (event.users.length === 0) {
      return;
    }

    const { error } = await supabase.from("participants").upsert(
      event.users.map((participant) => ({
        id: participant.id,
        event_id: remoteEventId,
        name: participant.name,
      })),
    );
    throwIfSupabaseError(error);
  }

  private async replaceParticipantGroups(remoteEventId: string, groups: ParticipantGroup[]): Promise<void> {
    await deleteMissingRows("participant_groups", remoteEventId, groups.map((group) => group.id));
    if (groups.length > 0) {
      const { error } = await supabase.from("participant_groups").upsert(
        groups.map((group) => ({
          id: group.id,
          event_id: remoteEventId,
          name: group.name,
        })),
      );
      throwIfSupabaseError(error);
    }

    const { error: deleteMembersError } = await supabase
      .from("participant_group_members")
      .delete()
      .eq("event_id", remoteEventId);
    throwIfSupabaseError(deleteMembersError);

    const rows = groups.flatMap((group) =>
      group.participantIds.map((participantId) => ({
        participant_group_id: group.id,
        participant_id: participantId,
        event_id: remoteEventId,
      })),
    );
    if (rows.length > 0) {
      const { error } = await supabase.from("participant_group_members").insert(rows);
      throwIfSupabaseError(error);
    }
  }

  private async replaceExpenses(remoteEventId: string, expenses: Expense[]): Promise<void> {
    await deleteMissingRows("expenses", remoteEventId, expenses.map((expense) => expense.id));
    if (expenses.length > 0) {
      const { error } = await supabase.from("expenses").upsert(
        expenses.map((expense) => ({
          id: expense.id,
          event_id: remoteEventId,
          title: expense.title,
          amount_cents: expense.amountCents,
          category_id: expense.categoryId ?? null,
          note: expense.note ?? null,
          split_mode: expense.splitMode,
          expense_date: expense.date,
          date: expense.date,
        })),
      );
      throwIfSupabaseError(error);
    }

    await replaceExpenseSplitRows("expense_paid_by_splits", remoteEventId, expenses, "paidBySplits");
    await replaceExpenseSplitRows("expense_splits", remoteEventId, expenses, "splits");
  }
}

function tableFilter(table: string, remoteEventId: string) {
  return {
    event: "*",
    schema: "public",
    table,
    filter: table === "events" ? `id=eq.${remoteEventId}` : `event_id=eq.${remoteEventId}`,
  } as const;
}

async function requireUserId(): Promise<string> {
  assertConfigured();
  const { data, error } = await supabase.auth.getUser();
  throwIfSupabaseError(error);
  const userId = data.user?.id;
  if (!userId) {
    throw new Error("User is not authenticated.");
  }
  return userId;
}

function assertConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
}

function throwIfSupabaseError(error: { message: string } | null): asserts error is null {
  if (error) {
    throw new Error(error.message);
  }
}

async function deleteMissingRows(table: string, remoteEventId: string, ids: string[]): Promise<void> {
  let query = supabase.from(table).delete().eq("event_id", remoteEventId);
  if (ids.length > 0) {
    query = query.not("id", "in", `(${ids.map((id) => `"${id}"`).join(",")})`);
  }

  const { error } = await query;
  throwIfSupabaseError(error);
}

async function replaceExpenseSplitRows(
  table: "expense_paid_by_splits" | "expense_splits",
  remoteEventId: string,
  expenses: Expense[],
  key: "paidBySplits" | "splits",
): Promise<void> {
  const { error: deleteError } = await supabase.from(table).delete().eq("event_id", remoteEventId);
  throwIfSupabaseError(deleteError);

  const rows = expenses.flatMap((expense) =>
    expense[key].map((split) => ({
      expense_id: expense.id,
      participant_id: split.participantId,
      amount_cents: split.amountCents,
      event_id: remoteEventId,
    })),
  );

  if (rows.length > 0) {
    const { error } = await supabase.from(table).insert(rows);
    throwIfSupabaseError(error);
  }
}

function toDomainEvent({
  event,
  participants,
  groups,
  groupMembers,
  expenses,
  paidBySplits,
  splits,
}: {
  event: EventRow;
  participants: ParticipantRow[];
  groups: ParticipantGroupRow[];
  groupMembers: ParticipantGroupMemberRow[];
  expenses: ExpenseRow[];
  paidBySplits: ExpenseSplitRow[];
  splits: ExpenseSplitRow[];
}): Event {
  return {
    id: event.local_event_id,
    name: event.title,
    users: participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
    })),
    participantGroups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      participantIds: groupMembers
        .filter((member) => member.participant_group_id === group.id)
        .map((member) => member.participant_id),
    })),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      title: expense.title,
      amountCents: expense.amount_cents,
      categoryId: expense.category_id ?? undefined,
      note: expense.note ?? undefined,
      splitMode: expense.split_mode,
      date: expense.date,
      paidBySplits: splitRowsToDomain(paidBySplits, expense.id),
      splits: splitRowsToDomain(splits, expense.id),
    })),
  };
}

function splitRowsToDomain(rows: ExpenseSplitRow[], expenseId: string): ExpenseSplit[] {
  return rows
    .filter((row) => row.expense_id === expenseId)
    .map((row) => ({
      participantId: row.participant_id,
      amountCents: row.amount_cents,
    }));
}

function normalizePermission(permission: unknown): RemoteEventPermission {
  return permission === "owner" || permission === "editor" || permission === "viewer" ? permission : "viewer";
}

function readPresence(channel: RealtimeChannel): EventPresenceMember[] {
  return Object.values(channel.presenceState()).flatMap((states) =>
    states.map((state) => {
      const presence = state as Partial<EventPresenceMember>;
      return {
        id: presence.id ?? crypto.randomUUID(),
        email: presence.email ?? "Anonymous",
        joinedAt: presence.joinedAt ?? new Date().toISOString(),
      };
    }),
  );
}
