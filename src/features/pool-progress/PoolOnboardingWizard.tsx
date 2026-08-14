import { useState } from "react";
import { Modal, NoticeMarkdown } from "../../components/index.js";
import type { Attendance, Entrant } from "../../domain/entities/entrant.js";
import type { Pool } from "../../domain/entities/pool.js";
import { useNotice } from "../notice/useNotice.js";
import { AttendancePanel } from "./AttendancePanel.js";
import { StaffAssignmentPanel } from "./StaffAssignmentPanel.js";

type WizardStep = "staff" | "attendance" | "notice";

const STEPS: WizardStep[] = ["staff", "attendance", "notice"];

interface PoolOnboardingWizardProps {
  pool: Pool;
  entrants: Entrant[];
  onRecordStaffAssignment: (staffName: string) => void;
  onRecordAttendance: (entrantId: string, attendance: Attendance) => void;
  onFinish: () => void;
}

/**
 * プール設定後、初回に必ず表示するオンボーディングウィザード。
 * 進行担当者→出欠確認→注意事項の順にモーダルで案内する。各ステップは
 * 「キャンセル」でウィザード自体を終了できる(強制はしない)。
 */
export function PoolOnboardingWizard({
  pool,
  entrants,
  onRecordStaffAssignment,
  onRecordAttendance,
  onFinish,
}: PoolOnboardingWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const { notice } = useNotice();
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  function handleNext() {
    if (isLast) {
      onFinish();
    } else {
      setStepIndex((index) => index + 1);
    }
  }

  return (
    <Modal
      title={`大会開始前の確認 (${stepIndex + 1}/${STEPS.length})`}
      onClose={onFinish}
      footer={
        <>
          <button type="button" onClick={onFinish}>
            キャンセル
          </button>
          <button type="button" className="btn-primary" onClick={handleNext}>
            {isLast ? "完了" : "次へ"}
          </button>
        </>
      }
    >
      {step === "staff" && (
        <StaffAssignmentPanel
          pool={pool}
          onRecordStaffAssignment={onRecordStaffAssignment}
        />
      )}
      {step === "attendance" && (
        <AttendancePanel
          entrants={entrants}
          onRecordAttendance={onRecordAttendance}
        />
      )}
      {step === "notice" && (
        <section className="onboarding-notice">
          <h2>注意事項</h2>
          <NoticeMarkdown
            text={notice?.body ?? "注意事項を取得できませんでした。"}
          />
        </section>
      )}
    </Modal>
  );
}
