# Data Model: 対戦結果入力・対戦台呼び出しフローの強化

`001-pool-progression-tracker/data-model.md`で定義済みのエンティティ
(Pool、MatchCard等)を拡張する。ここでは追加・変更されるフィールドのみを
記載し、既存フィールドは再掲しない。

## 1. MatchCard(対戦カード)への追加フィールド

| フィールド | 型 | 説明 | 検証ルール |
|---|---|---|---|
| entrant1Score | number \| null | entrant1のスコア(0〜3)。未入力時は
  結果確定時に0として扱われる(FR-004) | 0以上3以下の整数、またはnull |
| entrant2Score | number \| null | entrant2のスコア。同上 | 同上 |
| entrant1DQ | boolean | entrant1が失格(DQ)したか | 既定`false`。
  entrant2DQと同時に`true`にはできない(FR-006) |
| entrant2DQ | boolean | entrant2が失格(DQ)したか | 同上 |
| skippedFromSuggestion | boolean | 次戦サジェスト(自動)の対象から
  一時的に外れているか(FR-018/FR-021) | 既定`false`。手動での対戦開始
  (FR-019)には影響しない |

**score(既存フィールド)との関係**: 結果確定時、
`entrant1Score`/`entrant2Score`/`entrant1DQ`/`entrant2DQ`から表示用の
`score`文字列("3-1"、"DQ-0"等)を導出して設定する(research.md #1)。
`score`は導出値であり、直接編集の対象ではない。

**tableNumber(既存フィールド)の扱い**: 新規フィールドを追加せず、既存の
`tableNumber: string | null`をそのまま対戦台番号として使う
(spec.md Clarifications Q2、research.md #4)。ローカルでの入力・変更は、
`localOnly: true`を付与してstartgg同期による上書きから保護する。

**状態遷移(追加分)**: `entrant1DQ`/`entrant2DQ`は結果確定操作の一部として
同時に設定され、確定後の状態遷移は既存の`status`
(`NOT_STARTED → IN_PROGRESS → COMPLETED`)に従う。`skippedFromSuggestion`は
`status`とは独立して`true`/`false`を行き来する(結果確定・修正とは無関係の
補助フラグ)。

### 1.1 MatchResult(スコア/DQ入力の中間表現、永続化しない)

`domain/rules/matchResult.ts`の`resolveMatchResult`が受け取る入力・返す
出力の形。MatchCardのフィールドとは別に、UIの一時的な入力状態として
扱う(research.md #2)。

| フィールド | 型 | 説明 |
|---|---|---|
| entrant1Score | number \| null | 入力フォームの一時値 |
| entrant2Score | number \| null | 入力フォームの一時値 |
| entrant1DQ | boolean | 入力フォームの一時値 |
| entrant2DQ | boolean | 入力フォームの一時値 |

**出力**: `{ winnerSlot: "entrant1" | "entrant2"; score: string }` または
`{ error: "TIE" | "BOTH_DQ" }`(FR-003/FR-006)。

## 2. Pool(予選プール)への追加フィールド

| フィールド | 型 | 説明 | 検証ルール |
|---|---|---|---|
| tableCount | number \| null | プールで使用する対戦台の数(FR-011)。
  未設定(`null`)の場合、対戦台に紐付かない従来型の次戦サジェストに
  フォールバックする(FR-018) | 1以上の整数、またはnull |

## 3. NextMatchSuggestion(次戦サジェスト、永続化しない)

`domain/rules/nextMatchSuggestion.ts`の`computeNextMatchSuggestions`が
返す、その時点で提示すべき次戦候補の一覧。IndexedDBには保存せず、
表示のたびに`matchCards`(と`pool.tableCount`)から動的に計算する
(既存の`bracketLayout.ts`が表示順を保存せず動的に計算するのと同じ設計
方針)。

| フィールド | 型 | 説明 |
|---|---|---|
| matchCardId | string | 候補となる対戦カードのID |
| table | string \| null | 対応する対戦台番号。`tableCount`未設定時は`null` |

**算出ルール**:
- `pool.tableCount`が`null`または`0`: 空いている(占有されていない)対戦台の
  概念を使わず、既存`findNextMatchCard`と同じ優先順位
  (ラウンド→識別子の昇順、未着手のみ)で1件のみ返す(FR-018)。
- `pool.tableCount`が設定されている: 1〜`tableCount`の各対戦台番号について、
  `domain/rules/tableAssignment.ts`の`isTableOccupied`が`false`を返す対戦台
  ごとに、未着手・`skippedFromSuggestion === false`を優先した対戦カードを
  1件ずつ割り当てる。該当ラウンド→識別子順の候補が`skippedFromSuggestion
  === true`しかない場合は、それを候補として返す(research.md #5、
  完全に除外はしない)。
