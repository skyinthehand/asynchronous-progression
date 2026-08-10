export interface MatchResultInput {
  entrant1Score: number | null;
  entrant2Score: number | null;
  entrant1DQ: boolean;
  entrant2DQ: boolean;
}

export type MatchResultOutcome =
  | { winnerSlot: "entrant1" | "entrant2"; score: string }
  | { error: "TIE" | "BOTH_DQ" };

function marker(score: number, dq: boolean): string {
  return dq ? "DQ" : String(score);
}

/**
 * FR-001〜FR-007: 両出場者のスコア(0〜3)・DQ入力から勝者を自動判定する
 * 純粋関数。未入力側は0として扱う(FR-004)。同点(DQでない場合)・両者DQは
 * エラーとして返す(FR-003/FR-006)。
 *
 * スコア文字列は常に「entrant1-entrant2」の順で組み立てる(spec.mdの
 * Acceptance Scenario 1/2の例("3-1""3-0")に合わせた順序)。Scenario 3の
 * 記載例("DQ-0"、entrant2がDQ・entrant1が勝者0の場合)はこの順序だと
 * 本来"0-DQ"になるはずで、spec.md側の表記ゆれ(勝者/敗者の順とentrant1/2の
 * 順が混在)と判断し、schemaのフィールド名(entrant1Score/entrant2Score)と
 * 一貫するentrant1-entrant2の順序をここでは採用する。
 */
export function resolveMatchResult(
  input: MatchResultInput,
): MatchResultOutcome {
  if (input.entrant1DQ && input.entrant2DQ) {
    return { error: "BOTH_DQ" };
  }

  const score1 = input.entrant1Score ?? 0;
  const score2 = input.entrant2Score ?? 0;

  if (input.entrant1DQ) {
    return {
      winnerSlot: "entrant2",
      score: `${marker(score1, true)}-${marker(score2, false)}`,
    };
  }
  if (input.entrant2DQ) {
    return {
      winnerSlot: "entrant1",
      score: `${marker(score1, false)}-${marker(score2, true)}`,
    };
  }

  if (score1 === score2) {
    return { error: "TIE" };
  }

  return {
    winnerSlot: score1 > score2 ? "entrant1" : "entrant2",
    score: `${score1}-${score2}`,
  };
}
