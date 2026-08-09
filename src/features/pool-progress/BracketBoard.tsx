import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import type { BracketSide } from "../../domain/rules/bracketGrouping.js";
import { computeBracketLayout } from "../../domain/rules/bracketLayout.js";
import { MatchCardEntry } from "./MatchCardEntry.js";

interface BracketBoardProps {
  matchCards: MatchCard[];
  entrantById: Map<string, Entrant>;
  nextCardId: string | null;
  onRecordResult: (
    matchCardId: string,
    winnerId: string,
    score: string | null,
  ) => void;
}

/**
 * 対戦カードはJS側の絶対配置(position: absolute)でツリー状に並べるため、
 * ROW_HEIGHTは「1枚のカードが取りうる最大の高さ」以上でなければ、隣接する
 * カード同士が重なってしまう。startgg本家は列幅180px・行ピッチ約66pxだが、
 * 本家のカードは選手名の表示のみ(結果入力は別画面)なのに対し、本アプリは
 * カード内に常時タップ可能な結果入力ボタン(--touch-target-min: 44px)を
 * 表示するため、その分カードが縦に厚い。特に確定済みの対戦で「結果を修正」
 * を開いた状態(スコア入力+選手2名分のボタン+キャンセルボタンが縦に並ぶ)
 * が最も高さを取り、実測(Chromiumで開発サーバーをレンダリングして
 * getBoundingClientRectで計測)で約313pxだった。これに注記(2行,
 * 最大30px)分と安全マージンを足した350pxをROW_HEIGHTとして使う。
 * global.css側の.match-card内要素の高さを変更する場合は、この値も
 * 合わせて見直すこと(念のためglobal.css側にも
 * `:has(.match-card-edit-form)` 発火時にカードを最前面へ押し上げる
 * フォールバックを入れてあるが、通常はROW_HEIGHT側の余裕で吸収される
 * べきで、そちらに頼らない)。ラウンド間の縦位置(slot)はbracketLayout.ts
 * 側で「出場元カード2枚の位置の平均」として計算されるため、ROW_HEIGHTの
 * 値はどのラウンド数でも比例したツリー形状になる。
 */
const COLUMN_WIDTH = 220;
const COLUMN_GAP = 32;
const ROW_HEIGHT = 350;
const HEADER_HEIGHT = 24;

function sideLabel(side: BracketSide) {
  return side === "WINNERS" ? "Winners" : "Losers";
}

function columnLeft(roundIndex: number) {
  return roundIndex * (COLUMN_WIDTH + COLUMN_GAP);
}

/**
 * startggの本家ラウンド見出し(例: "Winners Quarter-Final")に倣い、最終
 * ラウンドから数えた位置でFinal/Semi-Final/Quarter-Finalの呼称を割り当てる。
 */
function roundLabel(
  side: BracketSide,
  roundIndex: number,
  totalRounds: number,
) {
  const prefix = sideLabel(side);
  const remaining = totalRounds - 1 - roundIndex;
  if (remaining === 0) return `${prefix} Final`;
  if (remaining === 1) return `${prefix} Semi-Final`;
  if (remaining === 2) return `${prefix} Quarter-Final`;
  return `${prefix} Round ${roundIndex + 1}`;
}

/**
 * 対戦をつなぐ線をstartgg風の角丸エルボー曲線で描画する(直角のカクカクした
 * 線ではなく、四分円カーブで折れ曲がる)。縦位置が同じ場合は直線。
 */
function connectorPath(x1: number, y1: number, x2: number, y2: number) {
  if (y1 === y2) {
    return `M ${x1} ${y1} H ${x2}`;
  }
  const midX = x1 + (x2 - x1) / 2;
  const radius = Math.min(10, Math.abs(midX - x1), Math.abs(y2 - y1) / 2);
  const verticalSign = y2 > y1 ? 1 : -1;
  return [
    `M ${x1} ${y1}`,
    `H ${midX - radius}`,
    `Q ${midX} ${y1} ${midX} ${y1 + radius * verticalSign}`,
    `V ${y2 - radius * verticalSign}`,
    `Q ${midX} ${y2} ${midX + radius} ${y2}`,
    `H ${x2}`,
  ].join(" ");
}

