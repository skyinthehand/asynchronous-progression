export interface MatchResultInput {
  entrant1Score: number | null;
  entrant2Score: number | null;
  entrant1DQ: boolean;
  entrant2DQ: boolean;
  /** スコアは分からず勝者のみ分かる場合の「W」。DQの逆で、trueにした側自身が勝者になる。 */
  entrant1W: boolean;
  entrant2W: boolean;
}

export type MatchResultOutcome =
  | { winnerSlot: "entrant1" | "entrant2"; score: string }
  | { error: "TIE" | "BOTH_DQ" | "BOTH_W" };

function marker(score: number, dq: boolean, w: boolean): string {
  if (w) return "W";
  if (dq) return "DQ";
  return String(score);
}

/**
 * FR-001〜FR-007: 両出場者のスコア(0〜3)・DQ・W入力から勝者を自動判定する
 * 純粋関数。未入力側は0として扱う(FR-004)。同点(DQ/Wでない場合)・両者DQ・
 * 両者Wはエラーとして返す(FR-003/FR-006、およびWについても同様)。
 *
 * Wは「勝者は分かるがスコアは分からない」場合の入力(ユーザーフィードバック
 * 2026-08-12)。DQが「入力した側が敗者になる」のに対し、Wは「入力した側
 * 自身が勝者になる」逆方向の意味を持つ。W/DQが同時に成立する場合(片方が
 * W・もう片方がDQ)は矛盾しない(どちらの入力も同じ側の勝利を指すため)ので
 * エラーにはしない。
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
  if (input.entrant1W && input.entrant2W) {
    return { error: "BOTH_W" };
  }
  if (input.entrant1DQ && input.entrant2DQ) {
    return { error: "BOTH_DQ" };
  }

  const score1 = input.entrant1Score ?? 0;
  const score2 = input.entrant2Score ?? 0;
  const score = `${marker(score1, input.entrant1DQ, input.entrant1W)}-${marker(score2, input.entrant2DQ, input.entrant2W)}`;

  if (input.entrant1W) {
    return { winnerSlot: "entrant1", score };
  }
  if (input.entrant2W) {
    return { winnerSlot: "entrant2", score };
  }
  if (input.entrant1DQ) {
    return { winnerSlot: "entrant2", score };
  }
  if (input.entrant2DQ) {
    return { winnerSlot: "entrant1", score };
  }

  if (score1 === score2) {
    return { error: "TIE" };
  }

  return {
    winnerSlot: score1 > score2 ? "entrant1" : "entrant2",
    score: `${score1}-${score2}`,
  };
}
