import { describe, expect, it } from "vitest";
import { applyMigrations, CURRENT_APP_STATE_VERSION } from "./index";

describe("app state migrations", () => {
  it("adds missing reminders and current version", () => {
    const migrated = applyMigrations({
      events: [],
      categories: [],
      settings: {},
    });

    expect(migrated.version).toBe(CURRENT_APP_STATE_VERSION);
    expect(migrated.reminders).toEqual([]);
  });

  it("rejects invalid state", () => {
    expect(() => applyMigrations(null)).toThrow();
  });
});
