import type { MatchCard } from "../../domain/entities/matchCard.js";
import { findOccupyingMatchCard } from "../../domain/rules/tableAssignment.js";

interface TableNumberOptionsProps {
  tableNumbers: string[];
  matchCards: MatchCard[];
  /** この対戦カード自身が使用中の対戦台は、占有中とみなさない。 */
  excludeCardId?: string;
  /**
   * ユーザーフィードバック(2026-10-19): 占有中判定(進行中の対戦との
   * 対戦台の重複)を適用するかどうか。未着手の対戦カードは、このまま
   * 選んでもすぐに対戦が始まるわけではないため、全ての対戦台から自由に
   * 選べる(ブロックしない)。NextMatchModal.tsxのように、選択と同時に
   * 進行中へ変更される(=本当に対戦台を使い始める)場面でのみtrueにする。
   */
  enforceOccupancy: boolean;
}

/**
 * 対戦台選択のプルダウン用に、対戦台番号の`<option>`一覧を作る。
 * (enforceOccupancyがtrueの場合のみ)他の進行中の対戦カードが既に
 * 使用している対戦台は、選択できないよう`disabled`にし、どの対戦が
 * 使用中かを選択肢の表示テキストに含める(ユーザーフィードバック:
 * 進行中同士で同じ対戦台を選んだ場合のみブロックし、どの対戦が使っているか
 * 分かるようにしてほしい)。
 */
export function TableNumberOptions({
  tableNumbers,
  matchCards,
  excludeCardId,
  enforceOccupancy,
}: TableNumberOptionsProps) {
  return (
    <>
      {tableNumbers.map((n) => {
        const occupyingCard = enforceOccupancy
          ? findOccupyingMatchCard(n, matchCards, excludeCardId)
          : null;
        return (
          <option key={n} value={n} disabled={occupyingCard !== null}>
            {occupyingCard ? `${n}(進行中: ${occupyingCard.identifier})` : n}
          </option>
        );
      })}
    </>
  );
}
