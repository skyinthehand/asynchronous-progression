import { useEffect, useState } from "react";
import { Modal } from "../../components/index.js";
import type { Pool } from "../../domain/entities/pool.js";
import { PrintPage } from "../print/PrintPage.js";
import { AttendancePanel } from "./AttendancePanel.js";
import { AwayPeriodPanel } from "./AwayPeriodPanel.js";
import { EntrantList } from "./EntrantList.js";
import { MatchCardList } from "./MatchCardList.js";
import { NextMatchModal } from "./NextMatchModal.js";
import { PoolOnboardingWizard } from "./PoolOnboardingWizard.js";
import { StaffAssignmentPanel } from "./StaffAssignmentPanel.js";
import { usePoolProgress } from "./usePoolProgress.js";

type PanelKey = "staff" | "attendance" | "away" | "entrants";

const PANEL_TITLES: Record<PanelKey, string> = {
  staff: "進行担当者",
  attendance: "出欠確認",
  away: "離席記録",
  entrants: "選手一覧・次戦案内",
};

/**
 * 画面ヘッダーに「トーナメント名 - イベント名 - フェーズ名 - プール名」を
 * 表示する。いずれかが未取得(null)の場合はその部分を省く(古いレコード
 * 等でtournamentName/eventName/phaseNameが空のことがあるため)。
 */
function poolHeading(pool: Pool | null, poolId: string): string {
  if (!pool) return poolId;
  return [
    pool.tournamentName,
    pool.eventName,
    pool.phaseName,
    pool.displayIdentifier,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" - ");
}

/**
 * US2/US7: 予選プール進行のオフライン入力・保持と印刷ページ切り替え。
 * タブレット操作を前提に、基本画面には対戦カード(トーナメント表)のみを
 * 表示し、進行担当者・出欠確認・離席記録・選手一覧はボタンから開く
 * モーダルに集約する。
 */
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
    completeOnboarding,
    assignTable,
    nextMatchSuggestion,
    callSuggestedMatch,
    skipSuggestion,
    dismissSuggestion,
    setInProgress,
  } = usePoolProgress();
  const [printing, setPrinting] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (pool && !pool.onboardingCompletedAt) {
      setShowOnboarding(true);
    }
  }, [pool]);

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
      <h2>{poolHeading(pool, poolId)}</h2>
      <div className="pool-progress-toolbar no-print">
        <button type="button" onClick={() => setActivePanel("staff")}>
          進行担当者
        </button>
        <button type="button" onClick={() => setActivePanel("attendance")}>
          出欠確認
        </button>
        <button type="button" onClick={() => setActivePanel("away")}>
          離席記録
        </button>
        <button type="button" onClick={() => setActivePanel("entrants")}>
          選手一覧
        </button>
        <button type="button" onClick={() => setPrinting(true)}>
          印刷用ページ
        </button>
      </div>

      <MatchCardList
        pool={pool}
        matchCards={matchCards}
        entrants={entrants}
        onRecordResult={recordResult}
        onAssignTable={assignTable}
        onSetInProgress={setInProgress}
      />

      {activePanel && (
        <Modal
          title={PANEL_TITLES[activePanel]}
          onClose={() => setActivePanel(null)}
        >
          {activePanel === "staff" && (
            <StaffAssignmentPanel
              pool={pool}
              onRecordStaffAssignment={recordStaffAssignment}
            />
          )}
          {activePanel === "attendance" && (
            <AttendancePanel
              entrants={entrants}
              onRecordAttendance={recordAttendance}
            />
          )}
          {activePanel === "away" && (
            <AwayPeriodPanel
              entrants={entrants}
              onStartAwayPeriod={startAwayPeriod}
              onEndAwayPeriod={endAwayPeriod}
            />
          )}
          {activePanel === "entrants" && <EntrantList entrants={entrants} />}
        </Modal>
      )}

      {nextMatchSuggestion &&
        (() => {
          const suggestedCard = matchCards.find(
            (card) => card.id === nextMatchSuggestion.matchCardId,
          );
          if (!suggestedCard) return null;
          const entrantById = new Map(
            entrants.map((entrant) => [entrant.id, entrant]),
          );
          return (
            <NextMatchModal
              card={suggestedCard}
              table={nextMatchSuggestion.table}
              entrantById={entrantById}
              tableNumbers={pool?.tableNumbers ?? []}
              onStart={(tableNumber) =>
                callSuggestedMatch(suggestedCard.id, tableNumber)
              }
              onSkip={() => skipSuggestion(suggestedCard.id)}
              onClose={dismissSuggestion}
            />
          );
        })()}

      {showOnboarding && pool && (
        <PoolOnboardingWizard
          pool={pool}
          entrants={entrants}
          onRecordStaffAssignment={recordStaffAssignment}
          onRecordAttendance={recordAttendance}
          onFinish={() => {
            setShowOnboarding(false);
            void completeOnboarding();
          }}
        />
      )}
    </div>
  );
}
