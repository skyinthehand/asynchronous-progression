import type { MatchCard } from "../../domain/entities/matchCard.js";
import { findOccupyingMatchCard } from "../../domain/rules/tableAssignment.js";

interface TableChipsProps {
  card: MatchCard;
  tableNumbers: string[];
  /** 対戦台選択肢の占有判定に使う、プール全体の対戦カード一覧。 */
  matchCards: MatchCard[];
  onAssignTable: (
    matchCardId: string,
    tableNumber: string | null,
  ) => Promise<boolean>;
}

/**
 * artifact更新(2026-10-17): セットの編集モーダルの対戦台選択を、
 * `<select>`(TableNumberOptions)からモックアップの`.tchips`(大きめ
 * ボタンのグリッド)に合わせる。総当り表(MatchCardRow.tsx)は従来の
 * `<select>`のままとする(到達不能パスのため構造は変更しない)。
 */
export function TableChips({
  card,
  tableNumbers,
  matchCards,
  onAssignTable,
}: TableChipsProps) {
  const current = card.tableNumber;
  return (
    <div className="msec">
      <span className="label">対戦台</span>
      <fieldset className="tchips" aria-label="対戦台">
        <legend className="sr-only">対戦台</legend>
        <button
          type="button"
          aria-pressed={current === null}
          className={["tchip", "unset", current === null ? "on" : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onAssignTable(card.id, null)}
        >
          未設定
        </button>
        {tableNumbers.map((n) => {
          const occupyingCard = findOccupyingMatchCard(n, matchCards, card.id);
          return (
            <button
              key={n}
              type="button"
              disabled={occupyingCard !== null}
              aria-pressed={current === n}
              aria-label={
                occupyingCard
                  ? `卓 ${n}（${occupyingCard.identifier} が使用中）`
                  : `卓 ${n}`
              }
              className={["tchip", current === n ? "on" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onAssignTable(card.id, n)}
            >
              {n}
              {occupyingCard && <small>{occupyingCard.identifier}</small>}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
