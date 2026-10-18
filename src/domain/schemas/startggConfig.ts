import { z } from "zod";

export const StartggIntegrationConfigSchema = z.object({
  tournamentSlug: z.string().min(1).nullable(),
  eventId: z.string().min(1).nullable(),
  phaseId: z.string().min(1).nullable(),
  poolId: z.string().min(1).nullable(),
  syncToken: z.string().min(1).nullable(),
  tokenUpdatedAt: z.string().datetime().nullable(),
  /**
   * FR-026: 管理画面パスワードのSHA-256ハッシュ(初回入力時にbootstrap)。
   * 本フィールド追加前に保存された既存レコードにも後方互換に対応できる
   * よう、欠落時はnullとして扱う(destructive migrationを避ける)。
   */
  adminPasswordHash: z.string().nullable().default(null),
  /**
   * ユーザーフィードバック(2026-10-18): 大会・イベント・フェーズの表示名
   * (TournamentDrillDown.tsxが、直近に選択した大会・イベントをデフォルト
   * 入力として表示し、対象プールの再選択だけで済ませるために使う)。
   * 本フィールド追加前に保存された既存レコードとの後方互換のため、
   * 欠落時はnullとして扱う。
   */
  tournamentName: z.string().nullable().default(null),
  eventName: z.string().nullable().default(null),
  phaseName: z.string().nullable().default(null),
});

export type StartggIntegrationConfig = z.infer<
  typeof StartggIntegrationConfigSchema
>;
