import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";

interface TablePrintLayoutProps {
  matchCards: MatchCard[];
  entrants: Entrant[];
}

function name(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
}

/** FR-025: 総当り形式など、ブラケット図を持たない形式の印刷レイアウト。 */
export function TablePrintLayout({
  matchCards,
  entrants,
}: TablePrintLayoutProps) {
  const entrantById = new Map(entrants.map((entrant) => [entrant.id, entrant]));

  return (
    <div className="table-print-layout">
      <table>
        <thead>
          <tr>
            <th>対戦</th>
            <th>選手1</th>
            <th>選手2</th>
            <th>結果</th>
          </tr>
        </thead>
        <tbody>
          {matchCards.map((card) => (
            <tr key={card.id}>
              <td>{card.identifier}</td>
              <td>{name(entrantById, card.entrant1Id)}</td>
              <td>{name(entrantById, card.entrant2Id)}</td>
              <td>
                {card.status === "COMPLETED"
                  ? `勝者: ${name(entrantById, card.winnerId)}${
                      card.score ? ` (${card.score})` : ""
                    }`
                  : "未着手"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
