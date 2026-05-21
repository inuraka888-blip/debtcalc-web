import { describe, expect, it } from "vitest";
import { getCategorySlices } from "./analytics";
import type { Event, ExpenseCategory } from "./models";

describe("analytics helpers", () => {
  it("returns empty slices without NaN percentages", () => {
    const event: Event = {
      id: "event-1",
      name: "Empty",
      users: [],
      participantGroups: [],
      expenses: [],
    };
    const categories: ExpenseCategory[] = [{ id: "other", name: "Other", icon: "◼️" }];

    expect(getCategorySlices(event, categories)).toEqual([]);
  });
});
