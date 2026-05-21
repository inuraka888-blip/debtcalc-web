"use client";

import { create } from "zustand";
import { calculateBalances, calculateDebts } from "@/domain/balanceCalculator";
import type { BalanceMap } from "@/domain/balanceCalculator";
import { mergeDefaultCategories } from "@/domain/categories";
import { buildValidatedExpense } from "@/domain/expenseValidation";
import type { ExpenseInput, ExpenseValidationError } from "@/domain/expenseValidation";
import { CURRENT_APP_STATE_VERSION } from "@/domain/migrations";
import {
  getCurrentUser,
  onAuthStateChange,
  signInWithMagicLink,
  signOut as signOutFromSupabase,
} from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  Debt,
  Event,
  EventId,
  Expense,
  ExpenseCategory,
  ExpenseId,
  ParticipantGroupId,
  Reminder,
  UserId,
} from "@/domain/models";
import { createId } from "@/lib/id";
import type { CollaborativeEventLink, EventPresenceMember, RemoteEventPermission } from "@/lib/realtime";
import { appStorageAdapter, SupabaseStorageAdapter } from "@/lib/storage";
import type { AppState, SyncStatus } from "@/lib/storage";

export type ParticipantMutationError =
  | "eventNotFound"
  | "participantNotFound"
  | "participantNameEmpty"
  | "participantAlreadyExists"
  | "participantInUse";

export type ParticipantMutationResult =
  | { ok: true; participantId?: UserId }
  | { ok: false; error: ParticipantMutationError };

export type ParticipantGroupMutationError =
  | "eventNotFound"
  | "participantNotFound"
  | "participantGroupNotFound"
  | "participantGroupNameEmpty"
  | "participantGroupAlreadyExists";

export type ParticipantGroupMutationResult =
  | { ok: true }
  | { ok: false; error: ParticipantGroupMutationError };

export type ExpenseMutationError = ExpenseValidationError;

export type ExpenseMutationResult =
  | { ok: true }
  | { ok: false; error: ExpenseMutationError };

export type CategoryMutationError =
  | "categoryNotFound"
  | "categoryNameEmpty"
  | "categoryAlreadyExists"
  | "categoryInUse";

export type CategoryMutationResult =
  | { ok: true }
  | { ok: false; error: CategoryMutationError };

export type EventMutationError =
  | "eventNotFound"
  | "eventNameEmpty"
  | "eventAlreadyExists";

export type EventMutationResult =
  | { ok: true }
  | { ok: false; error: EventMutationError };

export type ReminderMutationError =
  | "eventNotFound"
  | "reminderNotFound"
  | "reminderTitleEmpty"
  | "reminderDateInPast";

export type ReminderMutationResult =
  | { ok: true }
  | { ok: false; error: ReminderMutationError };

export interface ReminderInput {
  eventId: EventId;
  expenseId?: ExpenseId;
  title: string;
  message?: string;
  remindAt: string;
}

export interface AuthUser {
  id: string;
  email?: string;
}

export type AuthStatus = "unknown" | "signedOut" | "signedIn" | "error";

