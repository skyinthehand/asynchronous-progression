import { useState } from "react";

interface TableCountSettingPanelProps {
  tableNumbers: string[];
  onSetTableNumbers: (tableNumbers: string[]) => void;
}

/**
 * FR-011/FR-015: プールで使用する対戦台を1台ずつ追加・削除する。会場の
 * 実際の卓番号(101, 102, 103, 105 のように連番とは限らない)をそのまま
 * 手入力できるようにし、単純な「台数」の数値入力にはしない。
 */
export function TableCountSettingPanel({
  tableNumbers,
  onSetTableNumbers,
}: TableCountSettingPanelProps) {
  const [newTableNumber, setNewTableNumber] = useState("");

  function addTable() {
    const trimmed = newTableNumber.trim();
    if (!trimmed || tableNumbers.includes(trimmed)) return;
    onSetTableNumbers([...tableNumbers, trimmed]);
    setNewTableNumber("");
  }

  function removeTable(tableNumber: string) {
    onSetTableNumbers(tableNumbers.filter((n) => n !== tableNumber));
  }

  return (
    <section className="table-count-setting-panel">
      <p>設定済みの対戦台: {tableNumbers.length}台</p>
      {tableNumbers.length > 0 && (
        <ul className="table-number-list">
          {tableNumbers.map((tableNumber) => (
            <li key={tableNumber}>
              {tableNumber}
              <button type="button" onClick={() => removeTable(tableNumber)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      <label>
        対戦台番号を追加:
        <input
          value={newTableNumber}
          onChange={(event) => setNewTableNumber(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTable();
            }
          }}
          placeholder="例: 101"
          aria-label="対戦台番号"
        />
      </label>
      <button
        type="button"
        onClick={addTable}
        disabled={
          !newTableNumber.trim() || tableNumbers.includes(newTableNumber.trim())
        }
      >
        追加
      </button>
    </section>
  );
}
