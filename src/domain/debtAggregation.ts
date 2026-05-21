import type { Debt, Event, ParticipantGroupId, UserId } from "./models";
import { addCents } from "./money";

export type AggregateParticipant =
  | { type: "participant"; id: UserId }
  | { type: "participantGroup"; id: ParticipantGroupId };

export interface AggregatedDebt {
  from: AggregateParticipant;
  to: AggregateParticipant;
  amountCents: number;
}

export function aggregateDebtsByParticipantGroups(event: Event, debts: Debt[]): AggregatedDebt[] {
  const aggregatedAmounts = new Map<string, AggregatedDebt>();

  for (const debt of debts) {
    const from = aggregateParticipantForParticipantId(event, debt.from);
    const to = aggregateParticipantForParticipantId(event, debt.to);

    if (aggregateParticipantKey(from) === aggregateParticipantKey(to)) {
      continue;
    }

    const key = `${aggregateParticipantKey(from)}->${aggregateParticipantKey(to)}`;
    const existingDebt = aggregatedAmounts.get(key);
    if (existingDebt) {
      aggregatedAmounts.set(key, {
        ...existingDebt,
        amountCents: addCents(existingDebt.amountCents, debt.amountCents),
      });
    } else {
      aggregatedAmounts.set(key, {
        from,
        to,
        amountCents: debt.amountCents,
      });
    }
  }

  return Array.from(aggregatedAmounts.values())
    .filter((debt) => debt.amountCents > 0)
    .sort((left, right) => {
      const leftFrom = aggregateParticipantName(event, left.from);
      const rightFrom = aggregateParticipantName(event, right.from);
      if (leftFrom === rightFrom) {
        return aggregateParticipantName(event, left.to).localeCompare(aggregateParticipantName(event, right.to));
      }

      return leftFrom.localeCompare(rightFrom);
    });
}

export function aggregateParticipantName(event: Event, participant: AggregateParticipant): string {
  if (participant.type === "participantGroup") {
    return (
      event.participantGroups.find((participantGroup) => participantGroup.id === participant.id)?.name ??
      "Unknown group"
    );
  }

  return event.users.find((user) => user.id === participant.id)?.name ?? "Unknown participant";
}

function aggregateParticipantForParticipantId(event: Event, participantId: UserId): AggregateParticipant {
  const participantGroup = event.participantGroups.find((group) => group.participantIds.includes(participantId));
  if (participantGroup) {
    return {
      type: "participantGroup",
      id: participantGroup.id,
    };
  }

  return {
    type: "participant",
    id: participantId,
  };
}

function aggregateParticipantKey(participant: AggregateParticipant): string {
  return `${participant.type}:${participant.id}`;
}
