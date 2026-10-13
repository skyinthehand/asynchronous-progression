import type { GraphQLClient } from "graphql-request";
import { z } from "zod";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import type { BracketType } from "../../domain/entities/pool.js";

/**
 * startgg GraphQL operations, per contracts/startgg-graphql-operations.md.
 *
 * The exact field names below follow the publicly documented start.gg
 * schema (PhaseGroup, Set, Tournament) referenced in research.md. Because
 * this is a third-party API, every response is validated with zod (per
 * Constitution原則II) rather than trusted blindly; a shape mismatch surfaces
 * as a clear validation error instead of a silent bad value.
 */

// --- Q1: managed tournaments / events & phases / pools (drill-down) ---
//
// NOTE: 当初は「管理権限のある全トーナメント×全イベント×全フェーズ×
// 全プール」を1クエリで取得していたが、start.gg APIの
// "query complexity" 上限(1リクエストあたり最大1000オブジェクト)に
// 実運用で抵触した(1470オブジェクトでエラー)。そのため、管理者が
// トーナメント→イベント/フェーズ→プールの順に絞り込んで取得する
// drill-down方式に変更している。

function normalizeBracketType(raw: string | null): BracketType {
  switch (raw) {
    case "ROUND_ROBIN":
      return "ROUND_ROBIN";
    case "SINGLE_ELIMINATION":
      return "SINGLE_ELIMINATION";
    case "DOUBLE_ELIMINATION":
      return "DOUBLE_ELIMINATION";
    default:
      return "OTHER";
  }
}

const TOURNAMENTS_PER_PAGE = 25;

const TournamentSummarySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  slug: z.string(),
  // Tournament.admins: "Admin-only view of admins for this tournament".
  // 大会の管理者本人以外には見えない/空になるフィールドなので、これを
  // 使って「自分が参加しただけの大会」を除外する(currentUser.tournaments
  // は organizing or competing の両方を返すため)。
  admins: z
    .array(
      z.object({ id: z.union([z.string(), z.number()]).transform(String) }),
    )
    .nullable()
    .optional(),
});

const MyTournamentsResponseSchema = z.object({
  currentUser: z
    .object({
      id: z.union([z.string(), z.number()]).transform(String),
      tournaments: z
        .object({ nodes: z.array(TournamentSummarySchema) })
        .nullable(),
    })
    .nullable(),
});

const MY_TOURNAMENTS_QUERY = /* GraphQL */ `
  query MyTournaments($perPage: Int!) {
    currentUser {
      id
      tournaments(query: { perPage: $perPage }) {
        nodes {
          id
          name
          slug
          admins {
            id
          }
        }
      }
    }
  }
`;

export interface TournamentOption {
  tournamentSlug: string;
  tournamentName: string;
}

/**
 * Q1a: 管理権限のあるトーナメント一覧の取得(トーナメント本体のみ)。
 * `currentUser.tournaments`は「自分が主催 or 参加した」大会を両方返すため、
 * `admins`に自分のユーザーIDが含まれる(=管理者本人に見える)大会のみに
 * 絞り込む。
 */
export async function listMyTournaments(
  client: GraphQLClient,
): Promise<TournamentOption[]> {
  const raw = await client.request(MY_TOURNAMENTS_QUERY, {
    perPage: TOURNAMENTS_PER_PAGE,
  });
  const parsed = MyTournamentsResponseSchema.parse(raw);
  const currentUserId = parsed.currentUser?.id;
  const tournaments = parsed.currentUser?.tournaments?.nodes ?? [];
  return tournaments
    .filter((tournament) =>
      tournament.admins?.some((admin) => admin.id === currentUserId),
    )
    .map((tournament) => ({
      tournamentSlug: tournament.slug,
      tournamentName: tournament.name,
    }));
}

const PhaseSummarySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
});

const EventSummarySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  phases: z.array(PhaseSummarySchema).nullable().optional(),
});

const TournamentEventsResponseSchema = z.object({
  tournament: z
    .object({ events: z.array(EventSummarySchema).nullable() })
    .nullable(),
});

const TOURNAMENT_EVENTS_QUERY = /* GraphQL */ `
  query TournamentEvents($slug: String!) {
    tournament(slug: $slug) {
      events {
        id
        name
        phases {
          id
          name
        }
      }
    }
  }
`;

