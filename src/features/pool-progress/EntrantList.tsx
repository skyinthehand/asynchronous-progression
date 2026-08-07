import { Table } from "../../components/index.js";
import type { Entrant } from "../../domain/entities/entrant.js";
import { NextMatchBanner } from "../next-match/NextMatchBanner.js";

interface EntrantListProps {
  entrants: Entrant[];
}

/**
 * FR-020: Bクラス以下を含むすべてのクラス・プールの選手を、上位クラスと
 * 区別せず同一の一覧・次戦案内の対象として扱う(クラスによる絞り込みを
 * 行わないことがそのまま実装上の担保になる)。
 */
export function EntrantList({ entrants }: EntrantListProps) {
  return (
    <section className="entrant-list">
      <Table
        rowKey={(entrant: Entrant) => entrant.id}
        rows={entrants}
        columns={[
          { key: "name", header: "選手名", render: (e) => e.name },
          {
            key: "poolFinished",
            header: "予選状況",
            render: (e) => (e.poolFinished ? "予選通過" : "予選中"),
          },
        ]}
      />
      <NextMatchBanner entrants={entrants} />
    </section>
  );
}
