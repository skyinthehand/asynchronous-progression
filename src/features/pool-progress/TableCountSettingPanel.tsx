import type { StationOption } from "../../infra/startgg/operations.js";

interface TableCountSettingPanelProps {
  tableNumbers: string[];
  availableStations: StationOption[];
  onSetTableNumbers: (tableNumbers: string[]) => void;
  onRefetchStations: () => void;
}

/**
 * ユーザーフィードバック(2026-08-13): 対戦台はstartgg側の「station」設定
 * (会場のstream/setup単位で管理者があらかじめ登録しておくもの)がそのまま
 * 実体だと分かったため、卓番号を手入力させるのではなく、startggから取得
 * したstation一覧の中からこのプールで使うものをチェックボックスで選択する
 * 形にする(FR-011改訂)。選択結果はこれまで通りPool.tableNumbers
 * (単純な文字列配列)にそのまま保存されるため、対戦台の割り当て・
 * 占有判定・startggへのstation割り当て送信(assignStationToSet)など
 * 下流のロジックには変更が要らない。
 */
export function TableCountSettingPanel({
  tableNumbers,
  availableStations,
  onSetTableNumbers,
  onRefetchStations,
}: TableCountSettingPanelProps) {
  const sortedStations = [...availableStations].sort(
    (a, b) => Number(a.number) - Number(b.number),
  );
  const availableNumbers = new Set(
    sortedStations.map((station) => station.number),
  );
  // 過去に選択されていたが、startgg側でstationが削除された等の理由で
  // 現在の一覧に存在しなくなった番号。データを黙って失わないよう、
  // 削除できる形で別途表示する。
  const orphanedNumbers = tableNumbers.filter(
    (number) => !availableNumbers.has(number),
  );

  function toggle(number: string, checked: boolean) {
    if (checked) {
      if (tableNumbers.includes(number)) return;
      onSetTableNumbers([...tableNumbers, number]);
    } else {
      onSetTableNumbers(tableNumbers.filter((n) => n !== number));
    }
  }

  function removeOrphan(number: string) {
    onSetTableNumbers(tableNumbers.filter((n) => n !== number));
  }

  return (
    <section className="table-count-setting-panel">
      <p>設定済みの対戦台: {tableNumbers.length}台</p>
      <button type="button" onClick={onRefetchStations}>
        対戦台一覧を再取得
      </button>
      {sortedStations.length === 0 ? (
        <p role="alert">
          startgg側に対戦台(station)が登録されていません。startggの大会管理画面でstationを追加してください。
        </p>
      ) : (
        <ul className="table-number-list">
          {sortedStations.map((station) => (
            <li key={station.stationId}>
              <label>
                <input
                  type="checkbox"
                  checked={tableNumbers.includes(station.number)}
                  onChange={(event) =>
                    toggle(station.number, event.target.checked)
                  }
                />
                {station.number}
              </label>
            </li>
          ))}
        </ul>
      )}
      {orphanedNumbers.length > 0 && (
        <>
          <p>
            startggの対戦台一覧に見つからない設定済みの番号です(station側で
            削除された可能性があります):
          </p>
          <ul className="table-number-list">
            {orphanedNumbers.map((number) => (
              <li key={number}>
                {number}
                <button type="button" onClick={() => removeOrphan(number)}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