export interface EventOption {
  eventId: string;
  eventName: string;
  phases: { phaseId: string; phaseName: string }[];
}

/** Q1b: 選択したトーナメント配下のイベント/フェーズ一覧の取得。 */
export async function listTournamentEvents(
  client: GraphQLClient,
  tournamentSlug: string,
): Promise<EventOption[]> {
  const raw = await client.request(TOURNAMENT_EVENTS_QUERY, {
    slug: tournamentSlug,
  });
  const parsed = TournamentEventsResponseSchema.parse(raw);
  const events = parsed.tournament?.events ?? [];
  return events.map((event) => ({
    eventId: event.id,
    eventName: event.name,
    phases: (event.phases ?? []).map((phase) => ({
      phaseId: phase.id,
      phaseName: phase.name,
    })),
  }));
}

const PhaseGroupNodeSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  displayIdentifier: z.string(),
  bracketType: z.string().nullable(),
});

const PhasePoolsResponseSchema = z.object({
  phase: z
    .object({
      phaseGroups: z
        .object({ nodes: z.array(PhaseGroupNodeSchema) })
        .nullable(),
    })
    .nullable(),
});

const PHASE_POOLS_QUERY = /* GraphQL */ `
  query PhasePools($phaseId: ID!) {
    phase(id: $phaseId) {
      phaseGroups(query: { perPage: 100 }) {
        nodes {
          id
          displayIdentifier
          bracketType
        }
      }
    }
  }
`;

export interface PoolOption {
  poolId: string;
  poolDisplayIdentifier: string;
  bracketType: BracketType;
}

/** Q1c: 選択したフェーズ配下のプール(PhaseGroup)一覧の取得。 */
export async function listPhasePools(
  client: GraphQLClient,
  phaseId: string,
): Promise<PoolOption[]> {
  const raw = await client.request(PHASE_POOLS_QUERY, { phaseId });
  const parsed = PhasePoolsResponseSchema.parse(raw);
  const groups = parsed.phase?.phaseGroups?.nodes ?? [];
  return groups.map((group) => ({
    poolId: group.id,
    poolDisplayIdentifier: group.displayIdentifier,
    bracketType: normalizeBracketType(group.bracketType),
  }));
}

/** InitLogin/PoolSelectionが最終的に確定させる、選択済みプールの全情報。 */
export interface ManagedPoolOption {
  tournamentSlug: string;
  tournamentName: string;
  eventId: string;
  eventName: string;
  phaseId: string;
  phaseName: string;
  poolId: string;
  poolDisplayIdentifier: string;
  bracketType: BracketType;
}

// --- Q2: pool detail (match cards + entrants) ---

const SetSlotSchema = z.object({
  /** ブラケット接続線の再現用(FR-023)。旧形式のfixture互換のためoptional。 */
  prereqType: z.string().nullable().optional(),
  prereqId: z.union([z.string(), z.number()]).nullable().optional(),
  entrant: z
    .object({
      id: z.union([z.string(), z.number()]).transform(String),
      name: z.string(),
    })
    .nullable(),
});

const SetNodeSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  identifier: z.string().nullable(),
  round: z.number().int(),
  station: z.object({ number: z.union([z.string(), z.number()]) }).nullable(),
  /**
   * 005-stream-match-lock FR-001: この対戦に配信(ストリーム)が割り当て
   * られているかの判定に使う(非nullなら配信中)。中身のフィールドは
   * 使わず存在有無のみを見るため`id`のみ取得する。既存のfixtureとの
   * 互換のため`optional`にする(`prereqType`/`prereqId`と同じ方針、
   * 未指定の場合はundefinedとなり配信なし扱いになる)。
   */
  stream: z
    .object({ id: z.union([z.string(), z.number()]) })
    .nullable()
    .optional(),
  slots: z.array(SetSlotSchema),
  winnerId: z.union([z.string(), z.number()]).nullable(),
  displayScore: z.string().nullable(),
  state: z.number().nullable(),
});

/**
 * デザイン刷新(2026-10-09): プール内のシード値表示用。`seeds.nodes`が
 * 存在しない/空のレスポンスでも致命的エラーにならないよう、全体を
 * optionalにする(古いfixtureとの互換のため)。
 */
