import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { groupBySideAndRound } from "../../domain/rules/bracketGrouping.js";

interface BracketPrintLayoutProps {
  matchCards: MatchCard[];
  entrants: Entrant[];
}

function name(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
}

/**
 * FR-023/FR-024: 勝敗ブラケット形式のプールの印刷レイアウト。
 * `impact_major_4_brackets.pdf` を参考に、Winners/Losers側をラウンドごとに
 * 区切って表示する(座標付きの結線図の再現は対象外、対戦カードの一覧性を
 * 優先する)。
 */
export function BracketPrintLayout({
  matchCards,
  entrants,
}: BracketPrintLayoutProps) {
  const entrantById = new Map(entrants.map((entrant) => [entrant.id, entrant]));
  const sides = groupBySideAndRound(matchCards);

  return (
    <div className="bracket-print-layout">
      {(["WINNERS", "LOSERS"] as const).map((side) => {
        const rounds = [...sides[side].keys()].sort((a, b) => a - b);
        if (rounds.length === 0) return null;
        return (
          <div className="bracket-print-side" key={side}>
            <h3>{side === "WINNERS" ? "Winners" : "Losers"}</h3>
            {rounds.map((round) => (
              <div className="bracket-print-round" key={round}>
                <h4>Round {round}</h4>
                {sides[side].get(round)?.map((card) => (
                  <div className="bracket-print-card" key={card.id}>
                    <span>{card.identifier}</span>
                    <span>
                      {name(entrantById, card.entrant1Id)} vs{" "}
                      {name(entrantById, card.entrant2Id)}
                    </span>
                    <span>
                      {card.status === "COMPLETED"
                        ? `勝者: ${name(entrantById, card.winnerId)}${
                            card.score ? ` (${card.score})` : ""
                          }`
                        : "未着手"}
                    </span>
                    <span>
                      {card.tableNumber ? `卓 ${card.tableNumber}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
