import { Table } from "../../components/index.js";
import type { Attendance, Entrant } from "../../domain/entities/entrant.js";

interface AttendancePanelProps {
  entrants: Entrant[];
  onRecordAttendance: (entrantId: string, attendance: Attendance) => void;
}

const ATTENDANCE_LABEL: Record<Attendance, string> = {
  UNKNOWN: "未確認",
  PRESENT: "出席",
  ABSENT: "欠席",
};

/** FR-004: 選手ごとの出欠状況を記録する。 */
export function AttendancePanel({
  entrants,
  onRecordAttendance,
}: AttendancePanelProps) {
  return (
    <section className="attendance-panel">
      <Table
        rowKey={(entrant: Entrant) => entrant.id}
        rows={entrants}
        columns={[
          { key: "name", header: "選手名", render: (e) => e.name },
          {
            key: "attendance",
            header: "出欠",
            render: (e) => ATTENDANCE_LABEL[e.attendance],
          },
          {
            key: "action",
            header: "操作",
            render: (entrant) => (
              <>
                <button
                  type="button"
                  onClick={() => onRecordAttendance(entrant.id, "PRESENT")}
                >
                  出席
                </button>
                <button
                  type="button"
                  onClick={() => onRecordAttendance(entrant.id, "ABSENT")}
                >
                  欠席
                </button>
              </>
            ),
          },
        ]}
      />
    </section>
  );
}
