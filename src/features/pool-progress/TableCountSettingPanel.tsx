import { useState } from "react";
import type { Pool } from "../../domain/entities/pool.js";

interface TableCountSettingPanelProps {
  pool: Pool | null;
  onSetTableCount: (tableCount: number | null) => void;
}

/**
 * FR-011/FR-015: プールで使用する対戦台の数を設定する。未設定(null)にも
 * 戻せる(対戦台に紐付かない従来の次戦サジェストへフォールバックするため)。
 */
export function TableCountSettingPanel({
  pool,
  onSetTableCount,
}: TableCountSettingPanelProps) {
  const [value, setValue] = useState(
    pool?.tableCount != null ? String(pool.tableCount) : "",
  );

  function handleSubmit() {
    if (value.trim() === "") {
      onSetTableCount(null);
      return;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return;
    onSetTableCount(parsed);
  }

  return (
    <section className="table-count-setting-panel">
      <p>現在の対戦台数: {pool?.tableCount ?? "未設定"}</p>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="対戦台数(空欄で未設定に戻す)"
        aria-label="対戦台数"
      />
      <button type="button" onClick={handleSubmit}>
        対戦台数を設定
      </button>
    </section>
  );
}
