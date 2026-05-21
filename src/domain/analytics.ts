import { categoryOrOther } from "./categories";
import type { Event, ExpenseCategory, UserId } from "./models";
import { addCents } from "./money";

export interface ChartSlice {
  id: string;
  title: string;
  amountCents: number;
  percentage: number;
  icon?: string;
}

export type AnalyticsDatePeriod = "day" | "month" | "year";

export function getCategorySlices(event: Event, categories: ExpenseCategory[]): ChartSlice[] {
  const categoryAmounts = new Map<string, { title: string; icon: string; amountCents: number }>();

  for (const expense of event.expenses) {
    const category = categoryOrOther(categories, expense.categoryId);
    const current = categoryAmounts.get(category.id) ?? {
      title: category.name,
      icon: category.icon,
      amountCents: 0,
    };

    categoryAmounts.set(category.id, {
      ...current,
      amountCents: addCents(current.amountCents, expense.amountCents),
    });
  }

  return toChartSlices(categoryAmounts);
}

export function getPayerSlices(event: Event): ChartSlice[] {
  const participantAmounts = participantAmountAccumulator(event);

  for (const expense of event.expenses) {
    for (const split of expense.paidBySplits) {
      addParticipantAmount(participantAmounts, split.participantId, split.amountCents);
    }
  }

  return toChartSlices(participantAmounts);
}

export function getSplitParticipantSlices(event: Event): ChartSlice[] {
  const participantAmounts = participantAmountAccumulator(event);

  for (const expense of event.expenses) {
    for (const split of expense.splits) {
      addParticipantAmount(participantAmounts, split.participantId, split.amountCents);
    }
  }

  return toChartSlices(participantAmounts);
}

export function getDateSlices(event: Event, period: AnalyticsDatePeriod): ChartSlice[] {
  const dateAmounts = new Map<string, { title: string; amountCents: number }>();

  for (const expense of event.expenses) {
    const key = dateKey(expense.date, period);
    const current = dateAmounts.get(key) ?? {
      title: key,
      amountCents: 0,
    };

    dateAmounts.set(key, {
      ...current,
      amountCents: addCents(current.amountCents, expense.amountCents),
    });
  }

  return toChartSlices(dateAmounts).sort((left, right) => left.id.localeCompare(right.id));
}

function participantAmountAccumulator(event: Event): Map<string, { title: string; amountCents: number }> {
  return new Map(
    event.users.map((participant) => [
      participant.id,
      {
        title: participant.name,
        amountCents: 0,
      },
    ]),
  );
}

function addParticipantAmount(
  participantAmounts: Map<string, { title: string; amountCents: number }>,
  participantId: UserId,
  amountCents: number,
) {
  const current = participantAmounts.get(participantId);
  if (!current) {
    return;
  }

  participantAmounts.set(participantId, {
    ...current,
    amountCents: addCents(current.amountCents, amountCents),
  });
}

function toChartSlices(
  amounts: Map<string, { title: string; amountCents: number; icon?: string }>,
): ChartSlice[] {
  const positiveSlices = Array.from(amounts.entries())
    .filter(([, value]) => value.amountCents > 0)
    .sort(([, left], [, right]) => {
      if (left.amountCents === right.amountCents) {
        return left.title.localeCompare(right.title);
      }

      return right.amountCents - left.amountCents;
    });
  const totalCents = positiveSlices.reduce((sum, [, value]) => addCents(sum, value.amountCents), 0);

  return positiveSlices.map(([id, value]) => ({
    id,
    title: value.title,
    amountCents: value.amountCents,
    percentage: totalCents > 0 ? (value.amountCents / totalCents) * 100 : 0,
    icon: value.icon,
  }));
}

function dateKey(value: string, period: AnalyticsDatePeriod): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (period === "year") {
    return String(year);
  }
  if (period === "month") {
    return `${year}-${month}`;
  }

  return `${year}-${month}-${day}`;
}
