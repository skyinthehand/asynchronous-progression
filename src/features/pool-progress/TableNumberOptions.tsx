import type { MatchCard } from "../../domain/entities/matchCard.js";
import { findOccupyingMatchCard } from "../../domain/rules/tableAssignment.js";

interface TableNumberOptionsProps {
  tableNumbers: string[];
  matchCards: MatchCard[];
  /** この対戦カード自身が使用中の対戦台は、占有中とみなさない。 */
  excludeCardId?: string;
}

/**
 * 対戦台選択のプルダウン用に、対戦台番号の`<option>`一覧を作る。他の
 * 未完了の対戦カードが既に使用している対戦台は、選択できないよう
 * `disabled`にし、どの対戦が使用中かを選択肢の表示テキストに含める
 * (ユーザーフィードバック: 進行中の対戦台には変更できず、どの対戦が
 * 使っているか分かるようにしてほしい)。
 */
export function TableNumberOptions({
  tableNumbers,
  matchCards,
  excludeCardId,
}: TableNumberOptionsProps) {
  return (
    <>
      {tableNumbers.map((n) => {
        const occupyingCard = findOccupyingMatchCard(
          n,
          matchCards,
          excludeCardId,
        );
        return (
          <option key={n} value={n} disabled={occupyingCard !== null}>
            {occupyingCard ? `${n}(進行中: ${occupyingCard.identifier})` : n}
          </option>
        );
      })}
    </>
  );
}
