"use client";

import { FormEvent, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { categoryOrOther } from "@/domain/categories";
import { exportEventToCSV, importExpensesFromCSV } from "@/domain/csv";
import { aggregateDebtsByParticipantGroups, aggregateParticipantName } from "@/domain/debtAggregation";
import {
  defaultExpenseFilters,
  getVisibleExpenses,
  hasActiveExpenseFilters,
} from "@/domain/expenseVisibility";
import type { ExpenseFilters, ExpenseSortOption } from "@/domain/expenseVisibility";
import type { Expense, ExpenseCategory, ParticipantGroupId, Reminder, User, UserId } from "@/domain/models";
import { formatMoney } from "@/domain/money";
import { Link } from "@/i18n/routing";
import { useRealtimeEvent } from "@/lib/realtime";
import { createEventShare } from "@/lib/supabase/sharedEvents";
import type { SharePermission } from "@/lib/supabase/sharedEvents";
import { ExpenseForm } from "./ExpenseForm";
import { useEventsStore } from "@/store/eventsStore";
import type {
  ExpenseMutationError,
  ParticipantGroupMutationError,
  ParticipantMutationError,
  ReminderMutationError,
} from "@/store/eventsStore";

interface EventDetailScreenProps {
  eventId: string;
}

const EMPTY_REALTIME_MEMBERS: [] = [];

export function EventDetailScreen({ eventId }: EventDetailScreenProps) {
  const t = useTranslations("eventDetail");
  const commonT = useTranslations("common");
  const expenseT = useTranslations("expenses");
  const errorsT = useTranslations("errors");
  const locale = useLocale();
  const events = useEventsStore((state) => state.events);
  const categories = useEventsStore((state) => state.categories);
  const loadFromStorage = useEventsStore((state) => state.loadFromStorage);
  const ensureSeedData = useEventsStore((state) => state.ensureSeedData);
  const setActiveEvent = useEventsStore((state) => state.setActiveEvent);
  const addParticipant = useEventsStore((state) => state.addParticipant);
  const updateParticipant = useEventsStore((state) => state.updateParticipant);
  const removeParticipant = useEventsStore((state) => state.removeParticipant);
  const addParticipantGroup = useEventsStore((state) => state.addParticipantGroup);
  const updateParticipantGroup = useEventsStore((state) => state.updateParticipantGroup);
  const deleteParticipantGroup = useEventsStore((state) => state.deleteParticipantGroup);
  const moveParticipantToGroup = useEventsStore((state) => state.moveParticipantToGroup);
  const moveParticipantToIndividuals = useEventsStore((state) => state.moveParticipantToIndividuals);
  const addExpense = useEventsStore((state) => state.addExpense);
  const updateExpense = useEventsStore((state) => state.updateExpense);
  const deleteExpense = useEventsStore((state) => state.deleteExpense);
  const importExpenses = useEventsStore((state) => state.importExpenses);
  const reminders = useEventsStore((state) => state.reminders);
  const addReminder = useEventsStore((state) => state.addReminder);
  const updateReminder = useEventsStore((state) => state.updateReminder);
  const deleteReminder = useEventsStore((state) => state.deleteReminder);
  const getBalances = useEventsStore((state) => state.getBalances);
  const getDebts = useEventsStore((state) => state.getDebts);
  const connectRealtimeEvent = useEventsStore((state) => state.connectRealtimeEvent);
  const syncStatus = useEventsStore((state) => state.syncStatus);
  const syncError = useEventsStore((state) => state.syncError);
  const realtimeMembers = useEventsStore((state) => state.realtimeMembers[eventId] ?? EMPTY_REALTIME_MEMBERS);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [editingParticipantId, setEditingParticipantId] = useState<UserId | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [isParticipantsCollapsed, setIsParticipantsCollapsed] = useState(false);
  const [expandedParticipantGroupIds, setExpandedParticipantGroupIds] = useState<Set<ParticipantGroupId>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<ParticipantGroupId | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingGroupParticipantIds, setEditingGroupParticipantIds] = useState<UserId[]>([]);
  const [pendingGroupMembers, setPendingGroupMembers] = useState<User[]>([]);
  const [newGroupMemberName, setNewGroupMemberName] = useState("");
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseSortOption, setExpenseSortOption] = useState<ExpenseSortOption>("dateNewestFirst");
  const [expenseFilters, setExpenseFilters] = useState<ExpenseFilters>(defaultExpenseFilters);
  const [isExpensesCollapsed, setIsExpensesCollapsed] = useState(false);
  const [isExpenseControlsOpen, setIsExpenseControlsOpen] = useState(false);
  const [sharePermission, setSharePermission] = useState<SharePermission>("view");
  const [shareUrl, setShareUrl] = useState("");
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isReminderFormOpen, setIsReminderFormOpen] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [reminderExpenseId, setReminderExpenseId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadFromStorage().then(() => {
      ensureSeedData();
      setActiveEvent(eventId);
    });
  }, [ensureSeedData, eventId, loadFromStorage, setActiveEvent]);

  const event = useMemo(
    () => events.find((candidate) => candidate.id === eventId),
    [eventId, events],
  );
  const realtime = useRealtimeEvent(event);
  const canEditEvent = realtime.canEdit;

  const groupedParticipantIds = useMemo(() => {
    if (!event) {
      return new Set<UserId>();
    }

    return new Set(event.participantGroups.flatMap((participantGroup) => participantGroup.participantIds));
  }, [event]);

  const individualParticipants = useMemo(() => {
    if (!event) {
      return [];
    }

    return event.users.filter((participant) => !groupedParticipantIds.has(participant.id));
  }, [event, groupedParticipantIds]);

  const balances = event ? getBalances(event.id) : {};
  const debts = event ? getDebts(event.id) : [];
  const aggregatedDebts = event ? aggregateDebtsByParticipantGroups(event, debts) : [];
  const editingExpense = event?.expenses.find((expense) => expense.id === editingExpenseId);
  const visibleExpenses = event
    ? getVisibleExpenses(event, categories, expenseFilters, expenseSortOption)
    : [];
  const hasExpenseFilters = hasActiveExpenseFilters(expenseFilters);
  const upcomingReminders = useMemo(
    () =>
      reminders
        .filter((reminder) => reminder.eventId === eventId && reminder.status === "scheduled")
        .sort((left, right) => left.remindAt.localeCompare(right.remindAt)),
    [eventId, reminders],
  );
  const editingReminder = reminders.find((reminder) => reminder.id === editingReminderId);

  function handleAddParticipant(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!canEditEvent) {
      return;
    }

    const result = addParticipant(eventId, newParticipantName);
    if (!result.ok) {
      setError(participantErrorMessage(result.error, errorsT));
      return;
    }

    setNewParticipantName("");
    setError(null);
  }

  function startEditing(participantId: UserId, name: string) {
    if (!canEditEvent) {
      return;
    }

    setEditingParticipantId(participantId);
    setEditingName(name);
    setError(null);
  }

  const isEditingParticipantSaveDisabled =
    !editingName.trim() ||
    Boolean(
      event?.users.some(
        (participant) =>
          participant.id !== editingParticipantId && normalizeName(participant.name) === normalizeName(editingName),
      ),
    );

  function cancelEditing() {
    setEditingParticipantId(null);
    setEditingName("");
    setError(null);
  }

  function handleUpdateParticipant(formEvent: FormEvent<HTMLFormElement>, participantId: UserId) {
    formEvent.preventDefault();
    if (!canEditEvent) {
      return;
    }

    const result = updateParticipant(eventId, participantId, editingName);
    if (!result.ok) {
      setError(participantErrorMessage(result.error, errorsT));
      return;
    }

    setEditingParticipantId(null);
    setEditingName("");
    setError(null);
  }

  function handleRemoveParticipant(participant: User) {
    if (!canEditEvent) {
      return;
    }

    if (!window.confirm(t("confirmDeleteParticipant", { name: participant.name }))) {
      return;
    }

    const participantId = participant.id;
    const result = removeParticipant(eventId, participantId);
    if (!result.ok) {
      setError(participantErrorMessage(result.error, errorsT));
      return;
    }

    setError(null);
  }

  function handleAddParticipantGroup(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!canEditEvent) {
      return;
    }

    const result = addParticipantGroup(eventId, newGroupName);
    if (!result.ok) {
      setError(participantGroupErrorMessage(result.error, errorsT));
      return;
    }

    setNewGroupName("");
    setError(null);
  }

  function startEditingGroup(groupId: ParticipantGroupId, name: string) {
    if (!canEditEvent) {
      return;
    }

    const participantGroup = event?.participantGroups.find((group) => group.id === groupId);
    setEditingGroupId(groupId);
    setEditingGroupName(name);
    setEditingGroupParticipantIds(participantGroup?.participantIds ?? []);
    setPendingGroupMembers([]);
    setNewGroupMemberName("");
    setExpandedParticipantGroupIds((current) => new Set(current).add(groupId));
    setError(null);
  }

  function cancelEditingGroup() {
    setEditingGroupId(null);
    setEditingGroupName("");
    setEditingGroupParticipantIds([]);
    setPendingGroupMembers([]);
    setNewGroupMemberName("");
    setError(null);
  }

  function handleUpdateParticipantGroup(formEvent: FormEvent<HTMLFormElement>, groupId: ParticipantGroupId) {
    formEvent.preventDefault();
    if (!canEditEvent) {
      return;
    }

    if (!event) {
      return;
    }

    const existingNames = new Set(event.users.map((participant) => normalizeName(participant.name)));
    const pendingNames = new Set<string>();
    for (const pendingMember of pendingGroupMembers) {
      const normalizedName = normalizeName(pendingMember.name);
      if (!normalizedName) {
        setError(participantErrorMessage("participantNameEmpty", errorsT));
        return;
      }
      if (existingNames.has(normalizedName) || pendingNames.has(normalizedName)) {
        setError(participantErrorMessage("participantAlreadyExists", errorsT));
        return;
      }
      pendingNames.add(normalizedName);
    }

    const result = updateParticipantGroup(eventId, groupId, editingGroupName);
    if (!result.ok) {
      setError(participantGroupErrorMessage(result.error, errorsT));
      return;
    }

    const existingParticipantIds = new Set(event.users.map((participant) => participant.id));
    const desiredParticipantIds = new Set(
      editingGroupParticipantIds.filter((participantId) => existingParticipantIds.has(participantId)),
    );
    for (const pendingMember of pendingGroupMembers) {
      const addResult = addParticipant(eventId, pendingMember.name);
      if (!addResult.ok) {
        setError(participantErrorMessage(addResult.error, errorsT));
        return;
      }
      if (addResult.participantId) {
        desiredParticipantIds.add(addResult.participantId);
      }
    }

    const currentGroup = event.participantGroups.find((participantGroup) => participantGroup.id === groupId);
    for (const participantId of desiredParticipantIds) {
      const moveResult = moveParticipantToGroup(eventId, participantId, groupId);
      if (!moveResult.ok) {
        setError(participantGroupErrorMessage(moveResult.error, errorsT));
        return;
      }
    }

    for (const participantId of currentGroup?.participantIds ?? []) {
      if (!desiredParticipantIds.has(participantId)) {
        const moveResult = moveParticipantToIndividuals(eventId, participantId);
        if (!moveResult.ok) {
          setError(participantGroupErrorMessage(moveResult.error, errorsT));
          return;
        }
      }
    }

    setEditingGroupId(null);
    setEditingGroupName("");
    setEditingGroupParticipantIds([]);
    setPendingGroupMembers([]);
    setNewGroupMemberName("");
    setError(null);
  }

  function handleDeleteParticipantGroup(groupId: ParticipantGroupId, name: string) {
    if (!canEditEvent) {
      return;
    }

    if (!window.confirm(t("confirmDeleteParticipantGroup", { name }))) {
      return;
    }

    const result = deleteParticipantGroup(eventId, groupId);
    if (!result.ok) {
      setError(participantGroupErrorMessage(result.error, errorsT));
      return;
    }

    if (editingGroupId === groupId) {
      cancelEditingGroup();
    }
    setError(null);
  }

  function toggleParticipantGroup(groupId: ParticipantGroupId) {
    setExpandedParticipantGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function addParticipantToGroupDraft(participantId: UserId) {
    setEditingGroupParticipantIds((current) =>
      current.includes(participantId) ? current : [...current, participantId],
    );
  }

  function removeParticipantFromGroupDraft(participantId: UserId) {
    setEditingGroupParticipantIds((current) => current.filter((id) => id !== participantId));
    setPendingGroupMembers((current) => current.filter((participant) => participant.id !== participantId));
  }

  function handleAddPendingGroupMember(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const trimmedName = newGroupMemberName.trim();
    if (!trimmedName) {
      setError(participantErrorMessage("participantNameEmpty", errorsT));
      return;
    }

    const normalizedName = normalizeName(trimmedName);
    const existsInEvent = event?.users.some((participant) => normalizeName(participant.name) === normalizedName);
    const existsInPending = pendingGroupMembers.some((participant) => normalizeName(participant.name) === normalizedName);
    if (existsInEvent || existsInPending) {
      setError(participantErrorMessage("participantAlreadyExists", errorsT));
      return;
    }

    const participantId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPendingGroupMembers((current) => [...current, { id: participantId, name: trimmedName }]);
    setEditingGroupParticipantIds((current) => [...current, participantId]);
    setNewGroupMemberName("");
    setError(null);
  }

  function handleAddExpense(input: Parameters<typeof addExpense>[1]): boolean {
    if (!canEditEvent) {
      return false;
    }

    const result = addExpense(eventId, input);
    if (!result.ok) {
      setError(expenseErrorMessage(result.error, errorsT));
      return false;
    }

    setIsExpenseFormOpen(false);
    setError(null);
    return true;
  }

  function handleUpdateExpense(input: Parameters<typeof addExpense>[1]): boolean {
    if (!canEditEvent) {
      return false;
    }

    if (!editingExpenseId) {
      return false;
    }

    const result = updateExpense(eventId, editingExpenseId, input);
    if (!result.ok) {
      setError(expenseErrorMessage(result.error, errorsT));
      return false;
    }

    setEditingExpenseId(null);
    setError(null);
    return true;
  }

  function handleDeleteExpense(expense: Expense) {
    if (!canEditEvent) {
      return;
    }

    if (!window.confirm(t("confirmDeleteExpense", { title: expense.title }))) {
      return;
    }

    const expenseId = expense.id;
    const result = deleteExpense(eventId, expenseId);
    if (!result.ok) {
      setError(expenseErrorMessage(result.error, errorsT));
      return;
    }

    if (editingExpenseId === expenseId) {
      setEditingExpenseId(null);
    }
    setError(null);
  }

  function handleExportCSV() {
    if (!event) {
      return;
    }

    const csvText = exportEventToCSV(event, categories);
    const url = URL.createObjectURL(new Blob([csvText], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${event.name.replaceAll(/\s+/g, "-").toLowerCase()}-event.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportExpenses(file: File | undefined) {
    if (!file || !event) {
      return;
    }

    try {
      const csvText = await file.text();
      const expenses = importExpensesFromCSV(csvText, event, categories);
      const result = importExpenses(event.id, expenses);
      if (!result.ok) {
        setError(expenseErrorMessage(result.error, errorsT));
        return;
      }
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("importExpensesFailed"));
    }
  }

  async function handleCreateShareLink() {
    if (!event) {
      return;
    }

    setIsCreatingShare(true);
    try {
      const { token, remoteEventId } = await createEventShare({ event, permission: sharePermission });
      const url = `${window.location.origin}/share/${token}`;
      if (remoteEventId) {
        connectRealtimeEvent(event.id, remoteEventId, "owner");
      }
      setShareUrl(url);
      setError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setError(message.includes("authenticated") ? t("shareRequiresSignIn") : t("shareFailed"));
    } finally {
      setIsCreatingShare(false);
    }
  }

  async function handleCopyShareLink() {
    if (!shareUrl) {
      return;
    }

    try {
      await copyTextToClipboard(shareUrl);
      setError(null);
    } catch {
      setError(t("copyShareLinkFailed"));
    }
  }

  function handleAddReminder(input: ReminderFormInput): boolean {
    const result = addReminder({
      eventId,
      expenseId: input.expenseId,
      title: input.title,
      message: input.message,
      remindAt: input.remindAt,
    });
    if (!result.ok) {
      setError(reminderErrorMessage(result.error, errorsT));
      return false;
    }

    setIsReminderFormOpen(false);
    setReminderExpenseId(undefined);
    setError(null);
    return true;
  }

  function handleUpdateReminder(input: ReminderFormInput): boolean {
    if (!editingReminderId) {
      return false;
    }

    const result = updateReminder(editingReminderId, input);
    if (!result.ok) {
      setError(reminderErrorMessage(result.error, errorsT));
      return false;
    }

    setEditingReminderId(null);
    setError(null);
    return true;
  }

  function handleDeleteReminder(reminder: Reminder) {
    if (!window.confirm(t("confirmDeleteReminder", { title: reminder.title }))) {
      return;
    }

    const result = deleteReminder(reminder.id);
    if (!result.ok) {
      setError(reminderErrorMessage(result.error, errorsT));
      return;
    }

    if (editingReminderId === reminder.id) {
      setEditingReminderId(null);
    }
    setError(null);
  }

  if (!event) {
    return (
      <main className="min-h-screen px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          <Link href="/events" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)]">
            {commonT("backToEvents")}
          </Link>
          <section className="rounded-lg border border-[var(--border)] bg-white p-5 sm:p-8">
            <h1 className="text-2xl font-semibold text-zinc-950">{t("eventNotFound")}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {t("eventNotFoundDescription")}
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:gap-4 sm:pb-5">
          <Link href="/events" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)]">
            {commonT("backToEvents")}
          </Link>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--muted)]">{t("event")}</p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal text-zinc-950 sm:mt-2 sm:text-4xl">
                {event.name}
              </h1>
            </div>
            <Link
              href={`/events/${event.id}/analytics`}
              className="flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] px-4 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-white"
            >
              {t("analytics")}
            </Link>
            <button
              type="button"
              onClick={handleCreateShareLink}
              disabled={isCreatingShare || !canEditEvent}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingShare ? t("sharing") : t("shareEvent")}
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-white"
            >
              {t("exportCsv")}
            </button>
            <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] px-4 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-white">
              {t("importExpensesCsv")}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  void handleImportExpenses(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </header>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">{t("collaboration")}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {realtime.isRealtimeEnabled ? t("realtimeEnabled") : t("realtimeLocalOnly")}
              </p>
            </div>
            <div className="rounded-md bg-[var(--surface-subtle)] px-3 py-2 text-sm font-medium text-zinc-900">
              {syncStatus === "error" ? t("syncError") : syncStatus === "syncing" ? t("syncing") : t("synced")}
            </div>
          </div>
          {syncError ? <p className="mt-3 text-sm text-[var(--danger)]">{syncError}</p> : null}
          {realtimeMembers.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {realtimeMembers.map((member) => (
                <span
                  key={`${member.id}-${member.joinedAt}`}
                  className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-[var(--accent-strong)]"
                >
                  {t("memberViewing", { name: member.email })}
                </span>
              ))}
            </div>
          ) : null}
          {!canEditEvent ? (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("viewerReadOnly")}</p>
          ) : null}
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="grid gap-1 text-sm font-medium text-zinc-900">
              {t("sharePermission")}
              <select
                value={sharePermission}
                onChange={(event) => setSharePermission(event.target.value as SharePermission)}
                disabled={!canEditEvent}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
              >
                <option value="view">{t("permissionView")}</option>
                <option value="edit">{t("permissionEdit")}</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleCreateShareLink}
              disabled={isCreatingShare || !canEditEvent}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingShare ? t("sharing") : t("createShareLink")}
            </button>
          </div>
          {shareUrl ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                readOnly
                value={shareUrl}
                className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-zinc-900"
              />
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
              >
                {t("copyShareLink")}
              </button>
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
          <div className="flex flex-col gap-4 sm:gap-6">
            <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setIsParticipantsCollapsed((isCollapsed) => !isCollapsed)}
                  className="flex min-w-0 items-center gap-2 text-left"
                  aria-expanded={!isParticipantsCollapsed}
                >
                  <span
                    className={`text-sm text-[var(--muted)] transition ${isParticipantsCollapsed ? "-rotate-90" : "rotate-0"}`}
                    aria-hidden="true"
                  >
                   ⌄
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-zinc-950">
                      {t("participantsWithCount", { count: event.users.length })}
                    </span>
                    <span className="mt-1 block text-sm text-[var(--muted)]">
                      {t("participantGroupsDescription")}
                    </span>
                  </span>
                </button>
              </div>

              {!isParticipantsCollapsed ? (
                <>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <form className="grid grid-cols-[1fr_auto] gap-2" onSubmit={handleAddParticipant}>
                      <input
                        value={newParticipantName}
                        onChange={(changeEvent) => setNewParticipantName(changeEvent.target.value)}
                        placeholder={t("participantName")}
                        disabled={!canEditEvent}
                        className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
                      />
                      <button
                        type="submit"
                        disabled={!canEditEvent}
                        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("addParticipant")}
                      </button>
                    </form>

                    <form className="grid grid-cols-[1fr_auto] gap-2" onSubmit={handleAddParticipantGroup}>
                      <input
                        value={newGroupName}
                        onChange={(changeEvent) => setNewGroupName(changeEvent.target.value)}
                        placeholder={t("groupName")}
                        disabled={!canEditEvent}
                        className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
                      />
                      <button
                        type="submit"
                        disabled={!canEditEvent}
                        className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("addGroup")}
                      </button>
                    </form>
                  </div>

                  {error ? (
                    <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
                      {error}
                    </p>
                  ) : null}

                  <div className="mt-5 rounded-md bg-[var(--surface-subtle)] p-3">
                    <h3 className="text-sm font-semibold text-zinc-950">{t("individualParticipants")}</h3>
                    <div className="mt-3 divide-y divide-[var(--border)] rounded-md bg-white px-3">
                      {individualParticipants.length > 0 ? (
                        individualParticipants.map((participant) =>
                          editingParticipantId === participant.id ? (
                            <form
                              key={participant.id}
                              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center"
                              onSubmit={(formEvent) => handleUpdateParticipant(formEvent, participant.id)}
                            >
                              <input
                                value={editingName}
                                onChange={(changeEvent) => setEditingName(changeEvent.target.value)}
                                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
                              />
                              <div className="grid grid-cols-2 gap-2 sm:flex">
                                <button
                                  type="submit"
                                  disabled={isEditingParticipantSaveDisabled}
                                  className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {commonT("save")}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
                                >
                                  {commonT("cancel")}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <ParticipantRow
                              key={participant.id}
                              participant={participant}
                              canEdit={canEditEvent}
                              onEdit={() => startEditing(participant.id, participant.name)}
                              onDelete={() => handleRemoveParticipant(participant)}
                            />
                          ),
                        )
                      ) : (
                        <p className="py-4 text-sm text-[var(--muted)]">{t("noIndividualParticipants")}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3">
                    {event.participantGroups.length > 0 ? (
                      event.participantGroups.map((participantGroup) => {
                        const isEditing = editingGroupId === participantGroup.id;
                        const isExpanded = isEditing || expandedParticipantGroupIds.has(participantGroup.id);
                        const persistedParticipants = participantGroup.participantIds
                          .map((participantId) => event.users.find((participant) => participant.id === participantId))
                          .filter((participant): participant is User => Boolean(participant));
                        const draftParticipants = editingGroupParticipantIds
                          .map(
                            (participantId) =>
                              event.users.find((participant) => participant.id === participantId) ??
                              pendingGroupMembers.find((participant) => participant.id === participantId),
                          )
                          .filter((participant): participant is User => Boolean(participant));
                        const shownParticipants = isEditing ? draftParticipants : persistedParticipants;
                        const availableParticipants = event.users.filter(
                          (participant) => !editingGroupParticipantIds.includes(participant.id),
                        );
                        const isGroupSaveDisabled =
                          !editingGroupName.trim() ||
                          event.participantGroups.some(
                            (group) =>
                              group.id !== participantGroup.id &&
                              normalizeName(group.name) === normalizeName(editingGroupName),
                          );

                        return (
                          <div key={participantGroup.id} className="rounded-md border border-[var(--border)] p-3">
                            {isEditing ? (
                              <form
                                className="flex flex-col gap-2 sm:flex-row sm:items-center"
                                onSubmit={(formEvent) => handleUpdateParticipantGroup(formEvent, participantGroup.id)}
                              >
                                <input
                                  value={editingGroupName}
                                  onChange={(changeEvent) => setEditingGroupName(changeEvent.target.value)}
                                  className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
                                />
                                <div className="grid grid-cols-2 gap-2 sm:flex">
                                  <button
                                    type="submit"
                                    disabled={isGroupSaveDisabled}
                                    className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {commonT("save")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditingGroup}
                                    className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
                                  >
                                    {commonT("cancel")}
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <ParticipantGroupRow
                                name={participantGroup.name}
                                count={persistedParticipants.length}
                                isExpanded={isExpanded}
                                canEdit={canEditEvent}
                                onToggle={() => toggleParticipantGroup(participantGroup.id)}
                                onEdit={() => startEditingGroup(participantGroup.id, participantGroup.name)}
                                onDelete={() => handleDeleteParticipantGroup(participantGroup.id, participantGroup.name)}
                              />
                            )}

                            {isExpanded ? (
                              <div className="mt-3 rounded-md bg-[var(--surface-subtle)] p-3">
                                <ParticipantList
                                  participants={shownParticipants}
                                  emptyText={t("noParticipantsInGroup")}
                                  action={
                                    isEditing
                                      ? (participant) => (
                                          <button
                                            type="button"
                                            onClick={() => removeParticipantFromGroupDraft(participant.id)}
                                            className="h-10 w-10 rounded-md border border-red-200 bg-white text-sm font-semibold text-[var(--danger)] transition hover:bg-red-50"
                                            aria-label={t("removeParticipantFromGroup", { name: participant.name })}
                                          >
                                            -
                                          </button>
                                        )
                                      : undefined
                                  }
                                />

                                {isEditing ? (
                                  <div className="mt-3 space-y-3">
                                    <div>
                                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                                        {t("availableParticipants")}
                                      </h4>
                                      <ParticipantList
                                        participants={availableParticipants}
                                        emptyText={t("noAvailableParticipants")}
                                        action={(participant) => (
                                          <button
                                            type="button"
                                            onClick={() => addParticipantToGroupDraft(participant.id)}
                                            className="h-10 w-10 rounded-md border border-emerald-200 bg-white text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50"
                                            aria-label={t("addParticipantToGroup", { name: participant.name })}
                                          >
                                            +
                                          </button>
                                        )}
                                      />
                                    </div>

                                    <form className="grid grid-cols-[1fr_auto] gap-2" onSubmit={handleAddPendingGroupMember}>
                                      <input
                                        value={newGroupMemberName}
                                        onChange={(changeEvent) => setNewGroupMemberName(changeEvent.target.value)}
                                        placeholder={t("newMemberName")}
                                        className="min-w-0 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
                                      />
                                      <button
                                        type="submit"
                                        className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50"
                                      >
                                        {t("newMember")}
                                      </button>
                                    </form>
                                  </div>
                                ) : persistedParticipants.length === 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => startEditingGroup(participantGroup.id, participantGroup.name)}
                                    disabled={!canEditEvent}
                                    className="mt-3 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {commonT("edit")}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
                        {t("noParticipantGroups")}
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </section>
          </div>

          <div className="flex flex-col gap-4 sm:gap-6">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <button
                  type="button"
                  onClick={() => setIsExpensesCollapsed((isCollapsed) => !isCollapsed)}
                  className="flex min-h-10 min-w-0 items-center gap-2 text-left"
                  aria-expanded={!isExpensesCollapsed}
                >
                  <span className={`text-lg text-zinc-400 transition ${isExpensesCollapsed ? "-rotate-90" : "rotate-0"}`}>
                    ⌄
                  </span>
                  <h2 className="truncate text-lg font-semibold text-zinc-500">
                    {t("expensesWithCount", { count: event.expenses.length })}
                  </h2>
                </button>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!canEditEvent) {
                        return;
                      }
                      setIsExpenseFormOpen(true);
                      setEditingExpenseId(null);
                      setError(null);
                    }}
                    disabled={!canEditEvent}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xl font-light text-[var(--accent)] shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={expenseT("addExpense")}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsExpenseControlsOpen((isOpen) => !isOpen)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-[var(--accent)] shadow-sm transition hover:bg-zinc-50"
                    aria-label={expenseT("sort")}
                    aria-expanded={isExpenseControlsOpen}
                  >
                    ≡
                  </button>
                </div>
              </div>

              {isExpensesCollapsed ? null : (
                <>
                  {isExpenseFormOpen ? (
                    <div className="mb-4 rounded-[24px] bg-white p-4 shadow-sm">
                      <ExpenseForm
                        event={event}
                        categories={categories}
                        onSubmit={handleAddExpense}
                        onCancel={() => setIsExpenseFormOpen(false)}
                      />
                    </div>
                  ) : null}

                  {editingExpense ? (
                    <div className="mb-4 rounded-[24px] bg-white p-4 shadow-sm">
                      <ExpenseForm
                        event={event}
                        categories={categories}
                        initialExpense={editingExpense}
                        onSubmit={handleUpdateExpense}
                        onCancel={() => setEditingExpenseId(null)}
                      />
                    </div>
                  ) : null}

                  {isExpenseControlsOpen ? (
                    <ExpenseControls
                      event={event}
                      categories={categories}
                      filters={expenseFilters}
                      sortOption={expenseSortOption}
                      onSortChange={setExpenseSortOption}
                      onFiltersChange={setExpenseFilters}
                    />
                  ) : null}

                  <div className="overflow-hidden rounded-[28px] bg-white shadow-sm">
                    {visibleExpenses.length > 0 ? (
                      visibleExpenses.map((expense) => (
                        <ExpenseRow
                          key={expense.id}
                          expense={expense}
                          event={event}
                          categories={categories}
                          canEdit={canEditEvent}
                          onEdit={() => {
                            setEditingExpenseId(expense.id);
                            setIsExpenseFormOpen(false);
                            setError(null);
                          }}
                          onAddReminder={() => {
                            setReminderExpenseId(expense.id);
                            setIsReminderFormOpen(true);
                            setEditingReminderId(null);
                            setError(null);
                          }}
                          onDelete={() => handleDeleteExpense(expense)}
                        />
                      ))
                    ) : event.expenses.length > 0 ? (
                      <div className="p-4">
                        <p className="text-sm text-[var(--muted)]">{t("noExpensesMatchFilters")}</p>
                        {hasExpenseFilters ? (
                          <button
                            type="button"
                            onClick={() => setExpenseFilters(defaultExpenseFilters)}
                            className="mt-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
                          >
                            {t("clearFilters")}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <p className="p-4 text-sm text-[var(--muted)]">{t("noExpensesYet")}</p>
                    )}
                  </div>
                </>
              )}
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <h2 className="text-base font-semibold text-zinc-950">{t("reminders")}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{t("remindersDescription")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsReminderFormOpen(true);
                    setEditingReminderId(null);
                    setReminderExpenseId(undefined);
                    setError(null);
                  }}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
                >
                  {t("addReminder")}
                </button>
              </div>

              {isReminderFormOpen ? (
                <div className="mt-5">
                  <ReminderForm
                    event={event}
                    initialExpenseId={reminderExpenseId}
                    onSubmit={handleAddReminder}
                    onCancel={() => {
                      setIsReminderFormOpen(false);
                      setReminderExpenseId(undefined);
                    }}
                  />
                </div>
              ) : null}

              {editingReminder ? (
                <div className="mt-5">
                  <ReminderForm
                    event={event}
                    initialReminder={editingReminder}
                    onSubmit={handleUpdateReminder}
                    onCancel={() => setEditingReminderId(null)}
                  />
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-2">
                {upcomingReminders.length > 0 ? (
                  upcomingReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-zinc-950">{reminder.title}</h3>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {formatReminderDate(reminder.remindAt, locale)}
                            {reminder.expenseId
                              ? ` / ${event.expenses.find((expense) => expense.id === reminder.expenseId)?.title ?? t("expenseReminder")}`
                              : ""}
                          </p>
                          {reminder.message ? (
                            <p className="mt-2 line-clamp-2 text-sm text-zinc-700">{reminder.message}</p>
                          ) : null}
                        </div>
                        <div className="grid shrink-0 grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingReminderId(reminder.id);
                              setIsReminderFormOpen(false);
                            }}
                            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
                          >
                            {commonT("edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteReminder(reminder)}
                            className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-[var(--danger)] transition hover:bg-red-50"
                          >
                            {commonT("delete")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
                    {t("noReminders")}
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
              <h2 className="text-base font-semibold text-zinc-950">{t("balances")}</h2>
              <div className="mt-4 divide-y divide-[var(--border)]">
                {event.users.map((participant) => {
                  const amountCents = balances[participant.id] ?? 0;
                  const balanceTone =
                    amountCents > 0
                      ? "text-[var(--accent-strong)]"
                      : amountCents < 0
                        ? "text-[var(--danger)]"
                        : "text-[var(--muted)]";
                  const balanceLabel =
                    amountCents > 0 ? t("shouldReceive") : amountCents < 0 ? t("owes") : t("settled");
                  return (
                    <div key={participant.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <span className="truncate text-sm font-medium text-zinc-900">{participant.name}</span>
                        <p className={`mt-0.5 text-xs ${balanceTone}`}>{balanceLabel}</p>
                      </div>
                      <span className={`shrink-0 text-sm font-semibold ${balanceTone}`}>{formatMoney(amountCents, locale)}</span>
                    </div>
                  );
                })}
              </div>

              <h3 className="mt-5 text-sm font-semibold text-zinc-950">{t("debtSummary")}</h3>
              <div className="mt-3 flex flex-col gap-2">
                {aggregatedDebts.length > 0 ? (
                  aggregatedDebts.map((debt) => (
                    <div
                      key={`${debt.from.type}:${debt.from.id}-${debt.to.type}:${debt.to.id}`}
                      className="flex items-center justify-between gap-3 rounded-md bg-[var(--surface-subtle)] px-3 py-2"
                    >
                      <span className="min-w-0 text-sm text-zinc-900">
                        {t("debtLine", {
                          from: aggregateParticipantName(event, debt.from),
                          to: aggregateParticipantName(event, debt.to),
                        })}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-zinc-950">{formatMoney(debt.amountCents, locale)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">{t("allSettled")}</p>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function ExpenseControls({
  event,
  categories,
  filters,
  sortOption,
  onSortChange,
  onFiltersChange,
}: {
  event: { users: User[]; participantGroups: { id: string; name: string; participantIds: string[] }[] };
  categories: ExpenseCategory[];
  filters: ExpenseFilters;
  sortOption: ExpenseSortOption;
  onSortChange: (option: ExpenseSortOption) => void;
  onFiltersChange: (filters: ExpenseFilters) => void;
}) {
  const t = useTranslations("expenses");

  return (
    <div className="mt-4 grid gap-3 rounded-md bg-[var(--surface-subtle)] p-3 sm:mt-5 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
        {t("sort")}
        <select
          value={sortOption}
          onChange={(event) => onSortChange(event.target.value as ExpenseSortOption)}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
        >
          <option value="dateNewestFirst">{t("dateNewestFirst")}</option>
          <option value="dateOldestFirst">{t("dateOldestFirst")}</option>
          <option value="categoryAZ">{t("categoryAZ")}</option>
          <option value="categoryZA">{t("categoryZA")}</option>
          <option value="amountLowToHigh">{t("amountLowToHigh")}</option>
          <option value="amountHighToLow">{t("amountHighToLow")}</option>
        </select>
      </label>

      <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
        {t("category")}
        <select
          value={filters.categoryId}
          onChange={(event) => onFiltersChange({ ...filters, categoryId: event.target.value })}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
        >
          <option value="all">{t("allCategories")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.icon} {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
        {t("payer")}
        <select
          value={payerFilterToValue(filters.payer)}
          onChange={(event) => onFiltersChange({ ...filters, payer: payerFilterFromValue(event.target.value) })}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
        >
          <option value="all">{t("allPayers")}</option>
          {event.users.map((participant) => (
            <option key={participant.id} value={`participant:${participant.id}`}>
              {participant.name}
            </option>
          ))}
          {event.participantGroups.map((participantGroup) => (
            <option key={participantGroup.id} value={`participantGroup:${participantGroup.id}`}>
              {participantGroup.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
        {t("date")}
        <select
          value={filters.date}
          onChange={(event) =>
            onFiltersChange({ ...filters, date: event.target.value as ExpenseFilters["date"] })
          }
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
        >
          <option value="all">{t("allDates")}</option>
          <option value="thisMonth">{t("thisMonth")}</option>
          <option value="lastMonth">{t("lastMonth")}</option>
          <option value="thisYear">{t("thisYear")}</option>
        </select>
      </label>
    </div>
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to a temporary textarea for browsers that deny clipboard permissions.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

interface ReminderFormInput {
  title: string;
  message?: string;
  remindAt: string;
  expenseId?: string;
}

function ReminderForm({
  event,
  initialReminder,
  initialExpenseId,
  onSubmit,
  onCancel,
}: {
  event: { expenses: Expense[] };
  initialReminder?: Reminder;
  initialExpenseId?: string;
  onSubmit: (input: ReminderFormInput) => boolean;
  onCancel: () => void;
}) {
  const t = useTranslations("eventDetail");
  const commonT = useTranslations("common");
  const initialDate = initialReminder?.remindAt ? new Date(initialReminder.remindAt) : nextReminderDefaultDate();
  const [title, setTitle] = useState(initialReminder?.title ?? "");
  const [message, setMessage] = useState(initialReminder?.message ?? "");
  const [date, setDate] = useState(toDateInputValue(initialDate));
  const [time, setTime] = useState(toTimeInputValue(initialDate));
  const [expenseId, setExpenseId] = useState(initialReminder?.expenseId ?? initialExpenseId ?? "");

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const localDate = new Date(`${date}T${time}`);
    const ok = onSubmit({
      title,
      message,
      expenseId: expenseId || undefined,
      remindAt: localDate.toISOString(),
    });
    if (ok && !initialReminder) {
      setTitle("");
      setMessage("");
      setExpenseId("");
    }
  }

  return (
    <form className="grid gap-3 rounded-md bg-[var(--surface-subtle)] p-3" onSubmit={handleSubmit}>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t("reminderTitle")}
        className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
      />
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={t("reminderMessage")}
        rows={3}
        className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
        />
        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
        />
      </div>
      <select
        value={expenseId}
        onChange={(event) => setExpenseId(event.target.value)}
        className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
      >
        <option value="">{t("eventReminder")}</option>
        {event.expenses.map((expense) => (
          <option key={expense.id} value={expense.id}>
            {expense.title}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <button
          type="submit"
          className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          {commonT("save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
        >
          {commonT("cancel")}
        </button>
      </div>
    </form>
  );
}

function ExpenseRow({
  expense,
  event,
  categories,
  canEdit,
  onEdit,
  onAddReminder,
  onDelete,
}: {
  expense: Expense;
  event: { users: User[]; participantGroups: { id: string; name: string; participantIds: string[] }[] };
  categories: ExpenseCategory[];
  canEdit: boolean;
  onEdit: () => void;
  onAddReminder: () => void;
  onDelete: () => void;
}) {
  const commonT = useTranslations("common");
  const detailT = useTranslations("eventDetail");
  const expenseT = useTranslations("expenses");
  const locale = useLocale();
  const category = categoryOrOther(categories, expense.categoryId);
  const [actionsOpen, setActionsOpen] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  function handleTouchStart(touchEvent: TouchEvent) {
    touchStartXRef.current = touchEvent.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(touchEvent: TouchEvent) {
    const startX = touchStartXRef.current;
    const endX = touchEvent.changedTouches[0]?.clientX;
    touchStartXRef.current = null;

    if (startX === null || endX === undefined) {
      return;
    }

    const deltaX = endX - startX;
    if (deltaX < -44) {
      setActionsOpen(true);
    }
    if (deltaX > 44) {
      setActionsOpen(false);
    }
  }

  return (
    <div
      className="border-b border-zinc-100 last:border-b-0"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="grid grid-cols-[40px_1fr_auto] gap-3 px-5 py-4">
        <div className="flex flex-col items-center pt-0.5">
          <span className="text-2xl leading-none text-blue-500">{category.icon}</span>
          <span className="mt-1 text-center text-xs font-medium leading-4 text-zinc-500">
            {formatExpenseDay(expense.date, locale)}
          </span>
          <span className="text-center text-xs leading-4 text-zinc-400">{formatExpenseYear(expense.date)}</span>
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold leading-6 text-zinc-950">{expense.title}</h3>
          <p className="mt-0.5 truncate text-sm text-zinc-500">
            {detailT("paidBy")} {paidByText(event, expense, commonT("unknown"))}, {expenseT(expense.splitMode)}
          </p>
        </div>
        <div className="flex min-w-[92px] flex-col items-end gap-3">
          <span className="text-right text-lg font-bold leading-6 text-zinc-950">
            {formatMoney(expense.amountCents, locale)}
          </span>
          <button
            type="button"
            onClick={() => setActionsOpen((isOpen) => !isOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            aria-label={detailT("expenseActions")}
            aria-expanded={actionsOpen}
          >
            ⋯
          </button>
        </div>
      </div>
      {actionsOpen ? (
        <div className="grid grid-cols-3 gap-2 px-5 pb-4">
          <button
            type="button"
            onClick={() => {
              setActionsOpen(false);
              onEdit();
            }}
            disabled={!canEdit}
            className="rounded-full bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {commonT("edit")}
          </button>
          <button
            type="button"
            onClick={() => {
              setActionsOpen(false);
              onAddReminder();
            }}
            className="rounded-full bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
          >
            {detailT("addReminder")}
          </button>
          <button
            type="button"
            onClick={() => {
              setActionsOpen(false);
              onDelete();
            }}
            disabled={!canEdit}
            className="rounded-full bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {commonT("delete")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function payerFilterToValue(payer: ExpenseFilters["payer"]): string {
  return payer.type === "all" ? "all" : `${payer.type}:${payer.id}`;
}

function payerFilterFromValue(value: string): ExpenseFilters["payer"] {
  if (value === "all") {
    return { type: "all" };
  }

  const [type, id] = value.split(":");
  if ((type === "participant" || type === "participantGroup") && id) {
    return { type, id };
  }

  return { type: "all" };
}

function paidByText(
  event: { users: User[]; participantGroups: { id: string; name: string; participantIds: string[] }[] },
  expense: Expense,
  unknownLabel: string,
): string {
  const payerIds = expense.paidBySplits.map((split) => split.participantId).sort();
  const matchingGroup = event.participantGroups.find(
    (participantGroup) =>
      participantGroup.participantIds.length > 0 && sameSet(participantGroup.participantIds, payerIds),
  );

  if (matchingGroup) {
    return matchingGroup.name;
  }

  return payerIds.map((participantId) => participantName(event, participantId, unknownLabel)).join(", ");
}

function participantName(event: { users: User[] }, participantId: string, unknownLabel: string): string {
  return event.users.find((participant) => participant.id === participantId)?.name ?? unknownLabel;
}

function formatExpenseDay(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale.startsWith("ru") ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatExpenseYear(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return String(date.getFullYear());
}

function formatReminderDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale.startsWith("ru") ? "ru-RU" : "en-US", {
    dateStyle: locale.startsWith("ru") ? "short" : "medium",
    timeStyle: "short",
  }).format(date);
}

function nextReminderDefaultDate(): Date {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date;
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function ParticipantList({
  participants,
  emptyText,
  action,
}: {
  participants: User[];
  emptyText: string;
  action?: (participant: User) => ReactNode;
}) {
  if (participants.length === 0) {
    return <p className="mt-3 text-sm text-[var(--muted)]">{emptyText}</p>;
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {participants.map((participant) => (
        <div key={participant.id} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
          <span className="min-w-0 truncate text-sm font-medium text-zinc-900">{participant.name}</span>
          {action ? action(participant) : null}
        </div>
      ))}
    </div>
  );
}

function ParticipantGroupRow({
  name,
  count,
  isExpanded,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
}: {
  name: string;
  count: number;
  isExpanded: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eventDetail");
  const commonT = useTranslations("common");
  const [actionsOpen, setActionsOpen] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  function handleTouchStart(touchEvent: TouchEvent) {
    touchStartXRef.current = touchEvent.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(touchEvent: TouchEvent) {
    const startX = touchStartXRef.current;
    const endX = touchEvent.changedTouches[0]?.clientX;
    touchStartXRef.current = null;

    if (startX === null || endX === undefined) {
      return;
    }

    const deltaX = endX - startX;
    if (deltaX < -44) {
      setActionsOpen(true);
    }
    if (deltaX > 44) {
      setActionsOpen(false);
    }
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={isExpanded}
        >
          <span
            className={`text-sm text-[var(--muted)] transition ${isExpanded ? "rotate-0" : "-rotate-90"}`}
            aria-hidden="true"
          >
            ⌄
          </span>
          <span className="min-w-0 truncate text-sm font-semibold text-zinc-950">
            {name} <span className="text-[var(--muted)]">({count})</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActionsOpen((isOpen) => !isOpen)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          aria-label={t("participantGroupActions", { name })}
          aria-expanded={actionsOpen}
        >
          ⋯
        </button>
      </div>

      {actionsOpen ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setActionsOpen(false);
              onEdit();
            }}
            disabled={!canEdit}
            className="rounded-full bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {commonT("edit")}
          </button>
          <button
            type="button"
            onClick={() => {
              setActionsOpen(false);
              onDelete();
            }}
            disabled={!canEdit}
            className="rounded-full bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {commonT("delete")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ParticipantRow({
  participant,
  canEdit,
  onEdit,
  onDelete,
}: {
  participant: User;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eventDetail");
  const commonT = useTranslations("common");
  const [actionsOpen, setActionsOpen] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  function handleTouchStart(touchEvent: TouchEvent) {
    touchStartXRef.current = touchEvent.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(touchEvent: TouchEvent) {
    const startX = touchStartXRef.current;
    const endX = touchEvent.changedTouches[0]?.clientX;
    touchStartXRef.current = null;

    if (startX === null || endX === undefined) {
      return;
    }

    const deltaX = endX - startX;
    if (deltaX < -44) {
      setActionsOpen(true);
    }
    if (deltaX > 44) {
      setActionsOpen(false);
    }
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-md bg-white px-1 py-1">
        <span className="min-w-0 truncate text-sm font-medium text-zinc-950">{participant.name}</span>
        <button
          type="button"
          onClick={() => setActionsOpen((isOpen) => !isOpen)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          aria-label={t("participantActions", { name: participant.name })}
          aria-expanded={actionsOpen}
        >
          ⋯
        </button>
      </div>
      {actionsOpen ? (
        <div className="grid grid-cols-2 gap-2 pb-1 pt-2">
          <button
            type="button"
            onClick={() => {
              setActionsOpen(false);
              onEdit();
            }}
            disabled={!canEdit}
            className="rounded-full bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {commonT("edit")}
          </button>
          <button
            type="button"
            onClick={() => {
              setActionsOpen(false);
              onDelete();
            }}
            disabled={!canEdit}
            className="rounded-full bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {commonT("delete")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function participantErrorMessage(error: ParticipantMutationError, t: (key: string) => string): string {
  switch (error) {
    case "eventNotFound":
      return t("eventNotFound");
    case "participantNotFound":
      return t("participantNotFound");
    case "participantNameEmpty":
      return t("participantNameEmpty");
    case "participantAlreadyExists":
      return t("participantAlreadyExists");
    case "participantInUse":
      return t("participantInUse");
  }
}

function participantGroupErrorMessage(error: ParticipantGroupMutationError, t: (key: string) => string): string {
  switch (error) {
    case "eventNotFound":
      return t("eventNotFound");
    case "participantNotFound":
      return t("participantNotFound");
    case "participantGroupNotFound":
      return t("participantGroupNotFound");
    case "participantGroupNameEmpty":
      return t("participantGroupNameEmpty");
    case "participantGroupAlreadyExists":
      return t("participantGroupAlreadyExists");
  }
}

function expenseErrorMessage(error: ExpenseMutationError, t: (key: string) => string): string {
  switch (error) {
    case "eventNotFound":
      return t("eventNotFound");
    case "expenseNotFound":
      return t("expenseNotFound");
    case "titleEmpty":
      return t("titleEmpty");
    case "amountInvalidPositive":
      return t("amountInvalidPositive");
    case "payerRequired":
      return t("payerRequired");
    case "invalidPayer":
      return t("invalidPayer");
    case "participantsRequired":
      return t("participantsRequired");
    case "invalidParticipant":
      return t("invalidParticipant");
    case "negativeSplit":
      return t("negativeSplit");
    case "paidByMismatch":
      return t("paidByMismatch");
    case "splitMismatch":
      return t("splitMismatch");
    case "invalidDate":
      return t("invalidDate");
  }
}

function reminderErrorMessage(error: ReminderMutationError, t: (key: string) => string): string {
  switch (error) {
    case "eventNotFound":
      return t("eventNotFound");
    case "reminderNotFound":
      return t("reminderNotFound");
    case "reminderTitleEmpty":
      return t("reminderTitleEmpty");
    case "reminderDateInPast":
      return t("reminderDateInPast");
  }
}