const SeedNodeSchema = z.object({
  seedNum: z.number().int().nullable(),
  entrant: z
    .object({ id: z.union([z.string(), z.number()]).transform(String) })
    .nullable(),
});

const PhaseGroupDetailSchema = z.object({
  phaseGroup: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    displayIdentifier: z.string(),
    bracketType: z.string().nullable(),
    sets: z.object({ nodes: z.array(SetNodeSchema) }).nullable(),
    seeds: z
      .object({ nodes: z.array(SeedNodeSchema) })
      .nullable()
      .optional(),
  }),
});

const POOL_DETAIL_QUERY = /* GraphQL */ `
  query PoolDetail($poolId: ID!) {
    phaseGroup(id: $poolId) {
      id
      displayIdentifier
      bracketType
      sets(page: 1, perPage: 100) {
        nodes {
          id
          identifier
          round
          station {
            number
          }
          stream {
            id
          }
          slots {
            prereqType
            prereqId
            entrant {
              id
              name
            }
          }
          winnerId
          displayScore
          state
        }
      }
      seeds(query: { perPage: 128 }) {
        nodes {
          seedNum
          entrant {
            id
          }
        }
      }
    }
  }
`;

const SET_STATE_COMPLETED = 3;
const SET_STATE_IN_PROGRESS = 2;

