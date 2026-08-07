import "./print.css";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import type { Pool } from "../../domain/entities/pool.js";
import { BracketPrintLayout } from "./BracketPrintLayout.js";
import { TablePrintLayout } from "./TablePrintLayout.js";

interface PrintPageProps {
  pool: Pool;
  matchCards: MatchCard[];
  entrants: Entrant[];
  onClose: () => void;
}

/**
 * FR-023/FR-024/FR-025: プールの進行状況をstartggの印刷/PDF出力に準じた
 * レイアウトで表示する。`bracketType` に応じてブラケット形式/表形式を
 * 切り替える。操作用ボタンは `no-print` クラスにより実際の印刷時のみ除外
 * する(FR-024)。
 */
export function PrintPage({
  pool,
  matchCards,
  entrants,
  onClose,
}: PrintPageProps) {
  const hasBracket =
    pool.bracketType !== "ROUND_ROBIN" && pool.bracketType !== "OTHER";

  return (
    <div className="print-page">
      <div className="no-print print-page-controls">
        <button type="button" onClick={() => window.print()}>
          印刷
        </button>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
      <header className="print-page-header">
        <div>
          <h2>{pool.displayIdentifier}</h2>
          <p>予選プール</p>
        </div>
        <dl>
          <dt>{pool.tournamentName ?? pool.tournamentSlug}</dt>
          {pool.eventName && <dd>{pool.eventName}</dd>}
          <dt>Judge:</dt>
          <dd>&nbsp;</dd>
        </dl>
      </header>
      {hasBracket ? (
        <BracketPrintLayout matchCards={matchCards} entrants={entrants} />
      ) : (
        <TablePrintLayout matchCards={matchCards} entrants={entrants} />
      )}
      <footer className="print-page-footer">
        Generated on {new Date().toLocaleString("ja-JP")}
      </footer>
    </div>
  );
}