/**
 * FR-023: 勝者側/敗者側トーナメントのプールを、startggのブラケット表示に
 * 合わせてラウンド列・対戦をつなぐ角丸の線で表示する。線の描画には各対戦
 * カードの出場元カード情報(entrant1/entrant2SourceMatchId)を用いる。別の側
 * (勝者側の敗者が敗者側に落ちる等)から出場者が来ている場合は、側をまたぐ
 * 結線は行わず対戦カード内の注記で示す(startgg本家もWinners/Losersを別々の
 * パネルとして縦に並べており、パネルをまたぐ線は引かれない)。
 */
export function BracketBoard({
  matchCards,
  entrantById,
  nextCardId,
  onRecordResult,
}: BracketBoardProps) {
  const layouts = computeBracketLayout(matchCards);

  return (
    <div className="bracket-board">
      {layouts.map((layout) => {
        const allMatches = [...layout.matchesByRound.values()].flat();
        const maxSlot = allMatches.reduce(
          (max, match) => Math.max(max, match.slot),
          0,
        );
        const totalWidth =
          layout.rounds.length * COLUMN_WIDTH +
          (layout.rounds.length - 1) * COLUMN_GAP;
        const totalHeight = HEADER_HEIGHT + (maxSlot + 1) * ROW_HEIGHT;

        return (
          <div className="bracket-board-side" key={layout.side}>
            <h3>{sideLabel(layout.side)}</h3>
            <div className="bracket-tree-scroll">
              <div
                className="bracket-tree"
                style={{ width: totalWidth, height: totalHeight }}
              >
                <svg
                  className="bracket-tree-lines"
                  width={totalWidth}
                  height={totalHeight}
                  aria-hidden="true"
                >
                  {layout.connectors.map((connector) => {
                    const x1 =
                      columnLeft(connector.fromRoundIndex) + COLUMN_WIDTH;
                    const y1 =
                      HEADER_HEIGHT +
                      connector.fromSlot * ROW_HEIGHT +
                      ROW_HEIGHT / 2;
                    const x2 = columnLeft(connector.toRoundIndex);
                    const y2 =
                      HEADER_HEIGHT +
                      connector.toSlot * ROW_HEIGHT +
                      ROW_HEIGHT / 2;
                    return (
                      <path
                        key={`${connector.fromMatchId}-${connector.toMatchId}`}
                        className="bracket-connector"
                        d={connectorPath(x1, y1, x2, y2)}
                        fill="none"
                      />
                    );
                  })}
                </svg>
                {layout.rounds.map((round, roundIndex) => (
                  <div
                    className="bracket-tree-round-label"
                    key={round}
                    style={{
                      left: columnLeft(roundIndex),
                      width: COLUMN_WIDTH,
                    }}
                  >
                    {roundLabel(layout.side, roundIndex, layout.rounds.length)}
                  </div>
                ))}
                <ul className="bracket-tree-matches">
                  {layout.rounds.flatMap((round, roundIndex) =>
                    (layout.matchesByRound.get(round) ?? []).map((match) => {
                      const origins = layout.crossSideOrigins.filter(
                        (origin) => origin.toMatchId === match.card.id,
                      );
                      const note =
                        origins.length > 0
                          ? `${origins
                              .map(
                                (origin) =>
                                  `${sideLabel(origin.fromSide)} ${origin.fromIdentifier}`,
                              )
                              .join("・")} より`
                          : undefined;
                      return (
                        <MatchCardEntry
                          key={match.card.id}
                          card={match.card}
                          entrantById={entrantById}
                          isNext={nextCardId === match.card.id}
                          onRecordResult={onRecordResult}
                          note={note}
                          style={{
                            position: "absolute",
                            left: columnLeft(roundIndex),
                            top: HEADER_HEIGHT + match.slot * ROW_HEIGHT,
                            width: COLUMN_WIDTH,
                          }}
                        />
                      );
                    }),
                  )}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
