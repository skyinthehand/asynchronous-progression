import type { GraphQLClient } from "graphql-request";
import { describe, expect, it, vi } from "vitest";
import {
  fetchNextMatch,
  fetchPoolDetail,
  fetchTournamentRules,
  listMyTournaments,
  listPhasePools,
  listTournamentEvents,
  reportMatchResult,
} from "../../src/infra/startgg/operations.js";

/**
 * contracts/startgg-graphql-operations.md のQ1〜Q4・M1について、
 * start.gg公開スキーマ(research.mdで確認したフィールド)に沿った
 * サンプル応答が、zod検証を通過し期待どおりのドメイン形状へマッピング
 * されることを検証する契約テスト。
 */
function fakeClient(response: unknown): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("Q1a: listMyTournaments", () => {
  it("returns tournaments where the current user is an admin", async () => {
    const client = fakeClient({
      currentUser: {
        id: 42,
        tournaments: {
          nodes: [
            {
              id: 1,
              name: "IMPACT MAJOR #4",
              slug: "impact-major-4",
              admins: [{ id: 42 }],
            },
          ],
        },
      },
    });

    const tournaments = await listMyTournaments(client);

    expect(tournaments).toEqual([
      { tournamentSlug: "impact-major-4", tournamentName: "IMPACT MAJOR #4" },
    ]);
  });

  it("excludes tournaments where the current user is only a competitor, not an admin", async () => {
    // currentUser.tournaments returns tournaments the user is "organizing
    // or competing in"; a tournament where the user merely entered as a
    // player has an `admins` list that does not include their own id.
    const client = fakeClient({
      currentUser: {
        id: 42,
        tournaments: {
          nodes: [
            {
              id: 1,
              name: "IMPACT MAJOR #4",
              slug: "impact-major-4",
              admins: [{ id: 42 }],
            },
            {
              id: 2,
              name: "Some Other Player's Tournament",
              slug: "other-tournament",
              admins: [{ id: 99 }],
            },
          ],
        },
      },
    });

    const tournaments = await listMyTournaments(client);

    expect(tournaments).toEqual([
      { tournamentSlug: "impact-major-4", tournamentName: "IMPACT MAJOR #4" },
    ]);
  });

  it("does not request a nested events/phases/phaseGroups tree", async () => {
    const requestSpy = vi.fn().mockResolvedValue({
      currentUser: { id: 42, tournaments: { nodes: [] } },
    });
    const client = { request: requestSpy } as unknown as GraphQLClient;

    await listMyTournaments(client);

    const [query] = requestSpy.mock.calls[0];
    expect(query).not.toContain("phaseGroups");
    expect(query).not.toContain("phases");
  });
});

describe("Q1b: listTournamentEvents", () => {
  it("returns events with their nested phases for one tournament", async () => {
    const client = fakeClient({
      tournament: {
        events: [
          {
            id: 10,
            name: "Ultimate Singles",
            phases: [{ id: 100, name: "予選プール" }],
          },
        ],
      },
    });

    const events = await listTournamentEvents(client, "impact-major-4");

    expect(events).toEqual([
      {
        eventId: "10",
        eventName: "Ultimate Singles",
        phases: [{ phaseId: "100", phaseName: "予選プール" }],
      },
    ]);
  });
});

describe("Q1c: listPhasePools", () => {
  it("returns the pools (PhaseGroups) for one phase", async () => {
    const client = fakeClient({
      phase: {
        phaseGroups: {
          nodes: [
            {
              id: 1000,
              displayIdentifier: "Pool 1",
              bracketType: "DOUBLE_ELIMINATION",
            },
          ],
        },
      },
    });

    const pools = await listPhasePools(client, "100");

    expect(pools).toEqual([
      {
        poolId: "1000",
        poolDisplayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
      },
    ]);
  });

  it("falls back to OTHER for an unrecognized bracketType", async () => {
    const client = fakeClient({
      phase: {
        phaseGroups: {
          nodes: [
            { id: 1000, displayIdentifier: "Pool 1", bracketType: "SWISS" },
          ],
        },
      },
    });

    const [pool] = await listPhasePools(client, "100");
    expect(pool.bracketType).toBe("OTHER");
  });
});

