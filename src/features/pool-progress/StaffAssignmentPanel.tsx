import { useState } from "react";
import type { Pool } from "../../domain/entities/pool.js";

interface StaffAssignmentPanelProps {
  pool: Pool | null;
  onRecordStaffAssignment: (staffName: string) => void;
}

/** FR-006: プールを担当する進行担当者名を記録する。 */
export function StaffAssignmentPanel({
  pool,
  onRecordStaffAssignment,
}: StaffAssignmentPanelProps) {
  const [name, setName] = useState("");

  return (
    <section className="staff-assignment-panel">
      <p>現在の担当者: {pool?.staffName ?? "未設定"}</p>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="担当者名"
      />
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => {
          onRecordStaffAssignment(name.trim());
          setName("");
        }}
      >
        担当者を記録
      </button>
    </section>
  );
}
