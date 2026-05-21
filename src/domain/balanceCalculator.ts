import type { Debt, Group, UserId } from "./models";
import { addCents, assertValidAmountCents } from "./money";

export type BalanceMap = Record<UserId, number>;

export type BalanceCalculatorErrorCode =
  | "invalidPayer"
  | "invalidParticipant"
  | "negativeSplit"
  | "paidByMismatch"
  | "splitMismatch"
  | "nonZeroResidual";

export class BalanceCalculatorError extends Error {
  constructor(
    public readonly code: BalanceCalculatorErrorCode,
    public readonly expenseTitle?: string,
  ) {
    super(createBalanceErrorMessage(code, expenseTitle));
    this.name = "BalanceCalculatorError";
  }
}

export function calculateBalances(group: Group): BalanceMap {
  validateGroupForBalances(group);

  const balances: BalanceMap = Object.fromEntries(group.users.map((user) => [user.id, 0]));

  for (const expense of group.expenses) {
    for (const payer of expense.paidBySplits) {
      balances[payer.participantId] = addCents(balances[payer.participantId] ?? 0, payer.amountCents);
    }

    for (const split of expense.splits) {
      balances[split.participantId] = addCents(balances[split.participantId] ?? 0, -split.amountCents);
    }
  }

  const residual = addCents(...Object.values(balances));
  if (residual !== 0) {
    throw new BalanceCalculatorError("nonZeroResidual");
  }

  return balances;
}

export function calculateDebts(group: Group): Debt[] {
  const balances = calculateBalances(group);

  const creditors = Object.entries(balances)
    .filter(([, amountCents]) => amountCents > 0)
    .map(([id, amountCents]) => ({ id, amountCents }))
    .sort(compareCreditors);

  const debtors = Object.entries(balances)
    .filter(([, amountCents]) => amountCents < 0)
    .map(([id, amountCents]) => ({ id, amountCents }))
    .sort(compareDebtors);

  const debts: Debt[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const transferCents = Math.min(-debtor.amountCents, creditor.amountCents);

    if (transferCents > 0) {
      debts.push({
        id: `${debtor.id}-${creditor.id}-${transferCents}`,
        from: debtor.id,
        to: creditor.id,
        amountCents: transferCents,
      });
    }

    debtor.amountCents += transferCents;
    creditor.amountCents -= transferCents;

    if (debtor.amountCents === 0) {
      debtorIndex += 1;
    }
    if (creditor.amountCents === 0) {
      creditorIndex += 1;
    }
  }

  return debts;
}

export function validateGroupForBalances(group: Group): void {
  const userIds = new Set(group.users.map((user) => user.id));

  for (const expense of group.expenses) {
    assertValidAmountCents(expense.amountCents);

    let paidTotal = 0;
    for (const payer of expense.paidBySplits) {
      if (!userIds.has(payer.participantId)) {
        throw new BalanceCalculatorError("invalidPayer", expense.title);
      }
      if (payer.amountCents < 0) {
        throw new BalanceCalculatorError("negativeSplit", expense.title);
      }
      paidTotal = addCents(paidTotal, payer.amountCents);
    }

    let splitTotal = 0;
    for (const split of expense.splits) {
      if (!userIds.has(split.participantId)) {
        throw new BalanceCalculatorError("invalidParticipant", expense.title);
      }
      if (split.amountCents < 0) {
        throw new BalanceCalculatorError("negativeSplit", expense.title);
      }
      splitTotal = addCents(splitTotal, split.amountCents);
    }

    if (paidTotal !== expense.amountCents) {
      throw new BalanceCalculatorError("paidByMismatch", expense.title);
    }
    if (splitTotal !== expense.amountCents) {
      throw new BalanceCalculatorError("splitMismatch", expense.title);
    }
  }
}

function compareCreditors(
  left: { id: string; amountCents: number },
  right: { id: string; amountCents: number },
): number {
  if (left.amountCents === right.amountCents) {
    return left.id.localeCompare(right.id);
  }
  return right.amountCents - left.amountCents;
}

function compareDebtors(
  left: { id: string; amountCents: number },
  right: { id: string; amountCents: number },
): number {
  if (left.amountCents === right.amountCents) {
    return left.id.localeCompare(right.id);
  }
  return left.amountCents - right.amountCents;
}

function createBalanceErrorMessage(code: BalanceCalculatorErrorCode, expenseTitle?: string): string {
  const suffix = expenseTitle ? ` for ${expenseTitle}` : "";

  switch (code) {
    case "invalidPayer":
      return `Expense payer is not part of the group${suffix}.`;
    case "invalidParticipant":
      return `Expense participant is not part of the group${suffix}.`;
    case "negativeSplit":
      return `Expense split cannot be negative${suffix}.`;
    case "paidByMismatch":
      return `Paid-by total does not match expense amount${suffix}.`;
    case "splitMismatch":
      return `Expense total and split total do not match${suffix}.`;
    case "nonZeroResidual":
      return "Balances do not sum to zero.";
  }
}
