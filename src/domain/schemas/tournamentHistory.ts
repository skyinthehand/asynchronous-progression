import { z } from "zod";

/**
 * ユーザーフィードバック(2026-10-18): 同じ端末で同じ大会・イベントの
 * 複数プールを扱うことが多いため、過去に入力/選択した大会スラッグを
 * 履歴として保存し、管理画面の大会選択ですぐに選び直せるようにする。
 */
export const TournamentHistoryEntrySchema = z.object({
  tournamentSlug: z.string().min(1),
  tournamentName: z.string().min(1),
  lastUsedAt: z.string().datetime(),
});

export type TournamentHistoryEntry = z.infer<
  typeof TournamentHistoryEntrySchema
>;
