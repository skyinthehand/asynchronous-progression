import { describe, expect, it } from "vitest";
import {
  STALE_THRESHOLD_MS,
  deriveIsStale,
} from "../../../../src/features/sync/syncStatusRules.js";

describe("deriveIsStale", () => {
  it("is not stale when there are no pending changes", () => {
    expect(deriveIsStale({ lastSuccessAt: null, pendingChangeCount: 0 })).toBe(
      false,
    );
  });

  it("is stale when there are pending changes but no successful sync yet", () => {
    expect(deriveIsStale({ lastSuccessAt: null, pendingChangeCount: 3 })).toBe(
      true,
    );
  });

  it("is not stale when within the threshold since the last success", () => {
    const now = new Date("2026-01-01T00:10:00.000Z");
    const lastSuccessAt = new Date(
      now.getTime() - (STALE_THRESHOLD_MS - 1000),
    ).toISOString();
    expect(deriveIsStale({ lastSuccessAt, pendingChangeCount: 2, now })).toBe(
      false,
    );
  });

  it("is stale once the threshold since the last success has elapsed", () => {
    const now = new Date("2026-01-01T00:10:00.000Z");
    const lastSuccessAt = new Date(
      now.getTime() - STALE_THRESHOLD_MS,
    ).toISOString();
    expect(deriveIsStale({ lastSuccessAt, pendingChangeCount: 2, now })).toBe(
      true,
    );
  });

  it("is stale immediately when the very first sync attempt fails, even with zero pending changes", () => {
    // 選手データがまだ何も無い(pendingChangeCount: 0)新規プールで、
    // 初回のデータ取得自体が失敗した場合をサイレントにしない(実際の
    // バグ報告に基づく回帰テスト)。
    expect(
      deriveIsStale({
        lastSuccessAt: null,
        lastFailureAt: "2026-01-01T00:00:00.000Z",
        pendingChangeCount: 0,
      }),
    ).toBe(true);
  });

  it("stays quiet before any sync has even been attempted", () => {
    expect(
      deriveIsStale({
        lastSuccessAt: null,
        lastFailureAt: null,
        pendingChangeCount: 0,
      }),
    ).toBe(false);
  });
});
