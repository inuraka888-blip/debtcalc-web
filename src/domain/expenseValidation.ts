import type {
  Event,
  Expense,
  ExpenseId,
  ExpenseSplit,
  ExpenseSplitMode,
  ParticipantGroupId,
  UserId,
} from "./models";
import { addCents, assertValidAmountCents, splitEqually } from "./money";

export type ExpenseTarget =
  | { type: "participant"; id: UserId }
  | { type: "participantGroup"; id: ParticipantGroupId };

export interface ExpenseInput {
  title: string;
  amountCents: number;
  payer: ExpenseTarget | null;
  participants: ExpenseTarget[];
  splitMode: ExpenseSplitMode;
  customSplitAmountsCentsByTargetKey?: Record<string, number>;
  date: string;
  note?: string;
  categoryId?: string;
}

export type ExpenseValidationError =
  | "eventNotFound"
  | "expenseNotFound"
  | "titleEmpty"
  | "amountInvalidPositive"
  | "payerRequired"
  | "invalidPayer"
  | "participantsRequired"
  | "invalidParticipant"
  | "negativeSplit"
  | "paidByMismatch"
  | "splitMismatch"
  | "invalidDate";

export type ExpenseValidationResult =
  | { ok: true; expense: Expense }
  | { ok: false; error: ExpenseValidationError };

export function buildValidatedExpense(
  event: Event,
  expenseId: ExpenseId,
  input: ExpenseInput,
): ExpenseValidationResult {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "titleEmpty" };
  }

  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: "amountInvalidPositive" };
  }

  assertValidAmountCents(input.amountCents);

  if (!input.payer) {
    return { ok: false, error: "payerRequired" };
  }

  const payerParticipantIds = expandTarget(event, input.payer);
  if (payerParticipantIds.length === 0) {
    return { ok: false, error: "invalidPayer" };
  }

  if (input.participants.length === 0) {
    return { ok: false, error: "participantsRequired" };
  }

  const selectedParticipantIds = uniqueSorted(input.participants.flatMap((target) => expandTarget(event, target)));
  if (selectedParticipantIds.length === 0) {
    return { ok: false, error: "invalidParticipant" };
  }

  const paidBySplits = splitsFromParticipantAmounts(splitEqually(input.amountCents, payerParticipantIds));
  const splits =
    input.splitMode === "equal"
      ? splitsFromParticipantAmounts(splitEqually(input.amountCents, selectedParticipantIds))
      : buildCustomSplits(event, input);

  if (!splits) {
    return { ok: false, error: "splitMismatch" };
  }

  const normalizedDate = normalizeDate(input.date);
  if (!normalizedDate) {
    return { ok: false, error: "invalidDate" };
  }

  const expense: Expense = {
    id: expenseId,
    title,
    amountCents: input.amountCents,
    paidBySplits,
    splits,
    categoryId: input.categoryId,
    note: input.note?.trim() || undefined,
    splitMode: input.splitMode,
    date: normalizedDate,
  };

  return validateExpense(event, expense);
}

export function validateExpense(event: Event, expense: Expense): ExpenseValidationResult {
  const participantIds = new Set(event.users.map((participant) => participant.id));

  if (!expense.title.trim()) {
    return { ok: false, error: "titleEmpty" };
  }
  if (!Number.isSafeInteger(expense.amountCents) || expense.amountCents <= 0) {
    return { ok: false, error: "amountInvalidPositive" };
  }

  const paidTotal = sumSplits(expense.paidBySplits);
  const splitTotal = sumSplits(expense.splits);

  if (paidTotal === null || splitTotal === null) {
    return { ok: false, error: "negativeSplit" };
  }

  if (expense.paidBySplits.some((split) => !participantIds.has(split.participantId))) {
    return { ok: false, error: "invalidPayer" };
  }

  if (expense.splits.some((split) => !participantIds.has(split.participantId))) {
    return { ok: false, error: "invalidParticipant" };
  }

  if (paidTotal !== expense.amountCents) {
    return { ok: false, error: "paidByMismatch" };
  }

  if (splitTotal !== expense.amountCents) {
    return { ok: false, error: "splitMismatch" };
  }

  return { ok: true, expense };
}

export function targetKey(target: ExpenseTarget): string {
  return `${target.type}:${target.id}`;
}

export function expandTarget(event: Event, target: ExpenseTarget): UserId[] {
  if (target.type === "participant") {
    return event.users.some((participant) => participant.id === target.id) ? [target.id] : [];
  }

  return (
    event.participantGroups
      .find((participantGroup) => participantGroup.id === target.id)
      ?.participantIds.filter((participantId) =>
        event.users.some((participant) => participant.id === participantId),
      ) ?? []
  );
}

function buildCustomSplits(event: Event, input: ExpenseInput): ExpenseSplit[] | null {
  const customAmounts = input.customSplitAmountsCentsByTargetKey ?? {};
  const targetAmounts = input.participants.map((target) => ({
    target,
    amountCents: customAmounts[targetKey(target)] ?? 0,
  }));

  if (targetAmounts.some(({ amountCents }) => !Number.isSafeInteger(amountCents) || amountCents < 0)) {
    return null;
  }

  const targetTotal = addCents(...targetAmounts.map(({ amountCents }) => amountCents));
  if (targetTotal !== input.amountCents) {
    return null;
  }

  const participantAmounts: Record<UserId, number> = {};
  for (const { target, amountCents } of targetAmounts) {
    const participantIds = expandTarget(event, target);
    if (participantIds.length === 0 && amountCents > 0) {
      return null;
    }

    const splitAmounts = splitEqually(amountCents, participantIds);
    for (const [participantId, participantAmountCents] of Object.entries(splitAmounts)) {
      participantAmounts[participantId] = addCents(
        participantAmounts[participantId] ?? 0,
        participantAmountCents,
      );
    }
  }

  return splitsFromParticipantAmounts(participantAmounts);
}

function splitsFromParticipantAmounts(amountsByParticipantId: Record<UserId, number>): ExpenseSplit[] {
  return Object.entries(amountsByParticipantId)
    .filter(([, amountCents]) => amountCents > 0)
    .sort(([leftParticipantId], [rightParticipantId]) => leftParticipantId.localeCompare(rightParticipantId))
    .map(([participantId, amountCents]) => ({ participantId, amountCents }));
}

function sumSplits(splits: ExpenseSplit[]): number | null {
  let total = 0;
  for (const split of splits) {
    if (!Number.isSafeInteger(split.amountCents) || split.amountCents < 0) {
      return null;
    }

    total = addCents(total, split.amountCents);
  }

  return total;
}

function uniqueSorted(participantIds: UserId[]): UserId[] {
  return Array.from(new Set(participantIds)).sort((left, right) => left.localeCompare(right));
}

function normalizeDate(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsed = new Date(trimmedValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}
