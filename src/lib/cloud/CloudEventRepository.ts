import type { Event, Expense, ParticipantGroup, User } from "@/domain/models";
import { buildValidatedExpense } from "@/domain/expenseValidation";
import type { ExpenseInput } from "@/domain/expenseValidation";
import { createId } from "@/lib/id";
import { RemoteEventRepository } from "@/lib/realtime";
import type { EventPresenceMember, RealtimeEventSnapshot, RemoteEventPermission } from "@/lib/realtime";
import { supabase } from "@/lib/supabase/client";

export class CloudEventRepository {
  private readonly remoteRepository = new RemoteEventRepository();

  async getEvent(eventId: string): Promise<RealtimeEventSnapshot> {
    return this.remoteRepository.loadEvent(eventId);
  }

  async createEvent(event: Event): Promise<RealtimeEventSnapshot> {
    return this.remoteRepository.ensureRemoteEvent(event);
  }

  async updateEvent(eventId: string, event: Event): Promise<void> {
    await this.remoteRepository.saveEventSnapshot(eventId, event);
  }

  async deleteEvent(eventId: string): Promise<void> {
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    throwIfSupabaseError(error);
  }

  async addParticipant(eventId: string, name: string): Promise<Event> {
    const snapshot = await this.getEvent(eventId);
    const participant: User = { id: createId("participant"), name: name.trim() };
    const event = { ...snapshot.event, users: [...snapshot.event.users, participant] };
    await this.updateEvent(eventId, event);
    return event;
  }

  async updateParticipant(eventId: string, participantId: string, name: string): Promise<Event> {
    const snapshot = await this.getEvent(eventId);
    const event = {
      ...snapshot.event,
      users: snapshot.event.users.map((participant) =>
        participant.id === participantId ? { ...participant, name: name.trim() } : participant,
      ),
    };
    await this.updateEvent(eventId, event);
    return event;
  }

  async deleteParticipant(eventId: string, participantId: string): Promise<Event> {
    const snapshot = await this.getEvent(eventId);
    const event = {
      ...snapshot.event,
      users: snapshot.event.users.filter((participant) => participant.id !== participantId),
      participantGroups: snapshot.event.participantGroups.map((group) => ({
        ...group,
        participantIds: group.participantIds.filter((id) => id !== participantId),
      })),
    };
    await this.updateEvent(eventId, event);
    return event;
  }

  async addParticipantGroup(eventId: string, name: string): Promise<Event> {
    const snapshot = await this.getEvent(eventId);
    const group: ParticipantGroup = { id: createId("participant-group"), name: name.trim(), participantIds: [] };
    const event = { ...snapshot.event, participantGroups: [...snapshot.event.participantGroups, group] };
    await this.updateEvent(eventId, event);
    return event;
  }

  async updateParticipantGroup(eventId: string, groupId: string, name: string): Promise<Event> {
    const snapshot = await this.getEvent(eventId);
    const event = {
      ...snapshot.event,
      participantGroups: snapshot.event.participantGroups.map((group) =>
        group.id === groupId ? { ...group, name: name.trim() } : group,
      ),
    };
    await this.updateEvent(eventId, event);
    return event;
  }

  async deleteParticipantGroup(eventId: string, groupId: string): Promise<Event> {
    const snapshot = await this.getEvent(eventId);
    const event = {
      ...snapshot.event,
      participantGroups: snapshot.event.participantGroups.filter((group) => group.id !== groupId),
    };
    await this.updateEvent(eventId, event);
    return event;
  }

  async addExpense(eventId: string, input: ExpenseInput): Promise<Event> {
    const snapshot = await this.getEvent(eventId);
    const result = buildValidatedExpense(snapshot.event, createId("expense"), input);
    if (!result.ok) {
      throw new Error(result.error);
    }

    const event = { ...snapshot.event, expenses: [result.expense, ...snapshot.event.expenses] };
    await this.updateEvent(eventId, event);
    return event;
  }

  async updateExpense(eventId: string, expenseId: string, input: ExpenseInput): Promise<Event> {
    const snapshot = await this.getEvent(eventId);
    const result = buildValidatedExpense(snapshot.event, expenseId, input);
    if (!result.ok) {
      throw new Error(result.error);
    }

    const event = {
      ...snapshot.event,
      expenses: snapshot.event.expenses.map((expense) => (expense.id === expenseId ? result.expense : expense)),
    };
    await this.updateEvent(eventId, event);
    return event;
  }

  async deleteExpense(eventId: string, expenseId: string): Promise<Event> {
    const snapshot = await this.getEvent(eventId);
    const event = {
      ...snapshot.event,
      expenses: snapshot.event.expenses.filter((expense: Expense) => expense.id !== expenseId),
    };
    await this.updateEvent(eventId, event);
    return event;
  }

  subscribeToEvent(input: {
    remoteEventId: string;
    onEventUpdated: () => void;
    onPresenceChanged: (members: EventPresenceMember[]) => void;
    onError: (message: string) => void;
  }): { unsubscribe: () => void } {
    return this.remoteRepository.subscribeToEvent(input);
  }
}

export type { EventPresenceMember, RealtimeEventSnapshot, RemoteEventPermission };

function throwIfSupabaseError(error: { message: string } | null): asserts error is null {
  if (error) {
    throw new Error(error.message);
  }
}
