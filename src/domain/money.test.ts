import { describe, expect, it } from "vitest";
import { parseMoneyToCents, splitEqually } from "./money";

describe("money utilities", () => {
  it("parses money into integer cents", () => {
    expect(parseMoneyToCents("10.50")).toBe(1050);
    expect(parseMoneyToCents("10,50")).toBe(1050);
    expect(parseMoneyToCents("0")).toBeNull();
  });

  it("splits cents deterministically", () => {
    expect(splitEqually(100, ["b", "a", "c"])).toEqual({
      a: 34,
      b: 33,
      c: 33,
    });
  });
});