interface EventsState {
  events: Event[];
  categories: ExpenseCategory[];
  reminders: Reminder[];
  activeEventId?: EventId;
  authUser?: AuthUser;
  authStatus: AuthStatus;
  authError?: string;
  syncStatus: SyncStatus;
  syncError?: string;
  lastSyncedAt?: string;
  collaborativeEvents: Record<EventId, CollaborativeEventLink>;
  realtimeMembers: Record<EventId, EventPresenceMember[]>;
  isStorageLoaded: boolean;
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  resetStorage: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  signIn: (email: string, redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncToCloud: () => Promise<void>;
  loadFromCloud: () => Promise<boolean>;
  clearCloudState: () => Promise<void>;
  addEvent: (name: string) => void;
  updateEvent: (eventId: EventId, name: string) => EventMutationResult;
  deleteEvent: (eventId: EventId) => EventMutationResult;
  setActiveEvent: (eventId: EventId) => void;
  addParticipant: (eventId: EventId, name: string) => ParticipantMutationResult;
  updateParticipant: (eventId: EventId, participantId: UserId, name: string) => ParticipantMutationResult;
  removeParticipant: (eventId: EventId, participantId: UserId) => ParticipantMutationResult;
  addParticipantGroup: (eventId: EventId, name: string) => ParticipantGroupMutationResult;
  updateParticipantGroup: (
    eventId: EventId,
    groupId: ParticipantGroupId,
    name: string,
  ) => ParticipantGroupMutationResult;
  deleteParticipantGroup: (eventId: EventId, groupId: ParticipantGroupId) => ParticipantGroupMutationResult;
  moveParticipantToGroup: (
    eventId: EventId,
    participantId: UserId,
    groupId: ParticipantGroupId,
  ) => ParticipantGroupMutationResult;
  moveParticipantToIndividuals: (eventId: EventId, participantId: UserId) => ParticipantGroupMutationResult;
  addExpense: (eventId: EventId, expenseInput: ExpenseInput) => ExpenseMutationResult;
  updateExpense: (
    eventId: EventId,
    expenseId: ExpenseId,
    expenseInput: ExpenseInput,
  ) => ExpenseMutationResult;
  deleteExpense: (eventId: EventId, expenseId: ExpenseId) => ExpenseMutationResult;
  importEvent: (event: Event, categories: ExpenseCategory[]) => void;
  saveSharedEventCopy: (event: Event) => EventId;
  connectRealtimeEvent: (
    eventId: EventId,
    remoteEventId: string,
    permission: RemoteEventPermission,
  ) => void;
  applyRemoteEvent: (
    event: Event,
    permission: RemoteEventPermission,
    remoteEventId: string,
  ) => void;
  setRealtimeMembers: (eventId: EventId, members: EventPresenceMember[]) => void;
  setSyncState: (syncStatus: SyncStatus, syncError?: string) => void;
  addReminder: (input: ReminderInput) => ReminderMutationResult;
  updateReminder: (
    id: string,
    updates: Partial<Omit<ReminderInput, "eventId"> & { status: Reminder["status"] }>,
  ) => ReminderMutationResult;
  deleteReminder: (id: string) => ReminderMutationResult;
  markReminderSent: (id: string) => ReminderMutationResult;
  getUpcomingReminders: (eventId?: EventId) => Reminder[];
  importExpenses: (eventId: EventId, expenses: Expense[]) => ExpenseMutationResult;
  addCategory: (name: string, icon: string) => CategoryMutationResult;
  updateCategory: (
    categoryId: string,
    updates: Partial<Pick<ExpenseCategory, "name" | "icon">>,
  ) => CategoryMutationResult;
  deleteCategory: (categoryId: string) => CategoryMutationResult;
  replaceLocalData: (input: {
    events: Event[];
    categories: ExpenseCategory[];
    reminders?: Reminder[];
    activeEventId?: EventId;
  }) => void;
  resetLocalData: () => void;
  ensureSeedData: () => void;
  getActiveEvent: () => Event | undefined;
  getBalances: (eventId: EventId) => BalanceMap;
  getDebts: (eventId: EventId) => Debt[];
}

export const useEventsStore = create<EventsState>()(
    (set, get) => ({
      events: [],
      categories: mergeDefaultCategories([]),
      reminders: [],
      activeEventId: undefined,
      authUser: undefined,
      authStatus: "unknown",
      authError: undefined,
      syncStatus: "idle",
      syncError: undefined,
      lastSyncedAt: undefined,
      collaborativeEvents: {},
      realtimeMembers: {},
      isStorageLoaded: false,

      initializeAuth: async () => {
        if (!isSupabaseConfigured()) {
          set({ authUser: undefined, authStatus: "signedOut", authError: undefined });
          return;
        }

        try {
          const user = await getCurrentUser();
          set({
            authUser: user ? { id: user.id, email: user.email } : undefined,
            authStatus: user ? "signedIn" : "signedOut",
            authError: undefined,
          });
        } catch (error) {
          set({
            authUser: undefined,
            authStatus: "error",
            authError: error instanceof Error ? error.message : "Failed to initialize auth.",
          });
        }

        ensureAuthSubscription(set);
      },

      signIn: async (email, redirectTo) => {
        if (!isSupabaseConfigured()) {
          set({
            authStatus: "error",
            authError: "Supabase is not configured.",
          });
          return;
        }

        try {
          await signInWithMagicLink(email.trim(), redirectTo);
          set({ authError: undefined });
        } catch (error) {
          set({
            authStatus: "error",
            authError: error instanceof Error ? error.message : "Failed to send magic link.",
          });
        }
      },

      signOut: async () => {
        try {
          await signOutFromSupabase();
          set({ authUser: undefined, authStatus: "signedOut", authError: undefined });
        } catch (error) {
          set({
            authStatus: "error",
            authError: error instanceof Error ? error.message : "Failed to sign out.",
          });
        }
      },

      loadFromStorage: async () => {
        if (get().isStorageLoaded) {
          return;
        }

        set({ syncStatus: "syncing", syncError: undefined });
        try {
          const appState = await appStorageAdapter.loadState();
          if (appState) {
            const normalizedEvents = appState.events.map(normalizeEvent);
            const activeEventId =
              appState.settings.activeEventId &&
              normalizedEvents.some((event) => event.id === appState.settings.activeEventId)
                ? appState.settings.activeEventId
                : normalizedEvents[0]?.id;

            set({
              events: normalizedEvents,
              categories: mergeDefaultCategories(appState.categories),
              reminders: normalizeReminders(appState.reminders ?? [], normalizedEvents),
              activeEventId,
              collaborativeEvents: appState.settings.collaborativeEvents ?? {},
              isStorageLoaded: true,
              syncStatus: "idle",
              syncError: undefined,
            });
            return;
          }

          set({
            categories: mergeDefaultCategories([]),
            reminders: [],
            isStorageLoaded: true,
            syncStatus: "idle",
            syncError: undefined,
          });
        } catch (error) {
          set({
            isStorageLoaded: true,
            syncStatus: "error",
            syncError: error instanceof Error ? error.message : "Failed to load local data.",
          });
        }
      },

      saveToStorage: async () => {
        try {
          await appStorageAdapter.saveState(selectAppState(get()));
          set({ syncStatus: "idle", syncError: undefined });
        } catch (error) {
          set({
            syncStatus: "error",
            syncError: error instanceof Error ? error.message : "Failed to save local data.",
          });
        }
      },

      resetStorage: async () => {
        try {
          await appStorageAdapter.clearState();
          set({
            events: [],
            categories: mergeDefaultCategories([]),
            reminders: [],
            activeEventId: undefined,
            collaborativeEvents: {},
            realtimeMembers: {},
            syncStatus: "idle",
            syncError: undefined,
            lastSyncedAt: undefined,
          });
        } catch (error) {
          set({
            syncStatus: "error",
            syncError: error instanceof Error ? error.message : "Failed to reset local data.",
          });
        }
      },

      syncToCloud: async () => {
        set({ syncStatus: "syncing", syncError: undefined });
        try {
          await new SupabaseStorageAdapter().saveState(selectAppState(get()));
          set({
            syncStatus: "synced",
            syncError: undefined,
            lastSyncedAt: new Date().toISOString(),
          });
        } catch (error) {
          set({
            syncStatus: "error",
            syncError: error instanceof Error ? error.message : "Failed to upload local data.",
          });
        }
      },

      loadFromCloud: async () => {
        set({ syncStatus: "syncing", syncError: undefined });
        try {
          const appState = await new SupabaseStorageAdapter().loadState();
          if (!appState) {
            set({
              syncStatus: "synced",
              syncError: undefined,
              lastSyncedAt: new Date().toISOString(),
            });
            return false;
          }

          const normalizedEvents = appState.events.map(normalizeEvent);
          const activeEventId =
            appState.settings.activeEventId &&
            normalizedEvents.some((event) => event.id === appState.settings.activeEventId)
              ? appState.settings.activeEventId
              : normalizedEvents[0]?.id;

          set({
            events: normalizedEvents,
            categories: mergeDefaultCategories(appState.categories),
            reminders: normalizeReminders(appState.reminders ?? [], normalizedEvents),
            activeEventId,
            collaborativeEvents: appState.settings.collaborativeEvents ?? {},
            realtimeMembers: {},
            isStorageLoaded: true,
            syncStatus: "synced",
            syncError: undefined,
            lastSyncedAt: new Date().toISOString(),
          });
          return true;
        } catch (error) {
          set({
            syncStatus: "error",
            syncError: error instanceof Error ? error.message : "Failed to download cloud data.",
          });
          return false;
        }
      },

      clearCloudState: async () => {
        set({ syncStatus: "syncing", syncError: undefined });
        try {
          await new SupabaseStorageAdapter().clearState();
          set({
            syncStatus: "synced",
            syncError: undefined,
            lastSyncedAt: new Date().toISOString(),
          });
        } catch (error) {
          set({
            syncStatus: "error",
            syncError: error instanceof Error ? error.message : "Failed to clear cloud data.",
          });
        }
      },

      addEvent: (name) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return;
        }

        if (hasEventName(get().events, trimmedName)) {
          return;
        }

        const event: Event = {
          id: createId("event"),
          name: trimmedName,
          users: [],
          participantGroups: [],
          expenses: [],
        };

        set((state) => ({
          events: [event, ...state.events],
          activeEventId: event.id,
        }));
      },

      updateEvent: (eventId, name) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return { ok: false, error: "eventNameEmpty" };
        }

        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (hasEventName(get().events, trimmedName, eventId)) {
          return { ok: false, error: "eventAlreadyExists" };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId ? { ...candidate, name: trimmedName } : candidate,
          ),
        }));

        return { ok: true };
      },

      deleteEvent: (eventId) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        set((state) => {
          const events = state.events.filter((candidate) => candidate.id !== eventId);
          return {
            events,
            reminders: state.reminders.filter((reminder) => reminder.eventId !== eventId),
            activeEventId: state.activeEventId === eventId ? events[0]?.id : state.activeEventId,
          };
        });

        return { ok: true };
      },

      setActiveEvent: (eventId) => {
        set({ activeEventId: eventId });
      },

      addParticipant: (eventId, name) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return { ok: false, error: "participantNameEmpty" };
        }

        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (hasParticipantName(event, trimmedName)) {
          return { ok: false, error: "participantAlreadyExists" };
        }

        const participantId = createId("participant");

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  users: [...candidate.users, { id: participantId, name: trimmedName }],
                }
              : candidate,
          ),
        }));

        return { ok: true, participantId };
      },

      updateParticipant: (eventId, participantId, name) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return { ok: false, error: "participantNameEmpty" };
        }

        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (!event.users.some((participant) => participant.id === participantId)) {
          return { ok: false, error: "participantNotFound" };
        }

        if (hasParticipantName(event, trimmedName, participantId)) {
          return { ok: false, error: "participantAlreadyExists" };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  users: candidate.users.map((participant) =>
                    participant.id === participantId ? { ...participant, name: trimmedName } : participant,
                  ),
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      removeParticipant: (eventId, participantId) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (!event.users.some((participant) => participant.id === participantId)) {
          return { ok: false, error: "participantNotFound" };
        }

        const isUsedInExpenses = event.expenses.some(
          (expense) =>
            expense.paidBySplits.some((split) => split.participantId === participantId) ||
            expense.splits.some((split) => split.participantId === participantId),
        );

        if (isUsedInExpenses) {
          return { ok: false, error: "participantInUse" };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  users: candidate.users.filter((participant) => participant.id !== participantId),
                  participantGroups: candidate.participantGroups.map((participantGroup) => ({
                    ...participantGroup,
                    participantIds: participantGroup.participantIds.filter((id) => id !== participantId),
                  })),
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      addParticipantGroup: (eventId, name) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return { ok: false, error: "participantGroupNameEmpty" };
        }

        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (hasParticipantGroupName(event, trimmedName)) {
          return { ok: false, error: "participantGroupAlreadyExists" };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  participantGroups: [
                    ...candidate.participantGroups,
                    { id: createId("participant-group"), name: trimmedName, participantIds: [] },
                  ],
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      updateParticipantGroup: (eventId, groupId, name) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return { ok: false, error: "participantGroupNameEmpty" };
        }

        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (!event.participantGroups.some((participantGroup) => participantGroup.id === groupId)) {
          return { ok: false, error: "participantGroupNotFound" };
        }

        if (hasParticipantGroupName(event, trimmedName, groupId)) {
          return { ok: false, error: "participantGroupAlreadyExists" };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  participantGroups: candidate.participantGroups.map((participantGroup) =>
                    participantGroup.id === groupId ? { ...participantGroup, name: trimmedName } : participantGroup,
                  ),
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      deleteParticipantGroup: (eventId, groupId) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (!event.participantGroups.some((participantGroup) => participantGroup.id === groupId)) {
          return { ok: false, error: "participantGroupNotFound" };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  participantGroups: candidate.participantGroups.filter(
                    (participantGroup) => participantGroup.id !== groupId,
                  ),
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      moveParticipantToGroup: (eventId, participantId, groupId) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (!event.users.some((participant) => participant.id === participantId)) {
          return { ok: false, error: "participantNotFound" };
        }

        if (!event.participantGroups.some((participantGroup) => participantGroup.id === groupId)) {
          return { ok: false, error: "participantGroupNotFound" };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  participantGroups: candidate.participantGroups.map((participantGroup) => {
                    const participantIds = participantGroup.participantIds.filter((id) => id !== participantId);
                    return participantGroup.id === groupId
                      ? { ...participantGroup, participantIds: [...participantIds, participantId] }
                      : { ...participantGroup, participantIds };
                  }),
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      moveParticipantToIndividuals: (eventId, participantId) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (!event.users.some((participant) => participant.id === participantId)) {
          return { ok: false, error: "participantNotFound" };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  participantGroups: candidate.participantGroups.map((participantGroup) => ({
                    ...participantGroup,
                    participantIds: participantGroup.participantIds.filter((id) => id !== participantId),
                  })),
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      addExpense: (eventId, expenseInput) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        const result = buildValidatedExpense(event, createId("expense"), expenseInput);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  expenses: [result.expense, ...candidate.expenses],
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      updateExpense: (eventId, expenseId, expenseInput) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (!event.expenses.some((expense) => expense.id === expenseId)) {
          return { ok: false, error: "expenseNotFound" };
        }

        const result = buildValidatedExpense(event, expenseId, expenseInput);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  expenses: candidate.expenses.map((expense) =>
                    expense.id === expenseId ? result.expense : expense,
                  ),
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      deleteExpense: (eventId, expenseId) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        if (!event.expenses.some((expense) => expense.id === expenseId)) {
          return { ok: false, error: "expenseNotFound" };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  expenses: candidate.expenses.filter((expense) => expense.id !== expenseId),
                }
              : candidate,
          ),
          reminders: state.reminders.map((reminder) =>
            reminder.expenseId === expenseId ? { ...reminder, expenseId: undefined } : reminder,
          ),
        }));

        return { ok: true };
      },

      importEvent: (event, importedCategories) => {
        const normalizedImportedEvent = normalizeEvent(event);
        set((state) => ({
          events: [
            normalizedImportedEvent,
            ...state.events.filter((candidate) => candidate.id !== normalizedImportedEvent.id),
          ],
          categories: mergeCategoriesById(state.categories, importedCategories),
          activeEventId: normalizedImportedEvent.id,
        }));
      },

      saveSharedEventCopy: (event) => {
        const normalizedEvent = normalizeEvent(event);
        const eventId = createId("event");
        const copiedEvent: Event = {
          ...normalizedEvent,
          id: eventId,
          name: nextCopyEventName(get().events, normalizedEvent.name),
        };

        set((state) => ({
          events: [copiedEvent, ...state.events],
          activeEventId: copiedEvent.id,
        }));

        return copiedEvent.id;
      },

      connectRealtimeEvent: (eventId, remoteEventId, permission) => {
        set((state) => ({
          collaborativeEvents: {
            ...state.collaborativeEvents,
            [eventId]: { remoteEventId, permission },
          },
          syncStatus: "synced",
          syncError: undefined,
        }));
      },

      applyRemoteEvent: (event, permission, remoteEventId) => {
        const normalizedEvent = normalizeEvent(event);
        set((state) => ({
          events: state.events.some((candidate) => candidate.id === normalizedEvent.id)
            ? state.events.map((candidate) => (candidate.id === normalizedEvent.id ? normalizedEvent : candidate))
            : [normalizedEvent, ...state.events],
          activeEventId: state.activeEventId ?? normalizedEvent.id,
          collaborativeEvents: {
            ...state.collaborativeEvents,
            [normalizedEvent.id]: { remoteEventId, permission },
          },
          syncStatus: "synced",
          syncError: undefined,
        }));
      },

      setRealtimeMembers: (eventId, members) => {
        set((state) => ({
          realtimeMembers: {
            ...state.realtimeMembers,
            [eventId]: members,
          },
        }));
      },

      setSyncState: (syncStatus, syncError) => {
        set({ syncStatus, syncError });
      },

      addReminder: (input) => {
        const result = buildReminder(input, get().events);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }

        set((state) => ({
          reminders: [...state.reminders, result.reminder],
        }));
        return { ok: true };
      },

      updateReminder: (id, updates) => {
        const reminder = get().reminders.find((candidate) => candidate.id === id);
        if (!reminder) {
          return { ok: false, error: "reminderNotFound" };
        }

        const result = buildReminder(
          {
            eventId: reminder.eventId,
            expenseId: updates.expenseId ?? reminder.expenseId,
            title: updates.title ?? reminder.title,
            message: updates.message ?? reminder.message,
            remindAt: updates.remindAt ?? reminder.remindAt,
          },
          get().events,
          reminder,
          updates.status,
        );
        if (!result.ok) {
          return { ok: false, error: result.error };
        }

        set((state) => ({
          reminders: state.reminders.map((candidate) => (candidate.id === id ? result.reminder : candidate)),
        }));
        return { ok: true };
      },

      deleteReminder: (id) => {
        if (!get().reminders.some((reminder) => reminder.id === id)) {
          return { ok: false, error: "reminderNotFound" };
        }

        set((state) => ({
          reminders: state.reminders.filter((reminder) => reminder.id !== id),
        }));
        return { ok: true };
      },

      markReminderSent: (id) => {
        if (!get().reminders.some((reminder) => reminder.id === id)) {
          return { ok: false, error: "reminderNotFound" };
        }

        set((state) => ({
          reminders: state.reminders.map((reminder) =>
            reminder.id === id ? { ...reminder, status: "sent" } : reminder,
          ),
        }));
        return { ok: true };
      },

      getUpcomingReminders: (eventId) =>
        get()
          .reminders.filter(
            (reminder) => reminder.status === "scheduled" && (!eventId || reminder.eventId === eventId),
          )
          .sort((left, right) => left.remindAt.localeCompare(right.remindAt)),

      importExpenses: (eventId, expenses) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event) {
          return { ok: false, error: "eventNotFound" };
        }

        set((state) => ({
          events: state.events.map((candidate) =>
            candidate.id === eventId
              ? {
                  ...candidate,
                  expenses: [
                    ...expenses,
                    ...candidate.expenses.filter(
                      (expense) => !expenses.some((importedExpense) => importedExpense.id === expense.id),
                    ),
                  ],
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      addCategory: (name, icon) => {
        const trimmedName = name.trim();
        const trimmedIcon = icon.trim() || "◼️";
        if (!trimmedName) {
          return { ok: false, error: "categoryNameEmpty" };
        }

        if (hasCategoryName(get().categories, trimmedName)) {
          return { ok: false, error: "categoryAlreadyExists" };
        }

        set((state) => ({
          categories: [
            ...state.categories,
            {
              id: createId("category"),
              name: trimmedName,
              icon: trimmedIcon,
            },
          ],
        }));

        return { ok: true };
      },

      updateCategory: (categoryId, updates) => {
        const category = get().categories.find((candidate) => candidate.id === categoryId);
        if (!category) {
          return { ok: false, error: "categoryNotFound" };
        }

        const nextName = updates.name === undefined ? category.name : updates.name.trim();
        const nextIcon = updates.icon === undefined ? category.icon : updates.icon.trim() || "◼️";
        if (!nextName) {
          return { ok: false, error: "categoryNameEmpty" };
        }

        if (hasCategoryName(get().categories, nextName, categoryId)) {
          return { ok: false, error: "categoryAlreadyExists" };
        }

        set((state) => ({
          categories: state.categories.map((candidate) =>
            candidate.id === categoryId
              ? {
                  ...candidate,
                  name: nextName,
                  icon: nextIcon,
                }
              : candidate,
          ),
        }));

        return { ok: true };
      },

      deleteCategory: (categoryId) => {
        const category = get().categories.find((candidate) => candidate.id === categoryId);
        if (!category) {
          return { ok: false, error: "categoryNotFound" };
        }

        const isUsed = get().events.some((event) =>
          event.expenses.some((expense) => expense.categoryId === categoryId),
        );
        if (isUsed) {
          return { ok: false, error: "categoryInUse" };
        }

        set((state) => ({
          categories: state.categories.filter((candidate) => candidate.id !== categoryId),
        }));

        return { ok: true };
      },

      replaceLocalData: ({ events, categories, reminders, activeEventId }) => {
        const normalizedEvents = events.map(normalizeEvent);
        const nextActiveEventId =
          activeEventId && normalizedEvents.some((event) => event.id === activeEventId)
            ? activeEventId
            : normalizedEvents[0]?.id;

        set({
          events: normalizedEvents,
          categories: mergeDefaultCategories(categories),
          reminders: normalizeReminders(reminders ?? [], normalizedEvents),
          activeEventId: nextActiveEventId,
          collaborativeEvents: {},
          realtimeMembers: {},
        });
      },

      resetLocalData: () => {
        set({
          events: [],
          categories: mergeDefaultCategories([]),
          reminders: [],
          activeEventId: undefined,
          collaborativeEvents: {},
          realtimeMembers: {},
        });
      },

      ensureSeedData: () => {
        const state = get();
        const categories = mergeDefaultCategories(state.categories);
        if (categories.length !== state.categories.length) {
          set({ categories });
        }
      },

      getActiveEvent: () => {
        const state = get();
        const event = state.events.find((candidate) => candidate.id === state.activeEventId) ?? state.events[0];
        return event ? normalizeEvent(event) : undefined;
      },

      getBalances: (eventId) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        return event ? calculateBalances(normalizeEvent(event)) : {};
      },

      getDebts: (eventId) => {
        const event = get().events.find((candidate) => candidate.id === eventId);
        return event ? calculateDebts(normalizeEvent(event)) : [];
      },
    }),
);

let isAuthSubscriptionInitialized = false;

function ensureAuthSubscription(set: (partial: Partial<EventsState>) => void): void {
  if (isAuthSubscriptionInitialized) {
    return;
  }

  isAuthSubscriptionInitialized = true;
  onAuthStateChange((_event, session) => {
    set({
      authUser: session?.user ? { id: session.user.id, email: session.user.email } : undefined,
      authStatus: session?.user ? "signedIn" : "signedOut",
      authError: undefined,
    });
  });
}

let lastPersistedAppState = "";

useEventsStore.subscribe((state) => {
  if (!state.isStorageLoaded) {
    return;
  }

  const appState = selectAppState(state);
  const serializedAppState = JSON.stringify(appState);
  if (serializedAppState === lastPersistedAppState) {
    return;
  }

  lastPersistedAppState = serializedAppState;
  void appStorageAdapter.saveState(appState).catch((error) => {
    useEventsStore.setState({
      syncStatus: "error",
      syncError: error instanceof Error ? error.message : "Failed to save local data.",
    });
  });
});

function selectAppState(
  state: Pick<EventsState, "events" | "categories" | "reminders" | "activeEventId" | "collaborativeEvents">,
): AppState {
  return {
    version: CURRENT_APP_STATE_VERSION,
    events: state.events,
    categories: state.categories,
    reminders: state.reminders,
    settings: {
      activeEventId: state.activeEventId,
      collaborativeEvents: state.collaborativeEvents,
    },
  };
}

function hasParticipantName(event: Event, name: string, excludingParticipantId?: UserId): boolean {
  const normalizedCandidate = normalizeName(name);
  return event.users.some(
    (participant) =>
      participant.id !== excludingParticipantId && normalizeName(participant.name) === normalizedCandidate,
  );
}

function hasEventName(events: Event[], name: string, excludingEventId?: EventId): boolean {
  const normalizedCandidate = normalizeName(name);
  return events.some(
    (event) => event.id !== excludingEventId && normalizeName(event.name) === normalizedCandidate,
  );
}

function nextCopyEventName(events: Event[], name: string): string {
  if (!hasEventName(events, name)) {
    return name;
  }

  let index = 2;
  let candidate = `${name} (${index})`;
  while (hasEventName(events, candidate)) {
    index += 1;
    candidate = `${name} (${index})`;
  }

  return candidate;
}

function hasParticipantGroupName(
  event: Event,
  name: string,
  excludingGroupId?: ParticipantGroupId,
): boolean {
  const normalizedCandidate = normalizeName(name);
  return event.participantGroups.some(
    (participantGroup) =>
      participantGroup.id !== excludingGroupId && normalizeName(participantGroup.name) === normalizedCandidate,
  );
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function hasCategoryName(categories: ExpenseCategory[], name: string, excludingCategoryId?: string): boolean {
  const normalizedCandidate = normalizeName(name);
  return categories.some(
    (category) => category.id !== excludingCategoryId && normalizeName(category.name) === normalizedCandidate,
  );
}

function mergeCategoriesById(
  existingCategories: ExpenseCategory[],
  importedCategories: ExpenseCategory[],
): ExpenseCategory[] {
  const importedIds = new Set(importedCategories.map((category) => category.id));
  return mergeDefaultCategories([
    ...importedCategories,
    ...existingCategories.filter((category) => !importedIds.has(category.id)),
  ]);
}

function buildReminder(
  input: ReminderInput,
  events: Event[],
  existingReminder?: Reminder,
  status: Reminder["status"] = existingReminder?.status ?? "scheduled",
):
  | { ok: true; reminder: Reminder }
  | { ok: false; error: ReminderMutationError } {
  const event = events.find((candidate) => candidate.id === input.eventId);
  if (!event) {
    return { ok: false, error: "eventNotFound" };
  }

  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "reminderTitleEmpty" };
  }

  const remindAtDate = new Date(input.remindAt);
  if (Number.isNaN(remindAtDate.getTime()) || (status === "scheduled" && remindAtDate.getTime() <= Date.now())) {
    return { ok: false, error: "reminderDateInPast" };
  }

  const expenseId =
    input.expenseId && event.expenses.some((expense) => expense.id === input.expenseId)
      ? input.expenseId
      : undefined;

  return {
    ok: true,
    reminder: {
      id: existingReminder?.id ?? createId("reminder"),
      eventId: input.eventId,
      expenseId,
      title,
      message: input.message?.trim() || undefined,
      remindAt: remindAtDate.toISOString(),
      status,
      createdAt: existingReminder?.createdAt ?? new Date().toISOString(),
    },
  };
}