describe("Q2: fetchPoolDetail", () => {
  it("maps PhaseGroup.sets into MatchCard/Entrant domain objects", async () => {
    const client = fakeClient({
      phaseGroup: {
        id: 1000,
        displayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            {
              id: 5000,
              identifier: "F",
              round: 1,
              station: { number: 3 },
              slots: [
                { entrant: { id: 1, name: "Alice" } },
                { entrant: { id: 2, name: "Bob" } },
              ],
              winnerId: 1,
              displayScore: "2-0",
              state: 3,
            },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "1000");

    expect(detail.bracketType).toBe("DOUBLE_ELIMINATION");
    expect(detail.matchCards).toHaveLength(1);
    expect(detail.matchCards[0]).toMatchObject({
      id: "5000",
      entrant1Id: "1",
      entrant2Id: "2",
      winnerId: "1",
      status: "COMPLETED",
      tableNumber: "3",
    });
    expect(detail.entrants).toHaveLength(2);
    expect(detail.entrants.map((e) => e.name).sort()).toEqual(["Alice", "Bob"]);
  });

  it("treats a BYE slot (null entrant) without error", async () => {
    const client = fakeClient({
      phaseGroup: {
        id: 1000,
        displayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            {
              id: 5001,
              identifier: "A",
              round: 1,
              station: null,
              slots: [{ entrant: { id: 1, name: "Alice" } }, { entrant: null }],
              winnerId: 1,
              displayScore: null,
              state: 3,
            },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "1000");
    expect(detail.matchCards[0].entrant2Id).toBeNull();
  });

  it("maps slot prereqType/prereqId into entrantSourceMatchId for bracket connector lines (FR-023)", async () => {
    const client = fakeClient({
      phaseGroup: {
        id: 1000,
        displayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            {
              id: 5002,
              identifier: "C",
              round: 2,
              station: null,
              slots: [
                {
                  prereqType: "set",
                  prereqId: 5000,
                  entrant: { id: 1, name: "Alice" },
                },
                {
                  prereqType: "seed",
                  prereqId: 3,
                  entrant: { id: 3, name: "Carol" },
                },
              ],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "1000");
    expect(detail.matchCards[0]).toMatchObject({
      entrant1SourceMatchId: "5000",
      entrant2SourceMatchId: null,
    });
  });

  it("repairs a preview bracket's dangling prereqId (missing intermediate round) to the nearest existing round at the same index (FR-023)", async () => {
    // 報告されたバグの再現: start.ggの「プレビュー」(未開始)ブラケットは
    // round -2に相当するSetを一切返さないまま、round -3(敗者側第1
    // ラウンド)のprereqIdだけが `preview_..._-2_0` のような実在しないIDを
    // 指している。0を挟んだ先の実在するラウンド(この場合はラウンド1、
    // 勝者側の対戦)まで同じindexでたどり直し、繋ぎ直せることを確認する。
    const client = fakeClient({
      phaseGroup: {
        id: 3068263,
        displayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            {
              id: "preview_3068263_1_0",
              identifier: "A",
              round: 1,
              station: null,
              slots: [
                {
                  prereqType: "seed",
                  prereqId: "37005479",
                  entrant: { id: 1, name: "Alice" },
                },
                {
                  prereqType: "seed",
                  prereqId: "37005562",
                  entrant: { id: 2, name: "Bob" },
                },
              ],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
            {
              id: "preview_3068263_1_1",
              identifier: "B",
              round: 1,
              station: null,
              slots: [
                {
                  prereqType: "seed",
                  prereqId: "37005527",
                  entrant: { id: 3, name: "Carol" },
                },
                {
                  prereqType: "seed",
                  prereqId: "37005528",
                  entrant: { id: 4, name: "Dave" },
                },
              ],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
            {
              // round -1・-2に相当するSetはレスポンスに一切含まれない。
              id: "preview_3068263_-3_0",
              identifier: "J",
              round: -3,
              station: null,
              slots: [
                {
                  prereqType: "set",
                  prereqId: "preview_3068263_-2_0",
                  entrant: null,
                },
                {
                  prereqType: "set",
                  prereqId: "preview_3068263_-2_1",
                  entrant: null,
                },
              ],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "3068263");
    const j = detail.matchCards.find((card) => card.identifier === "J");

    expect(j?.entrant1SourceMatchId).toBe("preview_3068263_1_0");
    expect(j?.entrant2SourceMatchId).toBe("preview_3068263_1_1");
  });

  it("leaves a dangling reference unresolved when no real card exists at any nearby round (safety net)", async () => {
    const client = fakeClient({
      phaseGroup: {
        id: 3068263,
        displayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            {
              id: "preview_3068263_-3_0",
              identifier: "J",
              round: -3,
              station: null,
              slots: [
                {
                  prereqType: "set",
                  prereqId: "preview_3068263_-2_0",
                  entrant: null,
                },
                {
                  prereqType: "set",
                  prereqId: "preview_3068263_-2_1",
                  entrant: null,
                },
              ],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "3068263");
    const j = detail.matchCards.find((card) => card.identifier === "J");

    // 探索範囲内(PREVIEW_GAP_SEARCH_LIMIT)のどのラウンドにも実在する
    // カードがなければ、元の(存在しない)参照のまま返る。
    expect(j?.entrant1SourceMatchId).toBe("preview_3068263_-2_0");
  });

  it("does not touch a dangling reference that is not a preview-style id (real, already-started bracket)", async () => {
    const client = fakeClient({
      phaseGroup: {
        id: 1000,
        displayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            {
              id: 9999,
              identifier: "J",
              round: -1,
              station: null,
              slots: [
                { prereqType: "set", prereqId: 12345, entrant: null },
                { prereqType: "seed", prereqId: 3, entrant: null },
              ],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "1000");
    // 12345は実在しないIDだが、"preview_"形式ではないため一切いじらない。
    expect(detail.matchCards[0].entrant1SourceMatchId).toBe("12345");
  });
});

describe("Q3: fetchNextMatch", () => {
  it("returns the opponent and table when a next set exists", async () => {
    const client = fakeClient({
      entrant: {
        paginatedSets: {
          nodes: [
            {
              station: { number: 7 },
              slots: [
                { entrant: { id: "e1", name: "Alice" } },
                { entrant: { id: "e9", name: "Dana" } },
              ],
            },
          ],
        },
      },
    });

    const result = await fetchNextMatch(client, "e1");
    expect(result).toEqual({
      opponentName: "Dana",
      tableNumber: "7",
      confirmed: true,
    });
  });

  it("returns an unconfirmed result when no next set is available", async () => {
    const client = fakeClient({
      entrant: { paginatedSets: { nodes: [] } },
    });

    const result = await fetchNextMatch(client, "e1");
    expect(result).toEqual({
      opponentName: null,
      tableNumber: null,
      confirmed: false,
    });
  });
});

describe("Q4: fetchTournamentRules", () => {
  it("returns the rules text", async () => {
    const client = fakeClient({
      tournament: { rules: "遅刻・キャンセルはDiscordまで。" },
    });
    expect(await fetchTournamentRules(client, "impact-major-4")).toBe(
      "遅刻・キャンセルはDiscordまで。",
    );
  });

  it("returns an empty string when rules is null", async () => {
    const client = fakeClient({ tournament: { rules: null } });
    expect(await fetchTournamentRules(client, "impact-major-4")).toBe("");
  });
});

describe("M1: reportMatchResult", () => {
  it("validates the input and maps the mutation response", async () => {
    const client = fakeClient({
      reportBracketSet: [
        { id: 5000, winnerId: 1, displayScore: "2-1", state: 3 },
      ],
    });

    const outcome = await reportMatchResult(client, {
      setId: "5000",
      winnerId: "1",
    });

    expect(outcome).toEqual({
      winnerId: "1",
      score: "2-1",
      status: "COMPLETED",
    });
  });

  it("rejects an invalid input before sending the request", async () => {
    const client = fakeClient({ reportBracketSet: [] });
    await expect(
      reportMatchResult(client, { setId: "", winnerId: "1" }),
    ).rejects.toThrow();
  });
});
