import { useState } from "react";
import { Table } from "../../components/index.js";
import type { Attendance, Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { formatAwayStartedAt } from "../../domain/rules/awayPeriodFormat.js";
import {
  currentAwayPeriod,
  isEntrantAway,
} from "../../domain/rules/awayStatus.js";

interface PlayersTabProps {
  entrants: Entrant[];
  matchCards: MatchCard[];
  nextCardIds: Set<string>;
  onRecordAttendance: (entrantId: string, attendance: Attendance) => void;
  onStartAwayPeriod: (entrantId: string, reason: string | null) => void;
  onEndAwayPeriod: (entrantId: string) => void;
}

const ATTENDANCE_OPTIONS: { value: Attendance; label: string }[] = [
  { value: "PRESENT", label: "出席" },
  { value: "UNKNOWN", label: "未確認" },
  { value: "ABSENT", label: "欠席" },
];

interface PlayerStatus {
  text: string;
  chipCls: string;
}

/**
 * デザイン刷新(2026-10-09): モックアップの選手一覧(出欠・離席・状態を
 * 1つの表に統合)。状態列は、プール終了(poolFinished)・対戦中・次に
 * 呼び出し・次戦待ち・待機を実データ(matchCards/nextCardIds)から導出する
 * (モックアップのpstate/plistと同じ考え方)。
 */
function computeStatus(
  entrant: Entrant,
  matchCards: MatchCard[],
  nextCardIds: Set<string>,
): PlayerStatus {
  if (entrant.poolFinished) {
    return { text: "予選終了", chipCls: "chip dark" };
  }
  const myCards = matchCards.filter(
    (card) => card.entrant1Id === entrant.id || card.entrant2Id === entrant.id,
  );
  const live = myCards.find((card) => card.status === "IN_PROGRESS");
  if (live) {
    return {
      text: `対戦中 · 卓 ${live.tableNumber ?? "—"}`,
      chipCls: "chip dark",
    };
  }
  const next = myCards.find((card) => nextCardIds.has(card.id));
  if (next) {
    return {
      text: `次に呼び出し · ${next.identifier}`,
      chipCls: "chip yellow",
    };
  }
  const ready = myCards.find(
    (card) =>
      card.status === "NOT_STARTED" && card.entrant1Id && card.entrant2Id,
  );
  if (ready) {
    return { text: `次戦 ${ready.identifier}`, chipCls: "chip" };
  }
  return { text: "待機", chipCls: "chip mute" };
}

export function PlayersTab({
  entrants,
  matchCards,
  nextCardIds,
  onRecordAttendance,
  onStartAwayPeriod,
  onEndAwayPeriod,
}: PlayersTabProps) {
  const [awayReason, setAwayReason] = useState("");

  return (
    <div className="players-tab">
      <label className="players-tab-away-reason">
        離席理由(任意):
        <input
          value={awayReason}
          onChange={(event) => setAwayReason(event.target.value)}
          placeholder="例: トイレ"
        />
      </label>
      <Table
        rowKey={(entrant: Entrant) => entrant.id}
        rows={entrants}
        columns={[
          {
            key: "seed",
            header: "SEED",
            render: (e) => <span className="mono">{e.seed ?? ""}</span>,
          },
          { key: "name", header: "選手", render: (e) => e.name },
          {
            key: "attendance",
            header: "出欠",
            render: (entrant) => (
              <fieldset className="seg">
                <legend className="sr-only">{entrant.name} の出欠</legend>
                {ATTENDANCE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={entrant.attendance === option.value}
                    className={entrant.attendance === option.value ? "on" : ""}
                    onClick={() => onRecordAttendance(entrant.id, option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </fieldset>
            ),
          },
          {
            key: "away",
            header: "離席",
            render: (entrant) => {
              const away = currentAwayPeriod(entrant);
              return isEntrantAway(entrant) ? (
                <>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => onEndAwayPeriod(entrant.id)}
                  >
                    離席中 · 戻った
                  </button>
                  {away && (
                    <span className="away-started-at">
                      ({formatAwayStartedAt(away.startedAt)}〜
                      {away.reason && `・${away.reason}`})
                    </span>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onStartAwayPeriod(entrant.id, awayReason.trim() || null)
                  }
                >
                  離席する
                </button>
              );
            },
          },
          {
            key: "status",
            header: "状態",
            render: (entrant) => {
              const status = computeStatus(entrant, matchCards, nextCardIds);
              return <span className={status.chipCls}>{status.text}</span>;
            },
          },
        ]}
      />
    </div>
  );
}