function normalizeReminders(reminders: Reminder[], events: Event[]): Reminder[] {
  const eventIds = new Set(events.map((event) => event.id));
  const expenseIds = new Set(events.flatMap((event) => event.expenses.map((expense) => expense.id)));
  return reminders
    .filter(
      (reminder) =>
        eventIds.has(reminder.eventId) &&
        reminder.title.trim() &&
        !Number.isNaN(new Date(reminder.remindAt).getTime()) &&
        (reminder.status === "scheduled" || reminder.status === "sent" || reminder.status === "cancelled"),
    )
    .map((reminder) => ({
      ...reminder,
      expenseId: reminder.expenseId && expenseIds.has(reminder.expenseId) ? reminder.expenseId : undefined,
    }));
}

type LegacyEvent = Omit<Event, "participantGroups"> & {
  participantGroups: Array<{
    id: ParticipantGroupId;
    name: string;
    participantIds?: UserId[];
    userIds?: UserId[];
  }>;
  expenses: LegacyExpense[];
};

type LegacyExpense = Omit<Expense, "paidBySplits" | "splits"> & {
  paidBySplits: LegacyExpenseSplit[];
  splits: LegacyExpenseSplit[];
};

type LegacyExpenseSplit = {
  participantId?: UserId;
  userId?: UserId;
  amountCents: number;
};

function normalizeEvent(event: LegacyEvent): Event {
  const validParticipantIds = new Set(event.users.map((participant) => participant.id));
  const assignedParticipantIds = new Set<UserId>();

  return {
    ...event,
    expenses: (event.expenses ?? []).map(normalizeExpense),
    participantGroups: (event.participantGroups ?? []).map((participantGroup) => {
      const rawParticipantIds = participantGroup.participantIds ?? participantGroup.userIds ?? [];
      const participantIds = rawParticipantIds.filter((participantId) => {
        if (!validParticipantIds.has(participantId) || assignedParticipantIds.has(participantId)) {
          return false;
        }

        assignedParticipantIds.add(participantId);
        return true;
      });

      return {
        id: participantGroup.id,
        name: participantGroup.name,
        participantIds,
      };
    }),
  };
}

function normalizeExpense(expense: LegacyExpense): Expense {
  return {
    ...expense,
    paidBySplits: expense.paidBySplits.map(normalizeExpenseSplit),
    splits: expense.splits.map(normalizeExpenseSplit),
  };
}

function normalizeExpenseSplit(split: LegacyExpenseSplit) {
  return {
    participantId: split.participantId ?? split.userId ?? "",
    amountCents: split.amountCents,
  };
}