function toMatchCardStatus(state: number | null): MatchCard["status"] {
  if (state === SET_STATE_COMPLETED) return "COMPLETED";
  if (state === SET_STATE_IN_PROGRESS) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export interface PoolDetail {
  poolId: string;
  displayIdentifier: string;
  bracketType: BracketType;
  matchCards: MatchCard[];
  entrants: Entrant[];
}

const PREVIEW_ID_PATTERN = /^(.*)_(-?\d+)_(\d+)$/;
const PREVIEW_GAP_SEARCH_LIMIT = 20;

/**
 * FR-023: まだ「開始」されていないstart.ggの予測(プレビュー)ブラケットは、
 * `preview_{phaseGroupId}_{round}_{index}` という形の合成IDをprereqIdに
 * 使う。このID形式そのものが、ラウンド番号・インデックスをエンコードして
 * いる。ところが、実際のラウンド数が少ない(例: 8人プール)ブラケットでは、
 * 本来「勝者側ラウンド1の敗者が入る敗者側ラウンド1」を指すべき参照が、
 * 実在しない中間ラウンド(例: round -2)のIDを指したまま、その中間ラウンド
 * 自体のSetがレスポンスに含まれない、という状態になることがある
 * (start.gg側の内部的なラウンド採番が、実際のブラケット規模とは独立した
 * 固定のテンプレートに基づいているためと推測される。詳細な理由は不明)。
 *
 * この関数は、そうした「参照先が存在しないprereqId」を、同じindex・
 * より0に近いラウンド番号を持つ実在のカードへたどり直すことで補修する
 * (0を挟んで負→正、または正→負をまたぐ)。見つかった参照先の
 * bracketSideが元のカードと異なれば(勝者側→敗者側など)、それは
 * advanceWinner側で「敗者を送る」と正しく解釈される(FR-023の同側/別側
 * 判定をそのまま利用できるため、ここでは参照を繋ぎ直すだけでよい)。
 *
 * ただし、参照元と同じラウンド番号に実在するカードが1件でもある場合は
 * 探索を行わない。実際に報告されたバグ: 敗者側のある不戦勝カード(例:
 * 「round -3, index 0」を参照)が、round -3自体は実在する(index 1・3の
 * カードがある)のに、たまたまindex 0のカードだけが存在しない場合、
 * これは「別ラウンドへの参照ズレ」ではなく「そのラウンド内の真の欠番
 * (不戦勝でそもそも対戦自体が存在しない)」である。これを別ラウンドへの
 * 参照ズレと誤認して探索を広げると、たまたま同じindexを持つだけの
 * 無関係な対戦(勝者側の別の対戦等)に誤って繋がってしまう(繋がった
 * カードは「出場元が同じ側にない」カードとしてbracketLayout.ts側の
 * 連番(fallback)採番に回るため、この誤接続自体が見た目のズレを直接
 * 引き起こすわけではないが、誤った注記(crossSideOrigins)が表示されて
 * しまう)。
 *
 * `preview_`形式でないID(実際に開始済みのブラケットの、start.gg発行の
 * 通常の数値ID)には一切手を加えない。
 */
function resolvePreviewBracketGaps(matchCards: MatchCard[]): MatchCard[] {
  const cardById = new Map(matchCards.map((card) => [card.id, card]));
  const roundsWithCards = new Set(matchCards.map((card) => card.round));

  function resolveSourceId(id: string | null): string | null {
    if (id === null || cardById.has(id)) return id;
    const parsed = PREVIEW_ID_PATTERN.exec(id);
    if (!parsed || !parsed[1].startsWith("preview_")) return id;
    const [, prefix, roundText, index] = parsed;
    const startRound = Number(roundText);
    if (roundsWithCards.has(startRound)) return id; // 別ラウンドへの参照ズレではなく、同ラウンド内の真の欠番
    const direction = startRound < 0 ? 1 : -1;
    let round = startRound;
    for (let step = 0; step < PREVIEW_GAP_SEARCH_LIMIT; step++) {
      round += direction;
      if (round === 0) continue; // ラウンド0は存在しない(勝者側は1〜、敗者側は-1〜)
      const candidateId = `${prefix}_${round}_${index}`;
      if (cardById.has(candidateId)) return candidateId;
    }
    return id; // 見つからなければ元の(存在しない)参照のまま返す
  }

  return matchCards.map((card) => {
    const entrant1SourceMatchId = resolveSourceId(card.entrant1SourceMatchId);
    const entrant2SourceMatchId = resolveSourceId(card.entrant2SourceMatchId);
    if (
      entrant1SourceMatchId === card.entrant1SourceMatchId &&
      entrant2SourceMatchId === card.entrant2SourceMatchId
    ) {
      return card;
    }
    return { ...card, entrant1SourceMatchId, entrant2SourceMatchId };
  });
}

/**
 * Q2: 対象プールの詳細・対戦カード一覧の取得(定期同期)。
 *
 * ここがブラケット表示用データの「入り口」。start.gg APIはPhaseGroup.sets
 * を単なるSetのリスト(ツリー構造を持たないフラットな配列)として返す。
 * 各SetのSlot(出場者枠)が持つprereqType/prereqIdだけが「この枠にどの
 * 対戦の勝者が入るか」という木構造の手がかりで、下のmapでそれを
 * entrant1/entrant2SourceMatchId(MatchCard.idへの参照)として保存用の
 * 形(MatchCardSchema)に写し取っている。保存後のデータの詳しい形と、
 * それを画面表示用のツリー(表示順)に組み立て直す手順は
 * domain/rules/bracketLayout.tsのcomputeBracketLayout()を参照。
 */
export async function fetchPoolDetail(
  client: GraphQLClient,
  poolId: string,
): Promise<PoolDetail> {
  const raw = await client.request(POOL_DETAIL_QUERY, { poolId });
  const parsed = PhaseGroupDetailSchema.parse(raw);
  const group = parsed.phaseGroup;
  const bracketType = normalizeBracketType(group.bracketType);

  const seedByEntrantId = new Map<string, number>();
  for (const node of group.seeds?.nodes ?? []) {
    if (node.entrant && node.seedNum !== null) {
      seedByEntrantId.set(node.entrant.id, node.seedNum);
    }
  }

  const entrantById = new Map<string, Entrant>();
  const matchCards: MatchCard[] = (group.sets?.nodes ?? []).map((set) => {
    const [slot1, slot2] = set.slots;
    const entrant1Id = slot1?.entrant?.id ?? null;
    const entrant2Id = slot2?.entrant?.id ?? null;
    const entrant1SourceMatchId =
      slot1?.prereqType === "set" && slot1.prereqId != null
        ? String(slot1.prereqId)
        : null;
    const entrant2SourceMatchId =
      slot2?.prereqType === "set" && slot2.prereqId != null
        ? String(slot2.prereqId)
        : null;
    for (const slot of set.slots) {
      if (slot.entrant && !entrantById.has(slot.entrant.id)) {
        entrantById.set(slot.entrant.id, {
          id: slot.entrant.id,
          poolId,
          name: slot.entrant.name,
          attendance: "UNKNOWN",
          attendanceRecordedAt: null,
          poolFinished: false,
          nextMatch: null,
          awayPeriods: [],
          seed: seedByEntrantId.get(slot.entrant.id) ?? null,
        });
      }
    }
    const round = set.round;
    return {
      id: set.id,
      poolId,
      identifier: set.identifier ?? set.id,
      round,
      bracketSide:
        bracketType === "ROUND_ROBIN"
          ? "N/A"
          : round < 0
            ? "LOSERS"
            : "WINNERS",
      tableNumber: set.station ? String(set.station.number) : null,
      entrant1Id,
      entrant2Id,
      winnerId: set.winnerId !== null ? String(set.winnerId) : null,
      score: set.displayScore,
      status: toMatchCardStatus(set.state),
      isLocked: false,
      editHistory: [],
      localOnly: false,
      entrant1SourceMatchId,
      entrant2SourceMatchId,
      // 002-match-scoring-and-flow: スコア/DQ/対戦台数はローカル入力専用で
      // start.gg側に対応する概念がないため、ここでは既定値のみを設定する。
      // 既存カードとのマージ時は常にローカル値を優先する
      // (syncRunner.tsのmergeMatchCard参照)。
      entrant1Score: null,
      entrant2Score: null,
      entrant1DQ: false,
      entrant2DQ: false,
      entrant1W: false,
      entrant2W: false,
      statusLocalOnly: false,
      // 005-stream-match-lock FR-001: 配信(ストリーム)が割り当てられて
      // いるかどうか。読み取り専用で、常にstart.gg側の最新値で上書きする。
      isStreamed: Boolean(set.stream),
    };
  });

  return {
    poolId: group.id,
    displayIdentifier: group.displayIdentifier,
    bracketType,
    matchCards: resolvePreviewBracketGaps(matchCards),
    entrants: Array.from(entrantById.values()),
  };
}

// --- Q3: next-phase placement for a finished entrant ---

const EntrantNextSetSchema = z.object({
  entrant: z
    .object({
      paginatedSets: z
        .object({
          nodes: z.array(
            z.object({
              station: z
                .object({ number: z.union([z.string(), z.number()]) })
                .nullable(),
              slots: z.array(SetSlotSchema),
            }),
          ),
        })
        .nullable(),
    })
    .nullable(),
});

const NEXT_MATCH_QUERY = /* GraphQL */ `
  query NextMatch($entrantId: ID!) {
    entrant(id: $entrantId) {
      paginatedSets(page: 1, perPage: 1, filters: { state: [1, 2] }) {
        nodes {
          station {
            number
          }
          slots {
            entrant {
              id
              name
            }
          }
        }
      }
    }
  }
`;

export interface NextMatchResult {
  opponentName: string | null;
  tableNumber: string | null;
  confirmed: boolean;
}

/** Q3: 予選終了選手の次戦(後続フェーズ配置)情報の取得 */
export async function fetchNextMatch(
  client: GraphQLClient,
  entrantId: string,
): Promise<NextMatchResult> {
  const raw = await client.request(NEXT_MATCH_QUERY, { entrantId });
  const parsed = EntrantNextSetSchema.parse(raw);
  const nextSet = parsed.entrant?.paginatedSets?.nodes[0];
  if (!nextSet) {
    return { opponentName: null, tableNumber: null, confirmed: false };
  }
  const opponent = nextSet.slots
    .map((slot) => slot.entrant)
    .find((entrant) => entrant && entrant.id !== entrantId);
  return {
    opponentName: opponent?.name ?? null,
    tableNumber: nextSet.station ? String(nextSet.station.number) : null,
    confirmed: true,
  };
}

// --- Q4: notice (Event.rulesMarkdown) ---

const EventRulesResponseSchema = z.object({
  event: z.object({ rulesMarkdown: z.string().nullable() }).nullable(),
});

const EVENT_RULES_QUERY = /* GraphQL */ `
  query EventRules($eventId: ID!) {
    event(id: $eventId) {
      rulesMarkdown
    }
  }
`;

/**
 * Q4: 注意書き(Event.rulesMarkdown)の取得(read-only)。
 *
 * ユーザーフィードバック(2026-08-15): 当初はTournament.rulesを使って
 * いたが、大会のhomepage(公開ページ)側に表示される内容とは別物で、
 * ユーザーが実際に「プール進行注意事項」を書き込む先として選んだのは
 * Event(対象イベント)側のrules設定だったため、こちらに切り替える。
 * 参照した非公式スキーマ文書は`rulesMarkdown`を配列型としていたが、
 * 実機で確認した実際のレスポンスは単純な文字列だった(スキーマ文書側の
 * 誤り。配列型を前提にした実装ではzodのパースに失敗し、その例外が
 * runSync/useNoticeの両方でオフライン時のキャッシュ継続表示のため
 * 握りつぶされ、原因不明のまま「注意書きが取得できない」状態になって
 * いた)。
 */
export async function fetchEventRules(
  client: GraphQLClient,
  eventId: string,
): Promise<string> {
  const raw = await client.request(EVENT_RULES_QUERY, { eventId });
  const parsed = EventRulesResponseSchema.parse(raw);
  return parsed.event?.rulesMarkdown ?? "";
}

// --- Q5: tournament stations (for table-number → station-id resolution) ---

const StationNodeSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  number: z.union([z.string(), z.number()]).nullable(),
});

