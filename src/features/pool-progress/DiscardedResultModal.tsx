import { Modal } from "../../components/index.js";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";

interface DiscardedResultModalProps {
  /** discardedLocalResultを持つ(=まだ確認されていない)対戦カード。 */
  cards: MatchCard[];
  entrantById: Map<string, Entrant>;
  onAcknowledge: () => void;
}

function entrantName(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "不明";
  return entrantById.get(id)?.name ?? id;
}

/**
 * ユーザーフィードバック(2026-10-20): アプリで入力した結果をstart.ggへ
 * 送信する前に、start.gg側で別の勝者の結果が入力されていたため、
 * start.ggの結果を正としてアプリの結果を破棄したことを知らせる
 * (syncRunner.tsのmergeMatchCard参照)。確認するまで毎回表示する。
 */
export function DiscardedResultModal({
  cards,
  entrantById,
  onAcknowledge,
}: DiscardedResultModalProps) {
  return (
    <Modal
      title="アプリで入力した結果を破棄しました"
      onClose={onAcknowledge}
      footer={
        <button type="button" onClick={onAcknowledge}>
          確認
        </button>
      }
    >
      <p>
        以下の対戦は、アプリの結果をstart.ggへ送信する前に、start.gg側で別の結果が入力されていました。start.ggの結果を正とし、アプリで入力した結果は破棄しました。
      </p>
      <ul>
        {cards.map((card) => (
          <li key={card.id}>
            Set {card.identifier}: アプリの勝者{" "}
            {entrantName(
              entrantById,
              card.discardedLocalResult?.winnerId ?? null,
            )}
            {" → "}start.ggの勝者 {entrantName(entrantById, card.winnerId)}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
