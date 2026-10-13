import { useEffect, useState } from "react";
import type { Pool } from "../../domain/entities/pool.js";
import { computeBlockedMatches } from "../../domain/rules/nextMatchSuggestion.js";
import { findOccupyingMatchCard } from "../../domain/rules/tableAssignment.js";
import { PrintPage } from "../print/PrintPage.js";
import { MatchCardList } from "./MatchCardList.js";
import { NextMatchGuideTab } from "./NextMatchGuideTab.js";
import { NextMatchModal } from "./NextMatchModal.js";
import { PlayersTab } from "./PlayersTab.js";
import { PoolOnboardingWizard } from "./PoolOnboardingWizard.js";
import { StaffAssignmentPanel } from "./StaffAssignmentPanel.js";
import { usePoolProgress } from "./usePoolProgress.js";

type TabKey = "bracket" | "players" | "guide";

const BRACKET_TYPE_LABEL: Record<Pool["bracketType"], string> = {
  SINGLE_ELIMINATION: "シングルエリミ",
  DOUBLE_ELIMINATION: "ダブルエリミ",
  ROUND_ROBIN: "総当り",
  OTHER: "その他",
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
 * デザイン刷新(2026-10-09): モックアップに合わせ、プール統計(クラス/
 * 形式/空き卓/進行/担当者)+常時表示の「次の対戦」+卓の状況+タブ
 * (ブラケット/選手/次戦案内)の構成に作り直した。従来の「進行担当者/
 * 出欠確認/離席記録/選手一覧」の個別モーダルは、統計グリッド(進行担当者)
 * と「選手」タブ(出欠・離席・選手一覧を統合)に置き換えて廃止した。
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
    nextMatchSuggestions,
    suggestionModalOpen,
    openSuggestionModal,
    callSuggestedMatch,
    dismissSuggestion,
    setInProgress,
    isPreviewMode,
  } = usePoolProgress();
  const [printing, setPrinting] = useState(false);
  const [tab, setTab] = useState<TabKey>("bracket");
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

  // ユーザーフィードバック(2026-08-17): 総当り(ROUND_ROBIN)形式は動作
  // 確認がまだ不十分なため、後日対応予定として当面は非対応にする。管理
  // 画面の選択時点でも新規選択は防いでいるが(TournamentDrillDown.tsx)、
  // 既に選択済みの総当りプールが残っているケースに備え、ここでもプール
  // 全体をブロックする。
  if (pool?.bracketType === "ROUND_ROBIN") {
    return (
      <p role="alert">
        総当り形式のプールは現在非対応です。動作確認が整い次第、後日
        対応予定です。管理画面から別のプールを選択してください。
      </p>
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

  const entrantById = new Map(entrants.map((entrant) => [entrant.id, entrant]));
  const tableNumbers = pool?.tableNumbers ?? [];
  const busyTableNumbers = new Set(
    tableNumbers.filter((n) => findOccupyingMatchCard(n, matchCards) !== null),
  );
  const freeCount = tableNumbers.length - busyTableNumbers.size;
  const doneCount = matchCards.filter(
    (card) => card.status === "COMPLETED",
  ).length;
  const progressPct =
    matchCards.length > 0
      ? Math.round((doneCount / matchCards.length) * 100)
      : 0;

  const topSuggestion = nextMatchSuggestions[0] ?? null;
  const nextCard = topSuggestion
    ? (matchCards.find((card) => card.id === topSuggestion.matchCardId) ?? null)
    : null;
  const nextCardIds = new Set(nextMatchSuggestions.map((s) => s.matchCardId));
  // 出欠/離席により次戦候補から外れている「保留」の対戦(MatchCardList.tsx
  // のブラケットカード強調表示と同じ計算を再利用)。
  const blockedMatches = computeBlockedMatches(
    matchCards,
    entrants,
    nextCardIds,
  );

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "bracket", label: "ブラケット", count: matchCards.length },
    { key: "players", label: "選手", count: entrants.length },
    {
      key: "guide",
      label: "次戦案内",
      count: entrants.filter((e) => e.poolFinished).length,
    },
  ];

  return (
    <div
      className={[
        "pool-progress-screen",
        isPreviewMode ? "pool-progress-screen--preview" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <nav aria-label="パンくず" className="label pool-breadcrumb no-print">
        <span>{pool?.tournamentName ?? "[大会名]"}</span>
        <span>/</span>
        <span>{pool?.eventName ?? "[種目名]"}</span>
        <span>/</span>
        <span>Pools</span>
      </nav>
      <div className="pool-title-row">
        <h2 className="pool-title">{poolHeading(pool, poolId)}</h2>
        <dl className="pool-stat-grid">
          <div>
            <dt className="label">クラス</dt>
            <dd>{pool?.className ?? "—"}</dd>
          </div>
          <div>
            <dt className="label">形式</dt>
            <dd>{pool ? BRACKET_TYPE_LABEL[pool.bracketType] : "—"}</dd>
          </div>
          <div>
            <dt className="label">空き卓</dt>
            <dd>
              <span className="mono pool-stat-big">
                {tableNumbers.length > 0 ? freeCount : "—"}
              </span>
              {tableNumbers.length > 0 && (
                <span className="mono pool-stat-sub">
                  {" "}
                  / {tableNumbers.length}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="label">進行</dt>
            <dd>
              <span className="mono pool-stat-big">{doneCount}</span>
              <span className="mono pool-stat-sub">
                {" "}
                / {matchCards.length} 完了
              </span>
              <div className="pool-progress-bar">
                <div style={{ width: `${progressPct}%` }} />
              </div>
            </dd>
          </div>
          <div className="pool-stat-staff no-print">
            <dt className="label" id="staff-label">
              進行担当者
            </dt>
            <dd>
              <StaffAssignmentPanel
                pool={pool}
                onRecordStaffAssignment={recordStaffAssignment}
              />
            </dd>
          </div>
        </dl>
      </div>

      {isPreviewMode && (
        <p className="pool-progress-preview-banner no-print">
          {
            "start.gg側でこのプールのブラケットがまだ開始されていません。start.ggの管理画面で「Start Bracket」を押してから、管理画面の「データを再取得」を押してください。それまで結果入力・対戦台設定・進行中への変更はできません。"
          }
        </p>
      )}

      <section aria-label="次の対戦" className="next-match-section no-print">
        {nextCard && topSuggestion ? (
          <div className="next-card">
            <div className="next-card-head">
              <span className="label next-card-kicker">NEXT · 次の対戦</span>
              <span className="mono next-card-id">
                Set {nextCard.identifier}
              </span>
            </div>
            <div className="next-card-body">
              <span className="next-card-entrants">
                {entrantById.get(nextCard.entrant1Id ?? "")?.name ?? "BYE"}
                <span className="next-card-vs">vs</span>
                {entrantById.get(nextCard.entrant2Id ?? "")?.name ?? "BYE"}
              </span>
            </div>
            <div className="next-card-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={openSuggestionModal}
                disabled={isPreviewMode}
              >
                卓を選んで呼び出す
              </button>
            </div>
          </div>
        ) : (
          <p className="next-card-empty">
            今すぐ開始できる対戦はありません。進行中の対戦の結果を待っています。
          </p>
        )}

        {tableNumbers.length > 0 && (
          <div className="table-strip">
            <div className="label table-strip-label">卓の状況</div>
            <div className="table-strip-grid">
              {tableNumbers.map((n) => {
                const occupying = findOccupyingMatchCard(n, matchCards);
                const p1 = occupying
                  ? (entrantById.get(occupying.entrant1Id ?? "")?.name ?? "BYE")
                  : null;
                const p2 = occupying
                  ? (entrantById.get(occupying.entrant2Id ?? "")?.name ?? "BYE")
                  : null;
                return (
                  <button
                    key={n}
                    type="button"
                    className={occupying ? "tcell" : "tcell free"}
                    disabled={!occupying && !topSuggestion}
                    onClick={
                      occupying ? undefined : () => openSuggestionModal()
                    }
                  >
                    <span className="mono">卓 {n}</span>
                    <span className="table-strip-sub">
                      {occupying
                        ? `${occupying.identifier} · ${p1} vs ${p2}`
                        : topSuggestion
                          ? `空き · ${nextCard?.identifier ?? ""} を呼び出す`
                          : "空き"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {blockedMatches.map((blocked) => {
          const card = matchCards.find((c) => c.id === blocked.matchCardId);
          return (
            <p className="blocked-match-note" key={blocked.matchCardId}>
              <span className="chip red">保留</span>
              <span>
                <strong>{card?.identifier}</strong> は {blocked.reason}{" "}
                のため開始できません
              </span>
            </p>
          );
        })}
      </section>

      <div className="tabs-row no-print">
        <div role="tablist" aria-label="表示切替" className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? "tab on" : "tab"}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="count">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "bracket" && (
        <MatchCardList
          pool={pool}
          matchCards={matchCards}
          entrants={entrants}
          onRecordResult={recordResult}
          onAssignTable={assignTable}
          onSetInProgress={setInProgress}
          readOnly={isPreviewMode}
        />
      )}
      {tab === "players" && (
        <PlayersTab
          entrants={entrants}
          matchCards={matchCards}
          nextCardIds={nextCardIds}
          onRecordAttendance={recordAttendance}
          onStartAwayPeriod={startAwayPeriod}
          onEndAwayPeriod={endAwayPeriod}
        />
      )}
      {tab === "guide" && <NextMatchGuideTab entrants={entrants} />}

      {suggestionModalOpen &&
        nextMatchSuggestions[0] &&
        (() => {
          const activeSuggestion = nextMatchSuggestions[0];
          const suggestedCard = matchCards.find(
            (card) => card.id === activeSuggestion.matchCardId,
          );
          if (!suggestedCard) return null;
          return (
            <NextMatchModal
              // 対戦ごとに内部の対戦台選択stateをリセットするため、対戦
              // カードIDをkeyにして別インスタンスとして扱う(そうしないと
              // 「対戦開始」で次の候補に進んだ際、直前の対戦で選んだ対戦台が
              // 選択されたまま残ってしまう)。
              key={suggestedCard.id}
              card={suggestedCard}
              table={activeSuggestion.table}
              entrantById={entrantById}
              tableNumbers={pool?.tableNumbers ?? []}
              matchCards={matchCards}
              onStart={(tableNumber) =>
                callSuggestedMatch(suggestedCard.id, tableNumber)
              }
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
