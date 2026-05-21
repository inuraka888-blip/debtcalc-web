"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { calculateBalances, calculateDebts } from "@/domain/balanceCalculator";
import { mergeDefaultCategories } from "@/domain/categories";
import { aggregateDebtsByParticipantGroups, aggregateParticipantName } from "@/domain/debtAggregation";
import type { Expense } from "@/domain/models";
import { formatMoney } from "@/domain/money";
import { Link } from "@/i18n/routing";
import { acceptSharedEvent } from "@/lib/supabase/sharedEvents";
import { useEventsStore } from "@/store/eventsStore";
import { ExpenseForm } from "@/features/events/ExpenseForm";
import { useSharedEventCollaboration } from "@/features/shared/useSharedEventCollaboration";

export function SharedEventScreen({ token }: { token: string }) {
  const t = useTranslations("share");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const loadFromStorage = useEventsStore((state) => state.loadFromStorage);
  const ensureSeedData = useEventsStore((state) => state.ensureSeedData);
  const categories = useEventsStore((state) => state.categories);
  const saveSharedEventCopy = useEventsStore((state) => state.saveSharedEventCopy);
  const connectRealtimeEvent = useEventsStore((state) => state.connectRealtimeEvent);
  const saveToStorage = useEventsStore((state) => state.saveToStorage);
  const collaboration = useSharedEventCollaboration(token);
  const [message, setMessage] = useState<string | null>(null);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    void loadFromStorage().then(() => ensureSeedData());
  }, [ensureSeedData, loadFromStorage]);

  const event = collaboration.event;
  const categoriesForForm = categories.length > 0 ? categories : mergeDefaultCategories([]);
  const editingExpense = event?.expenses.find((expense) => expense.id === editingExpenseId);
  const balances = useMemo(() => (event ? calculateBalances(event) : {}), [event]);
  const debts = useMemo(() => (event ? calculateDebts(event) : []), [event]);
  const aggregatedDebts = useMemo(() => (event ? aggregateDebtsByParticipantGroups(event, debts) : []), [debts, event]);

  async function handleSaveToMyEvents() {
    if (!event) {
      return;
    }

    await loadFromStorage();
    const eventId = saveSharedEventCopy(event);
    if (collaboration.remoteEventId) {
      try {
        const acceptedShare = await acceptSharedEvent(token);
        connectRealtimeEvent(eventId, acceptedShare.remoteEventId, acceptedShare.permission);
      } catch {
        // Unauthenticated users can still save a local copy; realtime access needs event_members.
      }
    }
    await saveToStorage();
    setMessage(t("saved"));
  }

  async function handleAddParticipant(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const didSave = await collaboration.addParticipant(newParticipantName);
    if (didSave) {
      setNewParticipantName("");
    }
  }

  async function handleAddGroup(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const didSave = await collaboration.addParticipantGroup(newGroupName);
    if (didSave) {
      setNewGroupName("");
    }
  }

  async function handleEditParticipant(participantId: string, currentName: string) {
    const nextName = window.prompt(t("participantName"), currentName);
    if (nextName === null) {
      return;
    }
    await collaboration.updateParticipant(participantId, nextName);
  }

  async function handleDeleteParticipant(participantId: string, name: string) {
    if (!window.confirm(t("confirmDeleteParticipant", { name }))) {
      return;
    }
    await collaboration.removeParticipant(participantId);
  }

  async function handleEditGroup(groupId: string, currentName: string) {
    const nextName = window.prompt(t("groupName"), currentName);
    if (nextName === null) {
      return;
    }
    await collaboration.updateParticipantGroup(groupId, nextName);
  }

  async function handleDeleteGroup(groupId: string, name: string) {
    if (!window.confirm(t("confirmDeleteGroup", { name }))) {
      return;
    }
    await collaboration.deleteParticipantGroup(groupId);
  }

  async function handleDeleteExpense(expense: Expense) {
    if (!window.confirm(t("confirmDeleteExpense", { title: expense.title }))) {
      return;
    }
    await collaboration.deleteExpense(expense.id);
  }

  return (
    <main className="min-h-screen px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:gap-4 sm:pb-5">
          <Link href="/events" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)]">
            {commonT("backToEvents")}
          </Link>
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">{t("eyebrow")}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950 sm:mt-2 sm:text-4xl">
              {event?.name ?? t("title")}
            </h1>
          </div>
        </header>

        {collaboration.isLoading ? (
          <p className="rounded-lg border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">
            {t("loading")}
          </p>
        ) : null}
        {collaboration.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-[var(--danger)]">{collaboration.error}</p>
        ) : null}
        {message ? (
          <p className="rounded-lg border border-teal-100 bg-teal-50 p-5 text-sm text-[var(--accent-strong)]">
            {message}
          </p>
        ) : null}

        {event ? (
          <>
            <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <h2 className="text-base font-semibold text-zinc-950">{t("sharedAccess")}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {collaboration.permission === "edit" ? t("collaborativeEditing") : t("viewOnly")}
                  </p>
                  <p className="mt-2 text-xs font-medium text-zinc-700">
                    {t("syncStatus")}: {t(collaboration.saveStatus)} · {t("connectedUsers", { count: collaboration.connectedUsers })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveToMyEvents}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
                >
                  {t("saveToMyEvents")}
                </button>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <ReadOnlyCard title={t("participants")}>
                {collaboration.canEdit ? (
                  <form className="mb-4 grid grid-cols-[1fr_auto] gap-2" onSubmit={handleAddParticipant}>
                    <input
                      value={newParticipantName}
                      onChange={(inputEvent) => setNewParticipantName(inputEvent.target.value)}
                      placeholder={t("participantName")}
                      className="min-w-0 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
                    />
                    <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white">
                      {commonT("add")}
                    </button>
                  </form>
                ) : null}
                {event.users.length > 0 ? (
                  <div className="divide-y divide-[var(--border)]">
                    {event.users.map((participant) => (
                      <div key={participant.id} className="flex items-center justify-between gap-3 py-3">
                        <p className="min-w-0 truncate text-sm font-medium text-zinc-900">{participant.name}</p>
                        {collaboration.canEdit ? (
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditParticipant(participant.id, participant.name)}
                              className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-zinc-800"
                            >
                              {commonT("edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteParticipant(participant.id, participant.name)}
                              className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-[var(--danger)]"
                            >
                              {commonT("delete")}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted)]">{t("emptyParticipants")}</p>
                )}
              </ReadOnlyCard>

              <ReadOnlyCard title={t("expenses")}>
                {collaboration.canEdit ? (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingExpenseId(null);
                        setIsExpenseFormOpen((isOpen) => !isOpen);
                      }}
                      className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
                    >
                      {t("addExpense")}
                    </button>
                  </div>
                ) : null}
                {isExpenseFormOpen && collaboration.canEdit ? (
                  <div className="mb-4">
                    <ExpenseForm
                      event={event}
                      categories={categoriesForForm}
                      initialExpense={editingExpense}
                      onSubmit={(input) => {
                        void (editingExpense
                          ? collaboration.updateExpense(editingExpense.id, input)
                          : collaboration.addExpense(input)
                        ).then((didSave) => {
                          if (didSave) {
                            setIsExpenseFormOpen(false);
                            setEditingExpenseId(null);
                          }
                        });
                        return true;
                      }}
                      onCancel={() => {
                        setIsExpenseFormOpen(false);
                        setEditingExpenseId(null);
                      }}
                    />
                  </div>
                ) : null}
                {event.expenses.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {event.expenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="flex items-start justify-between gap-3 rounded-md bg-[var(--surface-subtle)] px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-950">{expense.title}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">{formatSharedDate(expense.date, locale)}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-zinc-950">
                          {formatMoney(expense.amountCents, locale)}
                        </span>
                        {collaboration.canEdit ? (
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingExpenseId(expense.id);
                                setIsExpenseFormOpen(true);
                              }}
                              className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-zinc-800"
                            >
                              {commonT("edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(expense)}
                              className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-[var(--danger)]"
                            >
                              {commonT("delete")}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted)]">{t("emptyExpenses")}</p>
                )}
              </ReadOnlyCard>
            </section>

            <ReadOnlyCard title={t("participantGroups")}>
              {collaboration.canEdit ? (
                <form className="mb-4 grid grid-cols-[1fr_auto] gap-2" onSubmit={handleAddGroup}>
                  <input
                    value={newGroupName}
                    onChange={(inputEvent) => setNewGroupName(inputEvent.target.value)}
                    placeholder={t("groupName")}
                    className="min-w-0 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
                  />
                  <button type="submit" className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white">
                    {commonT("add")}
                  </button>
                </form>
              ) : null}
              {event.participantGroups.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {event.participantGroups.map((group) => {
                    const participants = group.participantIds
                      .map((participantId) => event.users.find((participant) => participant.id === participantId))
                      .filter(Boolean);
                    const availableParticipants = event.users.filter(
                      (participant) => !group.participantIds.includes(participant.id),
                    );
                    return (
                      <div key={group.id} className="rounded-md bg-[var(--surface-subtle)] px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-zinc-950">
                            {group.name} <span className="text-[var(--muted)]">({participants.length})</span>
                          </p>
                          {collaboration.canEdit ? (
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditGroup(group.id, group.name)}
                                className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-zinc-800"
                              >
                                {commonT("edit")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteGroup(group.id, group.name)}
                                className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-[var(--danger)]"
                              >
                                {commonT("delete")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {participants.map((participant) =>
                            participant ? (
                              <span key={participant.id} className="rounded-full bg-white px-2 py-1 text-xs text-zinc-800">
                                {participant.name}
                                {collaboration.canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => collaboration.moveParticipantToIndividuals(participant.id)}
                                    className="ml-2 text-[var(--danger)]"
                                    aria-label={t("removeFromGroup", { name: participant.name })}
                                  >
                                    -
                                  </button>
                                ) : null}
                              </span>
                            ) : null,
                          )}
                        </div>
                        {collaboration.canEdit && availableParticipants.length > 0 ? (
                          <select
                            className="mt-3 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                            value=""
                            onChange={(selectEvent) => {
                              if (selectEvent.target.value) {
                                void collaboration.moveParticipantToGroup(selectEvent.target.value, group.id);
                              }
                            }}
                          >
                            <option value="">{t("addParticipantToGroup")}</option>
                            {availableParticipants.map((participant) => (
                              <option key={participant.id} value={participant.id}>
                                {participant.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">{t("emptyGroups")}</p>
              )}
            </ReadOnlyCard>

            <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <ReadOnlyCard title={t("balances")}>
                <div className="divide-y divide-[var(--border)]">
                  {event.users.map((participant) => {
                    const amountCents = balances[participant.id] ?? 0;
                    return (
                      <div key={participant.id} className="flex items-center justify-between gap-3 py-3">
                        <span className="min-w-0 truncate text-sm font-medium text-zinc-900">{participant.name}</span>
                        <span className="shrink-0 text-sm font-semibold text-zinc-950">
                          {formatMoney(amountCents, locale)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ReadOnlyCard>

              <ReadOnlyCard title={t("debtSummary")}>
                {aggregatedDebts.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {aggregatedDebts.map((debt) => (
                      <div
                        key={`${debt.from.type}:${debt.from.id}-${debt.to.type}:${debt.to.id}`}
                        className="flex items-center justify-between gap-3 rounded-md bg-[var(--surface-subtle)] px-3 py-3"
                      >
                        <span className="min-w-0 text-sm text-zinc-900">
                          {t("debtLine", {
                            from: aggregateParticipantName(event, debt.from),
                            to: aggregateParticipantName(event, debt.to),
                          })}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-zinc-950">
                          {formatMoney(debt.amountCents, locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted)]">{t("allSettled")}</p>
                )}
              </ReadOnlyCard>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function ReadOnlyCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function formatSharedDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale.startsWith("ru") ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
