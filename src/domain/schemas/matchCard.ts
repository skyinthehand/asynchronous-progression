import { z } from "zod";

export const BracketSideSchema = z.enum(["WINNERS", "LOSERS", "N/A"]);

export const MatchCardStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
]);

export const MatchCardEditSchema = z.object({
  editedAt: z.string().datetime(),
  previousWinnerId: z.string().nullable(),
  previousScore: z.string().nullable(),
  editedBy: z.string().nullable(),
});

/**
 * プールの対戦カードの保存形式。IndexedDBには「順序に意味を持たない
 * フラットな配列」として保存されている(どのラウンド・どちらの側かは
 * round/bracketSideで自己申告するのみで、木構造そのものは持たない)。
 * ブラケット表示のためのツリー構造・表示順(どのカードが上でどのカードが
 * 下か、どのカード同士を線でつなぐか)は保存されておらず、表示のたびに
 * entrant1/entrant2SourceMatchId(下記)を手がかりに
 * domain/rules/bracketLayout.tsが動的に組み立て直す。
 */
export const MatchCardSchema = z.object({
  id: z.string().min(1),
  poolId: z.string().min(1),
  identifier: z.string().min(1),
  round: z.number().int(),
  bracketSide: BracketSideSchema,
  tableNumber: z.string().nullable(),
  entrant1Id: z.string().nullable(),
  entrant2Id: z.string().nullable(),
  winnerId: z.string().nullable(),
  score: z.string().nullable(),
  status: MatchCardStatusSchema,
  isLocked: z.boolean(),
  editHistory: z.array(MatchCardEditSchema),
  localOnly: z.boolean(),
  /**
   * FR-023: ブラケット表示で対戦をつなぐ線を描画するための情報。
   * entrant1/entrant2の出場者が、どの対戦カードの結果によってこのスロット
   * に入ったかを示す(start.ggのSetSlot.prereqType==="set"の場合の
   * prereqId)。シード(初戦)やBYE、対戦以外に由来する場合はnull。
   */
  entrant1SourceMatchId: z.string().nullable().default(null),
  entrant2SourceMatchId: z.string().nullable().default(null),
  /**
   * 002-match-scoring-and-flow FR-001/FR-004: 両出場者のスコア(0〜3)。
   * 未入力側はresolveMatchResult()により結果確定時に0として扱われるが、
   * このフィールド自体は「未入力」をnullのまま保持する(0との違いを
   * 区別するため)。
   */
  entrant1Score: z.number().int().min(0).max(3).nullable().default(null),
  entrant2Score: z.number().int().min(0).max(3).nullable().default(null),
  /** 002-match-scoring-and-flow FR-005/FR-006: 出場者の失格(DQ)。両者同時にtrueにはできない(呼び出し側で検証)。 */
  entrant1DQ: z.boolean().default(false),
  entrant2DQ: z.boolean().default(false),
  /**
   * ユーザーフィードバック(2026-08-12): スコアは分からず勝者のみ分かる
   * 場合の「W(不戦勝ではなく、単にスコア不明の勝ち)」。DQの逆で、trueに
   * した側自身が勝者になる。両者同時にtrueにはできない(呼び出し側で検証)。
   */
  entrant1W: z.boolean().default(false),
  entrant2W: z.boolean().default(false),
  /**
   * 002-match-scoring-and-flow FR-018/FR-020/FR-021: 次戦の自動サジェスト
   * (computeNextMatchSuggestions)の対象から一時的に外れているか。
   * 一覧からの直接選択には影響しない。
   */
  skippedFromSuggestion: z.boolean().default(false),
});

export type MatchCard = z.infer<typeof MatchCardSchema>;
export type MatchCardEdit = z.infer<typeof MatchCardEditSchema>;
export type BracketSide = z.infer<typeof BracketSideSchema>;
export type MatchCardStatus = z.infer<typeof MatchCardStatusSchema>;
