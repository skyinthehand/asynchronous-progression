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
});

export type MatchCard = z.infer<typeof MatchCardSchema>;
export type MatchCardEdit = z.infer<typeof MatchCardEditSchema>;
export type BracketSide = z.infer<typeof BracketSideSchema>;
export type MatchCardStatus = z.infer<typeof MatchCardStatusSchema>;
