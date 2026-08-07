import { useState } from "react";
import { PrintPage } from "../print/PrintPage.js";
import { AttendancePanel } from "./AttendancePanel.js";
import { AwayPeriodPanel } from "./AwayPeriodPanel.js";
import { EntrantList } from "./EntrantList.js";
import { MatchCardList } from "./MatchCardList.js";
import { StaffAssignmentPanel } from "./StaffAssignmentPanel.js";
import { usePoolProgress } from "./usePoolProgress.js";

/** US2/US7: 予選プール進行のオフライン入力・保持と印刷ページ切り替え。 */
export function PoolProgressScreen() {
  const {
    loading,
    poolId,
    pool,
    entrants,
    matchCards,
    recordAttendance,
    startAwayPeriod,
    endAwayPeriod,
    recordStaffAssignment,
    recordResult,
  } = usePoolProgress();
  const [printing, setPrinting] = useState(false);

  if (loading) {
    return <p>プール情報を読み込んでいます…</p>;
  }

  if (!poolId) {
    return (
      <p>対象プールが未設定です。管理画面で初期化を行ってください(FR-010)。</p>
    );
  }

  if (printing && pool) {
    return (
      <PrintPage
        pool={pool}
        matchCards={matchCards}
        entrants={entrants}
        onClose={() => setPrinting(false)}
      />
    );
  }

  return (
    <div className="pool-progress-screen">
      <h2>
        {pool?.displayIdentifier ?? poolId}
        <button
          type="button"
          className="no-print"
          onClick={() => setPrinting(true)}
        >
          印刷用ページ
        </button>
      </h2>
      <StaffAssignmentPanel
        pool={pool}
        onRecordStaffAssignment={recordStaffAssignment}
      />
      <AttendancePanel
        entrants={entrants}
        onRecordAttendance={recordAttendance}
      />
      <AwayPeriodPanel
        entrants={entrants}
        onStartAwayPeriod={startAwayPeriod}
        onEndAwayPeriod={endAwayPeriod}
      />
      <MatchCardList
        matchCards={matchCards}
        entrants={entrants}
        onRecordResult={recordResult}
      />
      <EntrantList entrants={entrants} />
    </div>
  );
}
