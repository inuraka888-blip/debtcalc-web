import type { Event } from "./models";

export const sampleGroup: Event = {
  id: "group-trip-kazan",
  name: "Trip to Kazan",
  users: [
    { id: "user-alice", name: "Alice" },
    { id: "user-bob", name: "Bob" },
    { id: "user-clara", name: "Clara" },
    { id: "user-daniel", name: "Daniel" },
  ],
  participantGroups: [
    {
      id: "participant-group-friends",
      name: "Friends",
      participantIds: ["user-alice", "user-bob", "user-clara"],
    },
  ],
  expenses: [
    {
      id: "expense-dinner",
      title: "Dinner",
      amountCents: 9000,
      splitMode: "equal",
      paidBySplits: [{ participantId: "user-alice", amountCents: 9000 }],
      splits: [
        { participantId: "user-alice", amountCents: 3000 },
        { participantId: "user-bob", amountCents: 3000 },
        { participantId: "user-clara", amountCents: 3000 },
      ],
      date: new Date().toISOString(),
      categoryId: undefined,
      note: undefined,
    },
  ],
};

export const aggregateDebtSampleEvent: Event = {
  id: "event-aggregate-debt-sample",
  name: "Aggregate debt sample",
  users: [
    { id: "participant-ainur", name: "Ainur" },
    { id: "participant-peter", name: "Peter" },
    { id: "participant-victor", name: "Victor" },
    { id: "participant-sasha", name: "Sasha" },
  ],
  participantGroups: [
    {
      id: "participant-group-trio",
      name: "Trio",
      participantIds: ["participant-peter", "participant-victor", "participant-sasha"],
    },
  ],
  expenses: [
    {
      id: "expense-aggregate-sample",
      title: "Shared expense",
      amountCents: 237800,
      splitMode: "custom",
      paidBySplits: [{ participantId: "participant-ainur", amountCents: 237800 }],
      splits: [
        { participantId: "participant-ainur", amountCents: 60100 },
        { participantId: "participant-peter", amountCents: 59234 },
        { participantId: "participant-victor", amountCents: 59233 },
        { participantId: "participant-sasha", amountCents: 59233 },
      ],
      date: new Date().toISOString(),
      categoryId: undefined,
      note: "Expected Debt Summary: Trio owes Ainur.",
    },
  ],
};
