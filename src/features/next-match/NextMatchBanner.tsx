import type { Entrant } from "../../domain/entities/entrant.js";

interface NextMatchBannerProps {
  entrants: Entrant[];
}

/**
 * FR-018/FR-019/FR-020: プール内の全対戦を終えた選手について、次戦の
 * 対戦相手・卓番号を表示する。下位クラスのプールでも同様に扱われる
 * (クラスによる絞り込みを行わない)。
 */
export function NextMatchBanner({ entrants }: NextMatchBannerProps) {
  const finished = entrants.filter((entrant) => entrant.poolFinished);

  if (finished.length === 0) {
    return null;
  }

  return (
    <section className="next-match-banner">
      <h2>予選通過・次戦案内</h2>
      <ul>
        {finished.map((entrant) => (
          <li key={entrant.id}>
            <strong>{entrant.name}</strong>:{" "}
            {entrant.nextMatch?.confirmed ? (
              <>
                対戦相手 {entrant.nextMatch.opponentName ?? "不明"} / 卓{" "}
                {entrant.nextMatch.tableNumber ?? "未定"}
              </>
            ) : (
              "次戦は未確定です"
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
