import { describe, expect, it } from "vitest";
import { formatAwayStartedAt } from "../../../../src/domain/rules/awayPeriodFormat.js";

describe("formatAwayStartedAt", () => {
  it("formats a UTC ISO datetime string as JST (UTC+9) HH:MM, regardless of the runtime's local timezone", () => {
    expect(formatAwayStartedAt("2026-08-14T05:30:00.000Z")).toBe("14:30");
  });

  it("carries the date boundary correctly into the next JST day", () => {
    expect(formatAwayStartedAt("2026-08-14T20:15:00.000Z")).toBe("05:15");
  });
});
