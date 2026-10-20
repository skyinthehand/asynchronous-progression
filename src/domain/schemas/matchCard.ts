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
   * ユーザーフィードバック(2026-08-13): 対戦を「進行中にする」際、
   * ステータス(IN_PROGRESS)と対戦台番号をstartgg側にも反映できるように
   * する。winnerId(結果)の送信キューであるlocalOnlyとは別に管理する
   * (対戦台番号のみの変更にlocalOnlyを流用すると、結果確定までの間
   * 他のフィールドの同期が永久に止まってしまう問題が過去にあったため。
   * syncRunner.tsのmergeMatchCard参照)。
   */
  statusLocalOnly: z.boolean().default(false),
  /**
   * ユーザーフィードバック(2026-10-19): 対戦台番号だけを変更した場合の
   * start.gg送信待ちキュー。statusLocalOnlyを対戦台の変更にも流用した
   * ところ、既にstart.gg側でも進行中になっている対戦(このアプリの
   * ローカルでは「進行中」のまま、過去に別途反映済み)に対して対戦台だけ
   * 変更しても、同期のたびに不要なmarkSetInProgress(「Set is already
   * started」で失敗する)が再送され、そのエラーで対戦台の送信
   * (assignStationToSet)まで巻き込まれて一切実行されない不具合になって
   * いた。対戦台の送信要否は、状態の送信要否(statusLocalOnly)とは独立に
   * 判定する(syncRunner.ts参照)。
   */
  tableLocalOnly: z.boolean().default(false),
  /**
   * 005-stream-match-lock FR-001: start.gg上でこの対戦に配信(ストリーム)が
   * 割り当てられているか。読み取り専用で、本ツール内から直接変更する
   * 手段は提供しない。定期同期のたびにstart.gg側の最新値で上書きする。
   */
  isStreamed: z.boolean().default(false),
  /**
   * ユーザーフィードバック(2026-10-20): アプリで入力した結果をstart.ggへ
   * 送信する前に、start.gg側(TOの画面・選手の自己報告等)で別の勝者の
   * 結果が入力されていた場合、start.ggを正としてローカルの結果を破棄する。
   * 破棄した内容をここに残し、プール進行画面のモーダルで進行担当者に
   * 知らせる(確認するとnullに戻す)。
   */
  discardedLocalResult: z
    .object({
      winnerId: z.string().nullable(),
      score: z.string().nullable(),
      discardedAt: z.string().datetime(),
    })
    .nullable()
    .default(null),
});

export type MatchCard = z.infer<typeof MatchCardSchema>;
export type MatchCardEdit = z.infer<typeof MatchCardEditSchema>;
export type BracketSide = z.infer<typeof BracketSideSchema>;
export type MatchCardStatus = z.infer<typeof MatchCardStatusSchema>;
