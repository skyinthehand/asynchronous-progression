import type { MatchCard } from "../../domain/entities/matchCard.js";
import { findOccupyingMatchCard } from "../../domain/rules/tableAssignment.js";

interface TableChipsProps {
  card: MatchCard;
  tableNumbers: string[];
  /** 対戦台選択肢の占有判定に使う、プール全体の対戦カード一覧。 */
  matchCards: MatchCard[];
  /** 選択中の対戦台番号(未設定はnull)。 */
  value: string | null;
  onSelect: (tableNumber: string | null) => void;
  /**
   * 占有中判定(進行中の対戦との対戦台の重複)を、このカードの状態に
   * 関わらず常に適用する。次戦候補モーダル(NextMatchModal)のように、
   * 選択と同時に進行中へ変更する場合に使う。
   */
  enforceOccupancy?: boolean;
  /** 区画の見出し・支援技術向けの名前(既定は「対戦台」)。 */
  label?: string;
}

/**
 * artifact更新(2026-10-17): セットの編集モーダルの対戦台選択を、
 * `<select>`(TableNumberOptions)からモックアップの`.tchips`(大きめ
 * ボタンのグリッド)に合わせる。総当り表(MatchCardRow.tsx)は従来の
 * `<select>`のままとする(到達不能パスのため構造は変更しない)。
 * ユーザーフィードバック(2026-10-20): 次戦候補モーダルでも同じ見た目で
 * 選べるよう、選択値と選択時の処理を呼び出し側から渡す形にした。
 */
export function TableChips({
  card,
  tableNumbers,
  matchCards,
  value: current,
  onSelect,
  enforceOccupancy = false,
  label = "対戦台",
}: TableChipsProps) {
  return (
    <div className="msec">
      <span className="label">対戦台</span>
      <fieldset className="tchips" aria-label={label}>
        <legend className="sr-only">{label}</legend>
        <button
          type="button"
          aria-pressed={current === null}
          className={["tchip", "unset", current === null ? "on" : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onSelect(null)}
        >
          未設定
        </button>
        {tableNumbers.map((n) => {
          // ユーザーフィードバック(2026-10-19): 占有中判定(進行中の対戦との
          // 対戦台の重複)は、このカード自身が進行中の場合のみ適用する。
          // 未着手のカードは、他の対戦が使用中の対戦台も含め全ての対戦台
          // から自由に選べる(すぐにその卓を使い始めるわけではないため)。
          const occupyingCard =
            enforceOccupancy || card.status === "IN_PROGRESS"
              ? findOccupyingMatchCard(n, matchCards, card.id)
              : null;
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
              onClick={() => onSelect(n)}
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