const TournamentStationsResponseSchema = z.object({
  tournament: z
    .object({
      stations: z.object({ nodes: z.array(StationNodeSchema) }).nullable(),
    })
    .nullable(),
});

const TOURNAMENT_STATIONS_QUERY = /* GraphQL */ `
  query TournamentStations($slug: String!, $perPage: Int!) {
    tournament(slug: $slug) {
      stations(perPage: $perPage) {
        nodes {
          id
          number
        }
      }
    }
  }
`;

const STATIONS_PER_PAGE = 100;

export interface StationOption {
  stationId: string;
  number: string;
}

/**
 * ユーザーフィードバック(2026-08-13): 対戦を「進行中にする」際、
 * ローカルの対戦台番号(単純な数値ラベル)をstart.ggの`assignStation`
 * mutationへ渡すには、ラベルではなくstart.gg側のStation.id(内部ID)が
 * 必要になる。この対応表を得るためのクエリ。トーナメント全体で共通の
 * Station一覧のため、プール単位ではなくtournamentSlugで取得する。
 */
export async function fetchStations(
  client: GraphQLClient,
  tournamentSlug: string,
): Promise<StationOption[]> {
  const raw = await client.request(TOURNAMENT_STATIONS_QUERY, {
    slug: tournamentSlug,
    perPage: STATIONS_PER_PAGE,
  });
  const parsed = TournamentStationsResponseSchema.parse(raw);
  const nodes = parsed.tournament?.stations?.nodes ?? [];
  return nodes
    .filter(
      (node): node is typeof node & { number: string | number } =>
        node.number !== null,
    )
    .map((node) => ({ stationId: node.id, number: String(node.number) }));
}

