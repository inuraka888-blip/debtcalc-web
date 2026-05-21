"use client";

import { FormEvent, PointerEvent, TouchEvent, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { importEventBundleFromCSV } from "@/domain/csv";
import type { Event } from "@/domain/models";
import { Link } from "@/i18n/routing";
import { useEventsStore } from "@/store/eventsStore";
import type { EventMutationError } from "@/store/eventsStore";

export function EventsScreen() {
  const t = useTranslations("events");
  const commonT = useTranslations("common");
  const errorsT = useTranslations("errors");
  const events = useEventsStore((state) => state.events);
  const loadFromStorage = useEventsStore((state) => state.loadFromStorage);
  const addEvent = useEventsStore((state) => state.addEvent);
  const updateEvent = useEventsStore((state) => state.updateEvent);
  const deleteEvent = useEventsStore((state) => state.deleteEvent);
  const importEvent = useEventsStore((state) => state.importEvent);
  const setActiveEvent = useEventsStore((state) => state.setActiveEvent);
  const ensureSeedData = useEventsStore((state) => state.ensureSeedData);
  const [eventName, setEventName] = useState("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventName, setEditingEventName] = useState("");
  const [actionsEventId, setActionsEventId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadFromStorage().then(() => ensureSeedData());
  }, [ensureSeedData, loadFromStorage]);

  function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventName.trim()) {
      setError(eventErrorMessage("eventNameEmpty", errorsT));
      return;
    }
    addEvent(eventName);
    setEventName("");
    setIsCreateDialogOpen(false);
    setError(null);
  }

  function openCreateDialog() {
    setEventName("");
    setIsAddMenuOpen(false);
    setIsCreateDialogOpen(true);
    setError(null);
  }

  function startEditing(event: Event) {
    setEditingEventId(event.id);
    setEditingEventName(event.name);
    setActionsEventId(null);
    setError(null);
  }

  function cancelEditing() {
    setEditingEventId(null);
    setEditingEventName("");
    setError(null);
  }

  function handleUpdateEvent(formEvent: FormEvent<HTMLFormElement>, eventId: string) {
    formEvent.preventDefault();

    const result = updateEvent(eventId, editingEventName);
    if (!result.ok) {
      setError(eventErrorMessage(result.error, errorsT));
      return;
    }

    cancelEditing();
  }

  function handleDeleteEvent(event: Event) {
    if (!window.confirm(t("confirmDeleteEvent", { name: event.name }))) {
      return;
    }

    const result = deleteEvent(event.id);
    if (!result.ok) {
      setError(eventErrorMessage(result.error, errorsT));
      return;
    }

    if (editingEventId === event.id) {
      cancelEditing();
    }
    setActionsEventId(null);
    setError(null);
  }

  async function handleImportEvent(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const csvText = await file.text();
      const imported = importEventBundleFromCSV(csvText);
      importEvent(imported.event, imported.categories);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("importFailed"));
    }
  }

  return (
    <main
      className="min-h-screen px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 lg:px-8"
      onClick={() => setIsAddMenuOpen(false)}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 sm:max-w-2xl">
        <header className="relative flex min-h-24 flex-col justify-end">
          <div className="absolute left-0 top-0">
            <Link
              href="/settings"
              aria-label={commonT("settings")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-50"
            >
              ⚙
            </Link>
          </div>
          <div className="absolute right-0 top-0">
            <button
              type="button"
              aria-label={t("addMenu")}
              onClick={(event) => {
                event.stopPropagation();
                setIsAddMenuOpen((isOpen) => !isOpen);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-3xl font-light leading-none text-zinc-950 shadow-sm transition hover:bg-zinc-50"
            >
              +
            </button>
            {isAddMenuOpen ? (
              <div
                className="absolute right-0 top-14 z-20 w-64 overflow-hidden rounded-[28px] bg-white/95 py-2 shadow-2xl ring-1 ring-black/5 backdrop-blur"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="block w-full px-7 py-3 text-left text-base font-medium text-zinc-950 transition hover:bg-zinc-100"
                >
                  {t("importCsv")}
                </button>
                <button
                  type="button"
                  onClick={openCreateDialog}
                  className="block w-full px-7 py-3 text-left text-base font-medium text-zinc-950 transition hover:bg-zinc-100"
                >
                  {t("addEvent")}
                </button>
              </div>
            ) : null}
          </div>
          <h1 className="text-4xl font-bold tracking-normal text-zinc-950 sm:text-5xl">{t("title")}</h1>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              void handleImportEvent(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </header>

        {isCreateDialogOpen ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/25 px-5 backdrop-blur-[1px]">
            <form
              className="w-full max-w-sm rounded-[32px] bg-white p-5 shadow-2xl"
              onSubmit={handleCreateEvent}
            >
              <h2 className="text-lg font-bold text-zinc-950">{t("addEvent")}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{t("addEventDescription")}</p>
              <input
                value={eventName}
                onChange={(event) => setEventName(event.target.value)}
                placeholder={t("eventName")}
                autoFocus
                className="mt-5 h-12 w-full rounded-full border border-transparent bg-zinc-200 px-4 text-base outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white"
              />
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setEventName("");
                  }}
                  className="h-12 rounded-full bg-zinc-200 text-base font-semibold text-zinc-950 transition hover:bg-zinc-300"
                >
                  {commonT("cancel")}
                </button>
                <button
                  type="submit"
                  className="h-12 rounded-full bg-zinc-200 text-base font-semibold text-zinc-950 transition hover:bg-zinc-300"
                >
                  {t("add")}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
        ) : null}

        <section className="overflow-hidden rounded-[26px] bg-white shadow-sm">
          <div className="divide-y divide-zinc-100">
            {events.length > 0 ? (
              events.map((event) => (
                <EventListItem
                  key={event.id}
                  event={event}
                  isEditing={editingEventId === event.id}
                  editingName={editingEventName}
                  actionsOpen={actionsEventId === event.id}
                  onEditingNameChange={setEditingEventName}
                  onSetActive={() => setActiveEvent(event.id)}
                  onOpenActions={() => setActionsEventId(event.id)}
                  onCloseActions={() => setActionsEventId(null)}
                  onEdit={() => startEditing(event)}
                  onCancelEdit={cancelEditing}
                  onSave={(formEvent) => handleUpdateEvent(formEvent, event.id)}
                  onDelete={() => handleDeleteEvent(event)}
                />
              ))
            ) : (
              <p className="p-5 text-sm text-[var(--muted)]">
                {t("empty")}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function EventListItem({
  event,
  isEditing,
  editingName,
  actionsOpen,
  onEditingNameChange,
  onSetActive,
  onOpenActions,
  onCloseActions,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  event: Event;
  isEditing: boolean;
  editingName: string;
  actionsOpen: boolean;
  onEditingNameChange: (name: string) => void;
  onSetActive: () => void;
  onOpenActions: () => void;
  onCloseActions: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("events");
  const longPressTimerRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handlePointerDown(pointerEvent: PointerEvent) {
    if (pointerEvent.pointerType === "mouse") {
      return;
    }

    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      onOpenActions();
    }, 520);
  }

  function handlePointerEnd() {
    clearLongPressTimer();
  }

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
    if (deltaX < -48) {
      suppressClickRef.current = true;
      onOpenActions();
      return;
    }

    if (deltaX > 48) {
      onCloseActions();
    }
  }

  if (isEditing) {
    return (
      <form className="grid gap-2 rounded-md border border-[var(--accent)] bg-teal-50 p-2 sm:grid-cols-[1fr_auto_auto]" onSubmit={onSave}>
        <input
          value={editingName}
          onChange={(event) => onEditingNameChange(event.target.value)}
          className="min-w-0 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
          autoFocus
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          {t("saveEvent")}
        </button>
        <button
          type="button"
          onClick={onCancelEdit}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
        >
          {t("cancelEventEdit")}
        </button>
      </form>
    );
  }

  return (
    <div className="overflow-hidden bg-white">
      <div className="grid grid-cols-[1fr_auto]">
        <Link
          href={`/events/${event.id}`}
          onClick={(clickEvent) => {
            if (suppressClickRef.current) {
              clickEvent.preventDefault();
              suppressClickRef.current = false;
              return;
            }
            onSetActive();
          }}
          onContextMenu={(contextMenuEvent) => {
            contextMenuEvent.preventDefault();
            onOpenActions();
          }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`flex min-h-[76px] min-w-0 items-center justify-between gap-3 bg-white px-5 py-4 text-left transition ${
            actionsOpen ? "-translate-x-1" : "translate-x-0"
          }`}
        >
          <span className="min-w-0">
            <span className="block truncate text-lg font-bold leading-tight text-zinc-950">{event.name}</span>
            <span className="mt-1 block truncate text-sm text-zinc-500">
              {t("participantsExpenses", {
                participants: event.users.length,
                expenses: event.expenses.length,
              })}
            </span>
          </span>
          <span className="shrink-0 text-3xl font-light text-zinc-300">›</span>
        </Link>
        <div className={`flex overflow-hidden transition-all ${actionsOpen ? "w-36 opacity-100" : "w-0 opacity-0"}`}>
          {actionsOpen ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="w-[72px] bg-zinc-900 px-3 text-sm font-medium text-white"
              >
                {t("editEvent")}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="w-[72px] bg-[var(--danger)] px-3 text-sm font-medium text-white"
              >
                {t("deleteEvent")}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function eventErrorMessage(error: EventMutationError, t: (key: string) => string): string {
  switch (error) {
    case "eventNotFound":
      return t("eventNotFound");
    case "eventNameEmpty":
      return t("eventNameEmpty");
    case "eventAlreadyExists":
      return t("eventAlreadyExists");
  }
}
