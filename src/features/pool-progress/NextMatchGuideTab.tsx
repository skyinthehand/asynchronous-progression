import type { Entrant } from "../../domain/entities/entrant.js";

interface NextMatchGuideTabProps {
  entrants: Entrant[];
}

/**
 * デザイン刷新(2026-10-09): FR-018/FR-019/FR-020(旧NextMatchBanner)の
 * データをそのまま使い、モックアップの`.ncard`カードグリッドとして
 * 「次戦案内」タブに昇格させたもの。プール内の全対戦を終えた選手の次戦の
 * 対戦相手・卓番号を表示する(クラスによる絞り込みは行わない)。
 */
export function NextMatchGuideTab({ entrants }: NextMatchGuideTabProps) {
  const finished = entrants.filter((entrant) => entrant.poolFinished);

  if (finished.length === 0) {
    return <p className="guide-empty">まだ予選を終えた選手はいません。</p>;
  }

  return (
    <div className="guide-grid">
      {finished.map((entrant) => (
        <article className="ncard" key={entrant.id}>
          <div className="ncard-head">
            <span className="ncard-name">
              <span className="mono ncard-seed">{entrant.seed ?? ""}</span>{" "}
              {entrant.name}
            </span>
            <span className="chip dark">予選終了</span>
          </div>
          <dl className="kv">
            <dt>対戦相手</dt>
            <dd className={entrant.nextMatch?.opponentName ? "" : "tbd-val"}>
              {entrant.nextMatch?.confirmed
                ? (entrant.nextMatch.opponentName ?? "不明")
                : "未確定"}
            </dd>
            <dt>卓</dt>
            <dd className={entrant.nextMatch?.tableNumber ? "mono" : "tbd-val"}>
              {entrant.nextMatch?.confirmed
                ? `卓 ${entrant.nextMatch.tableNumber ?? "未定"}`
                : "未確定"}
            </dd>
          </dl>
        </article>
      ))}
    </div>
  );
}
