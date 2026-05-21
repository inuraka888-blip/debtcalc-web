import { describe, expect, it } from "vitest";
import { calculateBalances, calculateDebts } from "./balanceCalculator";
import type { Event } from "./models";

const event: Event = {
  id: "event-1",
  name: "Trip",
  users: [
    { id: "alice", name: "Alice" },
    { id: "bob", name: "Bob" },
  ],
  participantGroups: [],
  expenses: [
    {
      id: "expense-1",
      title: "Dinner",
      amountCents: 1000,
      paidBySplits: [{ participantId: "alice", amountCents: 1000 }],
      splits: [
        { participantId: "alice", amountCents: 500 },
        { participantId: "bob", amountCents: 500 },
      ],
      splitMode: "equal",
      date: "2026-05-20",
    },
  ],
};

describe("balance calculator", () => {
  it("calculates participant balances", () => {
    expect(calculateBalances(event)).toEqual({
      alice: 500,
      bob: -500,
    });
  });

  it("calculates debts", () => {
    expect(calculateDebts(event)).toEqual([
      {
        id: "bob-alice-500",
        from: "bob",
        to: "alice",
        amountCents: 500,
      },
    ]);
  });
});
