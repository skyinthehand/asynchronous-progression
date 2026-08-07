import { z } from "zod";

export const BracketTypeSchema = z.enum([
  "ROUND_ROBIN",
  "SINGLE_ELIMINATION",
  "DOUBLE_ELIMINATION",
  "OTHER",
]);

export const PoolSchema = z.object({
  id: z.string().min(1),
  displayIdentifier: z.string().min(1),
  tournamentSlug: z.string().min(1),
  eventId: z.string().min(1),
  phaseId: z.string().min(1),
  className: z.string().nullable(),
  bracketType: BracketTypeSchema,
  staffName: z.string().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
  /** 印刷ヘッダー表示用(FR-024)。初期化時にstartggの一覧取得結果から保存。 */
  tournamentName: z.string().nullable().default(null),
  eventName: z.string().nullable().default(null),
});

export type Pool = z.infer<typeof PoolSchema>;
export type BracketType = z.infer<typeof BracketTypeSchema>;
