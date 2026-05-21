import { categoryOrOther } from "./categories";
import type { Event, Expense, ExpenseCategory, ParticipantGroupId, UserId } from "./models";

export type ExpenseSortOption =
  | "dateNewestFirst"
  | "dateOldestFirst"
  | "categoryAZ"
  | "categoryZA"
  | "amountLowToHigh"
  | "amountHighToLow";

export type ExpenseDateFilter = "all" | "thisMonth" | "lastMonth" | "thisYear";

export type ExpensePayerFilter =
  | { type: "all" }
  | { type: "participant"; id: UserId }
  | { type: "participantGroup"; id: ParticipantGroupId };

export interface ExpenseFilters {
  categoryId: string | "all";
  payer: ExpensePayerFilter;
  date: ExpenseDateFilter;
}

export const defaultExpenseFilters: ExpenseFilters = {
  categoryId: "all",
  payer: { type: "all" },
  date: "all",
};

export function getVisibleExpenses(
  event: Event,
  categories: ExpenseCategory[],
  filters: ExpenseFilters,
  sortOption: ExpenseSortOption,
): Expense[] {
  return event.expenses
    .filter((expense) => matchesCategoryFilter(expense, categories, filters.categoryId))
    .filter((expense) => matchesPayerFilter(event, expense, filters.payer))
    .filter((expense) => matchesDateFilter(expense, filters.date))
    .slice()
    .sort((left, right) => compareExpenses(left, right, event, categories, sortOption));
}

export function hasActiveExpenseFilters(filters: ExpenseFilters): boolean {
  return filters.categoryId !== "all" || filters.payer.type !== "all" || filters.date !== "all";
}

function matchesCategoryFilter(
  expense: Expense,
  categories: ExpenseCategory[],
  categoryId: string | "all",
): boolean {
  if (categoryId === "all") {
    return true;
  }

  return categoryOrOther(categories, expense.categoryId).id === categoryId;
}

function matchesPayerFilter(event: Event, expense: Expense, payer: ExpensePayerFilter): boolean {
  if (payer.type === "all") {
    return true;
  }

  const payerIds = new Set(expense.paidBySplits.map((split) => split.participantId));
  if (payer.type === "participant") {
    return payerIds.has(payer.id);
  }

  const participantGroup = event.participantGroups.find((group) => group.id === payer.id);
  if (!participantGroup) {
    return false;
  }

  return participantGroup.participantIds.some((participantId) => payerIds.has(participantId));
}

function matchesDateFilter(expense: Expense, dateFilter: ExpenseDateFilter): boolean {
  if (dateFilter === "all") {
    return true;
  }

  const expenseDate = new Date(expense.date);
  if (Number.isNaN(expenseDate.getTime())) {
    return false;
  }

  const now = new Date();
  if (dateFilter === "thisMonth") {
    return expenseDate.getFullYear() === now.getFullYear() && expenseDate.getMonth() === now.getMonth();
  }

  if (dateFilter === "lastMonth") {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return (
      expenseDate.getFullYear() === lastMonth.getFullYear() &&
      expenseDate.getMonth() === lastMonth.getMonth()
    );
  }

  return expenseDate.getFullYear() === now.getFullYear();
}

function compareExpenses(
  left: Expense,
  right: Expense,
  event: Event,
  categories: ExpenseCategory[],
  sortOption: ExpenseSortOption,
): number {
  switch (sortOption) {
    case "dateNewestFirst":
      return compareDate(right, left);
    case "dateOldestFirst":
      return compareDate(left, right);
    case "categoryAZ":
      return compareCategory(left, right, categories);
    case "categoryZA":
      return compareCategory(right, left, categories);
    case "amountLowToHigh":
      return left.amountCents - right.amountCents || compareDate(right, left);
    case "amountHighToLow":
      return right.amountCents - left.amountCents || compareDate(right, left);
  }
}

function compareDate(left: Expense, right: Expense): number {
  const leftTime = new Date(left.date).getTime();
  const rightTime = new Date(right.date).getTime();
  const normalizedLeftTime = Number.isNaN(leftTime) ? 0 : leftTime;
  const normalizedRightTime = Number.isNaN(rightTime) ? 0 : rightTime;

  return normalizedLeftTime - normalizedRightTime || left.title.localeCompare(right.title);
}

function compareCategory(left: Expense, right: Expense, categories: ExpenseCategory[]): number {
  const leftCategory = categoryOrOther(categories, left.categoryId).name;
  const rightCategory = categoryOrOther(categories, right.categoryId).name;

  return leftCategory.localeCompare(rightCategory) || compareDate(right, left);
}
