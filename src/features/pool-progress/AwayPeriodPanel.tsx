import { useState } from "react";
import { Table } from "../../components/index.js";
import type { Entrant } from "../../domain/entities/entrant.js";
import { formatAwayStartedAt } from "../../domain/rules/awayPeriodFormat.js";

interface AwayPeriodPanelProps {
  entrants: Entrant[];
  onStartAwayPeriod: (entrantId: string, reason: string | null) => void;
  onEndAwayPeriod: (entrantId: string) => void;
}

function currentAwayPeriod(entrant: Entrant) {
  return entrant.awayPeriods.find((period) => period.endedAt === null);
}

function isAway(entrant: Entrant): boolean {
  return currentAwayPeriod(entrant) !== undefined;
}

/** FR-005: 選手が離席した時間帯(開始・終了、任意で理由)を記録する。 */
export function AwayPeriodPanel({
  entrants,
  onStartAwayPeriod,
  onEndAwayPeriod,
}: AwayPeriodPanelProps) {
  const [reason, setReason] = useState("");

  return (
    <section className="away-period-panel">
      <label>
        理由(任意):
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="例: トイレ"
        />
      </label>
      <Table
        rowKey={(entrant: Entrant) => entrant.id}
        rows={entrants}
        columns={[
          {
            key: "name",
            header: "選手名",
            render: (e) => {
              const away = currentAwayPeriod(e);
              return (
                <>
                  {e.name}
                  {away && (
                    <span className="away-started-at">
                      ({formatAwayStartedAt(away.startedAt)}〜
                      {away.reason && `・${away.reason}`})
                    </span>
                  )}
                </>
              );
            },
          },
          {
            key: "status",
            header: "状態",
            render: (e) => (isAway(e) ? "離席中" : "着席"),
          },
          {
            key: "action",
            header: "操作",
            render: (entrant) =>
              isAway(entrant) ? (
                <button
                  type="button"
                  onClick={() => onEndAwayPeriod(entrant.id)}
                >
                  戻った
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onStartAwayPeriod(entrant.id, reason.trim() || null)
                  }
                >
                  離席
                </button>
              ),
          },
        ]}
      />
    </section>
  );
}
