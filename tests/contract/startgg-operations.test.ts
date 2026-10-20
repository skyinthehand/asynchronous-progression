import type { GraphQLClient } from "graphql-request";
import { describe, expect, it, vi } from "vitest";
import type { MatchCard } from "../../src/domain/entities/matchCard.js";
import {
  assignStationToSet,
  buildReportBracketSetInput,
  fetchEventRules,
  fetchNextMatch,
  fetchPoolDetail,
  fetchStations,
  listMyTournaments,
  listPhasePools,
  listTournamentEvents,
  markSetInProgress,
  reportMatchResult,
} from "../../src/infra/startgg/operations.js";

function makeCard(overrides: Partial<MatchCard>): MatchCard {
  return {
    id: "set-1",
    poolId: "pool-1",
    identifier: "R1-1",
    round: 1,
    bracketSide: "WINNERS",
    tableNumber: null,
    entrant1Id: "e1",
    entrant2Id: "e2",
    winnerId: "e1",
    score: null,
    status: "COMPLETED",
    isLocked: false,
    editHistory: [],
    localOnly: true,
    entrant1SourceMatchId: null,
    entrant2SourceMatchId: null,
    entrant1Score: null,
    entrant2Score: null,
    entrant1DQ: false,
    entrant2DQ: false,
    entrant1W: false,
    entrant2W: false,
    statusLocalOnly: false,
    ...overrides,
  };
}

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

  it("maps phaseGroup.seeds into Entrant.seed (デザイン刷新: start.ggのシード値表示)", async () => {
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
              station: null,
              slots: [
                { entrant: { id: 1, name: "Alice" } },
                { entrant: { id: 2, name: "Bob" } },
              ],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
          ],
        },
        seeds: {
          nodes: [
            { seedNum: 1, entrant: { id: 1 } },
            { seedNum: 2, entrant: { id: 2 } },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "1000");

    const alice = detail.entrants.find((e) => e.name === "Alice");
    const bob = detail.entrants.find((e) => e.name === "Bob");
    expect(alice?.seed).toBe(1);
    expect(bob?.seed).toBe(2);
  });

  it("leaves Entrant.seed null when the response has no seeds (互換性)", async () => {
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
              station: null,
              slots: [{ entrant: { id: 1, name: "Alice" } }, { entrant: null }],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "1000");
    expect(detail.entrants[0].seed).toBeNull();
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

  it("maps a non-null stream field to isStreamed: true (005-stream-match-lock FR-001)", async () => {
    const client = fakeClient({
      phaseGroup: {
        id: 1000,
        displayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            {
              id: 5002,
              identifier: "A",
              round: 1,
              station: null,
              stream: { id: 999 },
              slots: [{ entrant: null }, { entrant: null }],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "1000");
    expect(detail.matchCards[0].isStreamed).toBe(true);
  });

  it("maps per-slot standing scores (and -1 as DQ) entered on start.gg", async () => {
    function slot(id: number, value: number | null) {
      return {
        entrant: { id, name: `P${id}` },
        standing: { stats: { score: { value } } },
      };
    }
    function set(id: number, slots: ReturnType<typeof slot>[]) {
      return {
        id,
        identifier: String(id),
        round: 1,
        station: null,
        stream: null,
        slots,
        winnerId: 44,
        displayScore: null,
        state: 3,
      };
    }
    const client = fakeClient({
      phaseGroup: {
        id: 1000,
        displayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            set(1, [slot(44, 2), slot(53, 1)]),
            set(2, [slot(44, 0), slot(53, -1)]),
            set(3, [slot(44, 5), slot(53, null)]),
          ],
        },
      },
    });

    const [scored, dq, outOfRange] = (await fetchPoolDetail(client, "1000"))
      .matchCards;
    expect([scored.entrant1Score, scored.entrant2Score]).toEqual([2, 1]);
    expect(dq.entrant2DQ).toBe(true);
    expect(dq.entrant2Score).toBeNull();
    // スキーマの範囲(0〜3)外の値は、同期全体を失敗させないよう不明扱い。
    expect(outOfRange.entrant1Score).toBeNull();
  });

  it("maps a null stream field to isStreamed: false", async () => {
    const client = fakeClient({
      phaseGroup: {
        id: 1000,
        displayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            {
              id: 5003,
              identifier: "B",
              round: 1,
              station: null,
              stream: null,
              slots: [{ entrant: null }, { entrant: null }],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "1000");
    expect(detail.matchCards[0].isStreamed).toBe(false);
  });

  it("treats a missing stream field (older fixture shape) as isStreamed: false", async () => {
    const client = fakeClient({
      phaseGroup: {
        id: 1000,
        displayIdentifier: "Pool 1",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            {
              id: 5004,
              identifier: "C",
              round: 1,
              station: null,
              slots: [{ entrant: null }, { entrant: null }],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
          ],
        },
      },
    });

    const detail = await fetchPoolDetail(client, "1000");
    expect(detail.matchCards[0].isStreamed).toBe(false);
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

  it("leaves a dangling reference unresolved when its own round already has real cards (true bye, not a round shift; reported bug: R/T match cards invisible in the losers bracket)", async () => {
    // 実際に報告されたバグの再現データ(2026-08-18): round -3には index 1
    // (P)・index 3(Q)の対戦が実在するが、index 0・2は不戦勝でそもそも
    // 対戦が存在しない。round -4のR・Tはそれぞれindex 0・2を参照して
    // いるが、これは「round -2への参照ズレ」と誤認して探索を広げては
    // いけない(round -3自体は実在するため)。誤って探索を広げると、
    // 無関係な勝者側の対戦に繋がってしまう。
    const client = fakeClient({
      phaseGroup: {
        id: 3383360,
        displayIdentifier: "B8",
        bracketType: "DOUBLE_ELIMINATION",
        sets: {
          nodes: [
            {
              id: "preview_3383360_-3_1",
              identifier: "P",
              round: -3,
              station: null,
              slots: [
                {
                  prereqType: "set",
                  prereqId: "preview_3383360_1_1",
                  entrant: null,
                },
                {
                  prereqType: "set",
                  prereqId: "preview_3383360_1_2",
                  entrant: null,
                },
              ],
              winnerId: null,
              displayScore: null,
              state: 1,
            },
            {
              id: "preview_3383360_-4_0",
              identifier: "R",
              round: -4,
              station: null,
              slots: [
                {
                  prereqType: "set",
                  prereqId: "preview_3383360_2_3",
                  entrant: null,
                },
                {
                  prereqType: "set",
                  prereqId: "preview_3383360_-3_0",
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

    const detail = await fetchPoolDetail(client, "3383360");
    const r = detail.matchCards.find((card) => card.identifier === "R");

    // round -3自体は実在する(Pがある)ため、round -2側への探索は行わず
    // 未解決のまま返る(見つかった場合と違い、無関係なカードには繋がない)。
    expect(r?.entrant2SourceMatchId).toBe("preview_3383360_-3_0");
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

describe("Q4: fetchEventRules", () => {
  // ユーザーフィードバック(2026-08-15): 参照した非公式スキーマ文書は
  // rulesMarkdownを配列型としていたが、実機で確認した実際のレスポンスは
  // 単純な文字列だった。配列を前提にすると実際のレスポンスに対して
  // zodのパースが失敗し、その例外が(オフライン時のキャッシュ継続表示の
  // ため)呼び出し元で握りつぶされ、原因不明のまま注意書きが取得できない
  // 状態になっていた。
  it("returns the rulesMarkdown text as-is", async () => {
    const client = fakeClient({
      event: { rulesMarkdown: "# プール進行注意事項\n- 離席記録に登録" },
    });
    expect(await fetchEventRules(client, "1")).toBe(
      "# プール進行注意事項\n- 離席記録に登録",
    );
  });

  it("returns an empty string when rulesMarkdown is null", async () => {
    const client = fakeClient({ event: { rulesMarkdown: null } });
    expect(await fetchEventRules(client, "1")).toBe("");
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

  it("sends gameData/isDQ as mutation variables (2026-08-13: score was not being transmitted)", async () => {
    const requestMock = vi.fn().mockResolvedValue({
      reportBracketSet: [
        { id: 5000, winnerId: 1, displayScore: "3-1", state: 3 },
      ],
    });
    const client = { request: requestMock } as unknown as GraphQLClient;

    await reportMatchResult(client, {
      setId: "5000",
      winnerId: "1",
      isDQ: false,
      gameData: [
        { gameNum: 1, winnerId: "1" },
        { gameNum: 2, winnerId: "1" },
        { gameNum: 3, winnerId: "1" },
        { gameNum: 4, winnerId: "2" },
      ],
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        setId: "5000",
        winnerId: "1",
        isDQ: false,
        gameData: [
          { gameNum: 1, winnerId: "1" },
          { gameNum: 2, winnerId: "1" },
          { gameNum: 3, winnerId: "1" },
          { gameNum: 4, winnerId: "2" },
        ],
      }),
    );
  });
});

describe("buildReportBracketSetInput", () => {
  it("builds gameData sized by entrant1Score+entrant2Score wins, entrant1's wins first", () => {
    const card = makeCard({
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
      entrant1Score: 3,
      entrant2Score: 1,
    });

    expect(buildReportBracketSetInput(card)).toEqual({
      setId: "set-1",
      winnerId: "e1",
      isDQ: false,
      gameData: [
        { gameNum: 1, winnerId: "e1" },
        { gameNum: 2, winnerId: "e1" },
        { gameNum: 3, winnerId: "e1" },
        { gameNum: 4, winnerId: "e2" },
      ],
    });
  });

  it("sends isDQ:true with no gameData when a DQ decided the match", () => {
    const card = makeCard({
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
      entrant2DQ: true,
    });

    expect(buildReportBracketSetInput(card)).toEqual({
      setId: "set-1",
      winnerId: "e1",
      isDQ: true,
    });
  });

  it("sends no gameData when only the winner is known (W, score unknown)", () => {
    const card = makeCard({
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
      entrant1W: true,
    });

    expect(buildReportBracketSetInput(card)).toEqual({
      setId: "set-1",
      winnerId: "e1",
      isDQ: false,
    });
  });
});

describe("Q5: fetchStations", () => {
  it("maps Tournament.stations into number-keyed StationOptions", async () => {
    const client = fakeClient({
      tournament: {
        stations: {
          nodes: [
            { id: 900, number: 1 },
            { id: 901, number: 2 },
          ],
        },
      },
    });

    const stations = await fetchStations(client, "impact-major-4");

    expect(stations).toEqual([
      { stationId: "900", number: "1" },
      { stationId: "901", number: "2" },
    ]);
  });

  it("excludes stations without a number", async () => {
    const client = fakeClient({
      tournament: {
        stations: { nodes: [{ id: 900, number: null }] },
      },
    });

    expect(await fetchStations(client, "impact-major-4")).toEqual([]);
  });
});

describe("M2: markSetInProgress (2026-08-13: reflect in-progress status to start.gg)", () => {
  it("sends the setId as a mutation variable", async () => {
    const requestMock = vi
      .fn()
      .mockResolvedValue({ markSetInProgress: { id: 5000, state: 2 } });
    const client = { request: requestMock } as unknown as GraphQLClient;

    await markSetInProgress(client, "5000");

    expect(requestMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ setId: "5000" }),
    );
  });
});

describe("M3: assignStationToSet (2026-08-13: reflect table number to start.gg)", () => {
  it("sends setId/stationId as mutation variables", async () => {
    const requestMock = vi
      .fn()
      .mockResolvedValue({ assignStation: { id: 5000 } });
    const client = { request: requestMock } as unknown as GraphQLClient;

    await assignStationToSet(client, "5000", "900");

    expect(requestMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ setId: "5000", stationId: "900" }),
    );
  });
});
