"use client";

import { FormEvent, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { OTHER_CATEGORY_ID } from "@/domain/categories";
import type { Event, Expense, ExpenseCategory, ExpenseSplitMode } from "@/domain/models";
import { targetKey } from "@/domain/expenseValidation";
import type { ExpenseInput, ExpenseTarget } from "@/domain/expenseValidation";
import { parseMoneyToCents, parseNonNegativeMoneyToCents } from "@/domain/money";

interface ExpenseFormProps {
  event: Event;
  categories: ExpenseCategory[];
  initialExpense?: Expense;
  onSubmit: (input: ExpenseInput) => boolean;
  onCancel: () => void;
}

export function ExpenseForm({ event, categories, initialExpense, onSubmit, onCancel }: ExpenseFormProps) {
  const t = useTranslations("expenses");
  const commonT = useTranslations("common");
  const errorsT = useTranslations("errors");
  const targetOptions = useMemo(() => buildTargetOptions(event), [event]);
  const initialInput = useMemo(
    () => (initialExpense ? expenseToFormInput(event, initialExpense) : null),
    [event, initialExpense],
  );

  const [title, setTitle] = useState(initialExpense?.title ?? "");
  const [amount, setAmount] = useState(initialExpense ? centsToInput(initialExpense.amountCents) : "");
  const [payerKey, setPayerKey] = useState(initialInput?.payerKey ?? "");
  const [selectedTargetKeys, setSelectedTargetKeys] = useState<Set<string>>(
    () => new Set(initialInput?.selectedTargetKeys ?? []),
  );
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>(initialExpense?.splitMode ?? "equal");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(initialInput?.customAmounts ?? {});
  const [date, setDate] = useState(toDateInputValue(initialExpense?.date ?? new Date().toISOString()));
  const [categoryId, setCategoryId] = useState(initialExpense?.categoryId ?? OTHER_CATEGORY_ID);
  const [note, setNote] = useState(initialExpense?.note ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  function toggleTarget(key: string) {
    setSelectedTargetKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    const amountCents = parseMoneyToCents(amount);
    if (!amountCents) {
      setFormError(errorsT("amountInvalidPositive"));
      return;
    }

    const payer = targetOptions.find((option) => option.key === payerKey)?.target ?? null;
    const participants = targetOptions
      .filter((option) => selectedTargetKeys.has(option.key))
      .map((option) => option.target);

    const customSplitAmountsCentsByTargetKey: Record<string, number> = {};
    if (splitMode === "custom") {
      for (const key of selectedTargetKeys) {
        const rawAmount = customAmounts[key]?.trim();
        const parsedAmount = rawAmount ? parseNonNegativeMoneyToCents(rawAmount) : 0;
        if (parsedAmount === null) {
          setFormError(errorsT("customSplitInvalid"));
          return;
        }

        customSplitAmountsCentsByTargetKey[key] = parsedAmount;
      }
    }

    const didSubmit = onSubmit({
      title,
      amountCents,
      payer,
      participants,
      splitMode,
      customSplitAmountsCentsByTargetKey,
      categoryId,
      date,
      note,
    });

    if (didSubmit) {
      setFormError(null);
    }
  }

  return (
    <form className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-zinc-950">
          {initialExpense ? t("editExpense") : t("addExpense")}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
        >
          {commonT("cancel")}
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:mt-5">
        <label className="grid gap-1 text-sm font-medium text-zinc-900">
          {t("title")}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-zinc-900">
            {t("amount")}
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-zinc-900">
            {t("date")}
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
            />
          </label>
        </div>

        <label className="grid gap-1 text-sm font-medium text-zinc-900">
          {t("category")}
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon} {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium text-zinc-900">
          {t("paidBy")}
          <select
            value={payerKey}
            onChange={(event) => setPayerKey(event.target.value)}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
          >
            <option value="">{t("selectPayer")}</option>
            {targetOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium text-zinc-900">{t("participants")}</legend>
          <div className="grid gap-2">
            {targetOptions.map((option) => (
              <label
                key={option.key}
                className="grid min-h-11 grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedTargetKeys.has(option.key)}
                    onChange={() => toggleTarget(option.key)}
                    className="h-5 w-5 shrink-0"
                  />
                  <span className="truncate">{option.label}</span>
                </span>
                {splitMode === "custom" && selectedTargetKeys.has(option.key) ? (
                  <input
                    inputMode="decimal"
                    value={customAmounts[option.key] ?? ""}
                    onChange={(event) =>
                      setCustomAmounts((current) => ({ ...current, [option.key]: event.target.value }))
                    }
                    placeholder="0.00"
                    className="w-24 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100 sm:w-28"
                  />
                ) : null}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid grid-cols-2 gap-2 sm:flex">
          <legend className="sr-only">{t("splitMode")}</legend>
          {(["equal", "custom"] as const).map((mode) => (
            <label
              key={mode}
              className={`flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium ${
                splitMode === mode
                  ? "border-[var(--accent)] bg-teal-50 text-[var(--accent-strong)]"
                  : "border-[var(--border)] text-zinc-800"
              }`}
            >
              <input
                type="radio"
                name="splitMode"
                value={mode}
                checked={splitMode === mode}
                onChange={() => setSplitMode(mode)}
                className="sr-only"
              />
              {t(mode)}
            </label>
          ))}
        </fieldset>

        <label className="grid gap-1 text-sm font-medium text-zinc-900">
          {t("note")}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="resize-none rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
          />
        </label>
      </div>

      {formError ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{formError}</p>
      ) : null}

      <button
        type="submit"
        className="mt-5 w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] sm:w-auto"
      >
        {initialExpense ? t("saveExpense") : t("addExpense")}
      </button>
    </form>
  );
}

function buildTargetOptions(event: Event) {
  return [
    ...event.users.map((participant) => ({
      key: targetKey({ type: "participant", id: participant.id }),
      label: participant.name,
      target: { type: "participant", id: participant.id } satisfies ExpenseTarget,
    })),
    ...event.participantGroups.map((participantGroup) => ({
      key: targetKey({ type: "participantGroup", id: participantGroup.id }),
      label: participantGroup.name,
      target: { type: "participantGroup", id: participantGroup.id } satisfies ExpenseTarget,
    })),
  ];
}

function expenseToFormInput(event: Event, expense: Expense) {
  const payerKey = keyForSplits(event, expense.paidBySplits.map((split) => split.participantId));
  const splitTargetKeys = keysForParticipantSet(
    event,
    expense.splits.map((split) => split.participantId),
  );
  const splitAmounts = new Map(expense.splits.map((split) => [split.participantId, split.amountCents]));
  const customAmounts = Object.fromEntries(
    splitTargetKeys.map((key) => {
      const target = parseTargetKey(key);
      if (!target) {
        return [key, ""];
      }

      const participantIds =
        target.type === "participant"
          ? [target.id]
          : event.participantGroups.find((participantGroup) => participantGroup.id === target.id)?.participantIds ?? [];
      const amountCents = participantIds.reduce((sum, participantId) => sum + (splitAmounts.get(participantId) ?? 0), 0);
      return [key, amountCents > 0 ? centsToInput(amountCents) : ""];
    }),
  );

  return {
    payerKey,
    selectedTargetKeys: splitTargetKeys,
    customAmounts,
  };
}

function keyForSplits(event: Event, participantIds: string[]): string {
  const sortedParticipantIds = [...participantIds].sort();
  const matchingGroup = event.participantGroups.find(
    (participantGroup) => participantGroup.participantIds.length > 0 && sameSet(participantGroup.participantIds, sortedParticipantIds),
  );

  if (matchingGroup) {
    return targetKey({ type: "participantGroup", id: matchingGroup.id });
  }

  return sortedParticipantIds[0] ? targetKey({ type: "participant", id: sortedParticipantIds[0] }) : "";
}

function keysForParticipantSet(event: Event, participantIds: string[]): string[] {
  const remaining = new Set(participantIds);
  const keys: string[] = [];

  for (const participantGroup of event.participantGroups) {
    if (
      participantGroup.participantIds.length > 0 &&
      participantGroup.participantIds.every((participantId) => remaining.has(participantId))
    ) {
      keys.push(targetKey({ type: "participantGroup", id: participantGroup.id }));
      participantGroup.participantIds.forEach((participantId) => remaining.delete(participantId));
    }
  }

  for (const participantId of Array.from(remaining).sort()) {
    keys.push(targetKey({ type: "participant", id: participantId }));
  }

  return keys;
}

function parseTargetKey(key: string): ExpenseTarget | null {
  const [type, id] = key.split(":");
  if ((type === "participant" || type === "participantGroup") && id) {
    return { type, id };
  }

  return null;
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function centsToInput(amountCents: number): string {
  const sign = amountCents < 0 ? "-" : "";
  const absolute = Math.abs(amountCents);
  const units = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, "0");
  return `${sign}${units}.${cents}`;
}

function toDateInputValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}