// --- M1: report/edit a match result ---

export const ReportBracketSetInputSchema = z.object({
  setId: z.string().min(1),
  winnerId: z.string().min(1),
  isDQ: z.boolean().optional(),
  gameData: z
    .array(
      z.object({
        gameNum: z.number().int().positive(),
        winnerId: z.string().min(1),
      }),
    )
    .optional(),
});

const ReportBracketSetResponseSchema = z.object({
  reportBracketSet: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      winnerId: z.union([z.string(), z.number()]).nullable(),
      displayScore: z.string().nullable(),
      state: z.number().nullable(),
    }),
  ),
});

const REPORT_BRACKET_SET_MUTATION = /* GraphQL */ `
  mutation ReportBracketSet(
    $setId: ID!
    $winnerId: ID!
    $isDQ: Boolean
    $gameData: [BracketSetGameDataInput]
  ) {
    reportBracketSet(
      setId: $setId
      winnerId: $winnerId
      isDQ: $isDQ
      gameData: $gameData
    ) {
      id
      winnerId
      displayScore
      state
    }
  }
`;

export interface ReportResultOutcome {
  winnerId: string | null;
  score: string | null;
  status: MatchCard["status"];
}

/**
 * ユーザーフィードバック(2026-08-13): reportMatchResult呼び出し側が
 * winnerIdしか渡していなかったため、start.gg側に勝者のみ登録されスコアが
 * 反映されない不具合があった。MatchCardのスコア/DQ/W(002-match-scoring-
 * and-flow)からreportBracketSetの入力を組み立てる。
 *
 * - DQ: 実際にゲームは行われていないため`gameData`は送らず`isDQ: true`のみ。
 * - W(スコア不明の勝ちのみ判明): 存在しないスコアを捏造できないため
 *   `gameData`は送らない。
 * - 通常のスコア入力: `gameData`をentrant1Score+entrant2Score件の
 *   `{gameNum, winnerId}`に展開する(entrant1の勝ち数分→entrant2の勝ち数分
 *   の順)。resolveMatchResult()が同点を既にエラーとして弾いているため、
 *   ここに到達する時点でスコアが同点になることはない。
 */
