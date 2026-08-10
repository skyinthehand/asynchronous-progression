import { useState } from "react";
import { Modal } from "../../components/index.js";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";

interface NextMatchModalProps {
  card: MatchCard;
  table: string | null;
  entrantById: Map<string, Entrant>;
  tableCount: number | null;
  onStart: (tableNumber: string | null) => void;
  onSkip: () => void;
  onClose: () => void;
}

function entrantName(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
}

/**
 * FR-022〜FR-025: 対戦結果確定直後に自動表示する、次戦候補のモーダル。
 * 「対戦開始」(対戦台番号は任意)・「スキップ」の2アクションのみを持ち、
 * 「別の対戦を選ぶ」ボタンは設けない(spec.md Clarifications Q3。別の対戦を
 * 呼びたい場合は一覧から直接開始する)。いずれも選ばずに閉じた場合は対戦の
 * 状態を変更しない(FR-025、onCloseのみ呼ぶ)。
 */
export function NextMatchModal({
  card,
  table,
  entrantById,
  tableCount,
  onStart,
  onSkip,
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
      {tableCount != null && tableCount > 0 && (
        <label className="next-match-modal-table-select">
          対戦台(任意):
          <select
            aria-label="次戦の対戦台"
            value={tableNumber}
            onChange={(event) => setTableNumber(event.target.value)}
          >
            <option value="">未設定</option>
            {Array.from({ length: tableCount }, (_, i) => String(i + 1)).map(
              (n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ),
            )}
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
        <button type="button" onClick={onSkip}>
          スキップ
        </button>
      </div>
    </Modal>
  );
}
