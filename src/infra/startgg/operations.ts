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

// --- Q1: managed tournaments / events / phases / pools ---

const PhaseGroupNodeSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  displayIdentifier: z.string(),
  bracketType: z.string().nullable(),
});

const PhaseNodeSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  phaseGroups: z
    .object({ nodes: z.array(PhaseGroupNodeSchema) })
    .nullable()
    .optional(),
});

const EventNodeSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  phases: z.array(PhaseNodeSchema).nullable().optional(),
});

const TournamentNodeSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  slug: z.string(),
  events: z.array(EventNodeSchema).nullable().optional(),
});

const ManagedTournamentsResponseSchema = z.object({
  currentUser: z
    .object({
      tournaments: z
        .object({ nodes: z.array(TournamentNodeSchema) })
        .nullable(),
    })
    .nullable(),
});

const MANAGED_TOURNAMENTS_QUERY = /* GraphQL */ `
  query ManagedTournaments {
    currentUser {
      tournaments(query: { perPage: 100 }) {
        nodes {
          id
          name
          slug
          events {
            id
            name
            phases {
              id
              name
              phaseGroups {
                nodes {
                  id
                  displayIdentifier
                  bracketType
                }
              }
            }
          }
        }
      }
    }
  }
`;

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

/** Q1: 管理権限のあるトーナメント/イベント/フェーズ/プール一覧の取得 */
export async function listManagedPools(
  client: GraphQLClient,
): Promise<ManagedPoolOption[]> {
  const raw = await client.request(MANAGED_TOURNAMENTS_QUERY);
  const parsed = ManagedTournamentsResponseSchema.parse(raw);
  const tournaments = parsed.currentUser?.tournaments?.nodes ?? [];

  const options: ManagedPoolOption[] = [];
  for (const tournament of tournaments) {
    for (const event of tournament.events ?? []) {
      for (const phase of event.phases ?? []) {
        for (const group of phase.phaseGroups?.nodes ?? []) {
          options.push({
            tournamentSlug: tournament.slug,
            tournamentName: tournament.name,
            eventId: event.id,
            eventName: event.name,
            phaseId: phase.id,
            phaseName: phase.name,
            poolId: group.id,
            poolDisplayIdentifier: group.displayIdentifier,
            bracketType: normalizeBracketType(group.bracketType),
          });
        }
      }
    }
  }
  return options;
}

// --- Q2: pool detail (match cards + entrants) ---

const SetSlotSchema = z.object({
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
  slots: z.array(SetSlotSchema),
  winnerId: z.union([z.string(), z.number()]).nullable(),
  displayScore: z.string().nullable(),
  state: z.number().nullable(),
});

const PhaseGroupDetailSchema = z.object({
  phaseGroup: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    displayIdentifier: z.string(),
    bracketType: z.string().nullable(),
    sets: z.object({ nodes: z.array(SetNodeSchema) }).nullable(),
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
          slots {
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

/** Q2: 対象プールの詳細・対戦カード一覧の取得(定期同期) */
export async function fetchPoolDetail(
  client: GraphQLClient,
  poolId: string,
): Promise<PoolDetail> {
  const raw = await client.request(POOL_DETAIL_QUERY, { poolId });
  const parsed = PhaseGroupDetailSchema.parse(raw);
  const group = parsed.phaseGroup;
  const bracketType = normalizeBracketType(group.bracketType);

  const entrantById = new Map<string, Entrant>();
  const matchCards: MatchCard[] = (group.sets?.nodes ?? []).map((set) => {
    const [slot1, slot2] = set.slots;
    const entrant1Id = slot1?.entrant?.id ?? null;
    const entrant2Id = slot2?.entrant?.id ?? null;
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
    };
  });

  return {
    poolId: group.id,
    displayIdentifier: group.displayIdentifier,
    bracketType,
    matchCards,
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

// --- Q4: notice (Tournament.rules) ---

const TournamentRulesResponseSchema = z.object({
  tournament: z.object({ rules: z.string().nullable() }).nullable(),
});

const TOURNAMENT_RULES_QUERY = /* GraphQL */ `
  query TournamentRules($slug: String!) {
    tournament(slug: $slug) {
      rules
    }
  }
`;

/** Q4: 注意書き(Tournament.rules)の取得(read-only) */
export async function fetchTournamentRules(
  client: GraphQLClient,
  tournamentSlug: string,
): Promise<string> {
  const raw = await client.request(TOURNAMENT_RULES_QUERY, {
    slug: tournamentSlug,
  });
  const parsed = TournamentRulesResponseSchema.parse(raw);
  return parsed.tournament?.rules ?? "";
}

// --- M1: report/edit a match result ---

export const ReportBracketSetInputSchema = z.object({
  setId: z.string().min(1),
  winnerId: z.string().min(1),
  isDQ: z.boolean().optional(),
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
  mutation ReportBracketSet($setId: ID!, $winnerId: ID!, $isDQ: Boolean) {
    reportBracketSet(setId: $setId, winnerId: $winnerId, isDQ: $isDQ) {
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
