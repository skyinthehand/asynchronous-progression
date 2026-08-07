import type { ReactNode } from "react";

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

/** startggの一覧画面に準拠した、密度の高いテーブル表示(FR-011)。 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "データがありません",
}: TableProps<T>) {
  if (rows.length === 0) {
    return <p className="table-empty">{emptyMessage}</p>;
  }
  return (
    <table className="app-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column) => (
              <td key={column.key}>{column.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