export function buildReportBracketSetInput(
  card: MatchCard,
): z.infer<typeof ReportBracketSetInputSchema> {
  const winnerId = card.winnerId ?? "";
  if (card.entrant1DQ || card.entrant2DQ) {
    return { setId: card.id, winnerId, isDQ: true };
  }
  if (card.entrant1W || card.entrant2W) {
    return { setId: card.id, winnerId, isDQ: false };
  }
  const entrant1Wins = card.entrant1Score ?? 0;
  const entrant2Wins = card.entrant2Score ?? 0;
  const gameData = [
    ...Array.from({ length: entrant1Wins }, () => card.entrant1Id),
    ...Array.from({ length: entrant2Wins }, () => card.entrant2Id),
  ]
    .filter((entrantId): entrantId is string => entrantId !== null)
    .map((entrantId, index) => ({ gameNum: index + 1, winnerId: entrantId }));
  return {
    setId: card.id,
    winnerId,
    isDQ: false,
    gameData: gameData.length > 0 ? gameData : undefined,
  };
}

/** M1: 対戦結果の報告・修正 */
export async function reportMatchResult(
  client: GraphQLClient,
  input: z.infer<typeof ReportBracketSetInputSchema>,
): Promise<ReportResultOutcome> {
  const validatedInput = ReportBracketSetInputSchema.parse(input);
  const raw = await client.request(REPORT_BRACKET_SET_MUTATION, validatedInput);
  const parsed = ReportBracketSetResponseSchema.parse(raw);
  const updated = parsed.reportBracketSet[0];
  return {
    winnerId:
      updated?.winnerId !== null && updated?.winnerId !== undefined
        ? String(updated.winnerId)
        : null,
    score: updated?.displayScore ?? null,
    status: toMatchCardStatus(updated?.state ?? null),
  };
}

// --- M2: mark a set as in-progress (called) ---

const MarkSetInProgressResponseSchema = z.object({
  markSetInProgress: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    state: z.number().nullable(),
  }),
});

const MARK_SET_IN_PROGRESS_MUTATION = /* GraphQL */ `
  mutation MarkSetInProgress($setId: ID!) {
    markSetInProgress(setId: $setId) {
      id
      state
    }
  }
`;

/**
 * M2: 対戦を「進行中にする」際、startgg側にもステータス(呼び出し済み/
 * 進行中)を反映する(ユーザーフィードバック2026-08-13)。
 */
export async function markSetInProgress(
  client: GraphQLClient,
  setId: string,
): Promise<void> {
  const raw = await client.request(MARK_SET_IN_PROGRESS_MUTATION, { setId });
  MarkSetInProgressResponseSchema.parse(raw);
}

// --- M3: assign a station (table) to a set ---

const AssignStationResponseSchema = z.object({
  assignStation: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
  }),
});

const ASSIGN_STATION_MUTATION = /* GraphQL */ `
  mutation AssignStation($setId: ID!, $stationId: ID!) {
    assignStation(setId: $setId, stationId: $stationId) {
      id
    }
  }
`;

/**
 * M3: 対戦を「進行中にする」際、ローカルで設定済みの対戦台番号を
 * (Q5で解決したstation idを使って)startgg側にも反映する
 * (ユーザーフィードバック2026-08-13)。
 */
export async function assignStationToSet(
  client: GraphQLClient,
  setId: string,
  stationId: string,
): Promise<void> {
  const raw = await client.request(ASSIGN_STATION_MUTATION, {
    setId,
    stationId,
  });
  AssignStationResponseSchema.parse(raw);
}
