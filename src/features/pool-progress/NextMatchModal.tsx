import { useState } from "react";
import { Modal } from "../../components/index.js";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { TableNumberOptions } from "./TableNumberOptions.js";

interface NextMatchModalProps {
  card: MatchCard;
  table: string | null;
  entrantById: Map<string, Entrant>;
  tableNumbers: string[];
  /** 対戦台選択肢の占有判定に使う、プール全体の対戦カード一覧。 */
  matchCards: MatchCard[];
  onStart: (tableNumber: string | null) => void;
  onClose: () => void;
}

function entrantName(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
}

/**
 * FR-022〜FR-025: 対戦結果確定直後に自動表示する、次戦候補のモーダル。
 * 「対戦開始」(対戦台番号は任意)のみを持ち、「別の対戦を選ぶ」ボタンは
 * 設けない(spec.md Clarifications Q3。別の対戦を呼びたい場合はモーダルを
 * 閉じてから一覧から直接開始する)。選ばずに閉じた場合は対戦の状態を
 * 変更しない(FR-025、onCloseのみ呼ぶ)。
 */
export function NextMatchModal({
  card,
  table,
  entrantById,
  tableNumbers,
  matchCards,
  onStart,
  onClose,
}: NextMatchModalProps) {
  // FR-023/Acceptance Scenario 7: サジェスト自体は対戦台に紐付くが、モーダル
  // 内の入力欄は「未入力」を既定値とする(入力しないまま「対戦開始」を選ぶと
  // 対戦台番号を割り当てずに進行中へ変更される、という挙動をspec.mdが明示
  // しているため、サジェスト対象の対戦台であっても事前入力はしない)。
  const [tableNumber, setTableNumber] = useState("");

  return (
    <Modal title="次戦候補" onClose={onClose}>
      <p className="next-match-modal-identifier">{card.identifier}</p>
      {table && <p className="next-match-modal-table">対戦台{table}へ</p>}
      <p className="next-match-modal-entrants">
        {entrantName(entrantById, card.entrant1Id)} vs{" "}
        {entrantName(entrantById, card.entrant2Id)}
      </p>
      {tableNumbers.length > 0 && (
        <label className="next-match-modal-table-select">
          対戦台(任意):
          <select
            aria-label="次戦の対戦台"
            value={tableNumber}
            onChange={(event) => setTableNumber(event.target.value)}
          >
            <option value="">未設定</option>
            <TableNumberOptions
              tableNumbers={tableNumbers}
              matchCards={matchCards}
              excludeCardId={card.id}
            />
          </select>
        </label>
      )}
      <div className="next-match-modal-actions">
        <button
          type="button"
          onClick={() => onStart(tableNumber.trim() || null)}
        >
          対戦開始
        </button>
      </div>
    </Modal>
  );
}
