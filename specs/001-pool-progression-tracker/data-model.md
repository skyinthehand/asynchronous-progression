# Data Model: 予選プール進行デジタル管理ツール

全エンティティはIndexedDBにローカル永続化される。「startgg対応」列は、
対応するstartgg GraphQL型/フィールド(参照専用または反映先)を示す。
フィールド名はTypeScript/zod実装時の目安であり、実装フェーズで確定する。

## 1. Pool(予選プール)

spec.md「予選プール」に対応。startggの `PhaseGroup` を1件、この端末専任で
管理する(FR-010)。

| フィールド | 型 | 説明 | 検証ルール |
|---|---|---|---|
| id | string | ローカルID(startgg `PhaseGroup.id`をそのまま使用) | 必須 |
| displayIdentifier | string | プール表示名(例: "Pool 1") | 必須 |
| tournamentSlug | string | 所属トーナメントのslug | 必須 |
| eventId | string | 所属イベントID | 必須 |
| phaseId | string | 所属フェーズID | 必須 |
| className | string \| null | 対象クラス(A/B等)。startgg側にクラス概念が
  ない場合はイベント名から抽出、または管理者が初期化時に手動指定 | - |
| bracketType | "ROUND_ROBIN" \| "SINGLE_ELIMINATION" \|
  "DOUBLE_ELIMINATION" \| "OTHER" | startgg `PhaseGroup.bracketType`を
  正規化した値。印刷レイアウト選択(FR-025)に用いる | 必須 |
| staffName | string \| null | 進行担当者記録の最新値のキャッシュ
  (正規のログは3. StaffAssignmentEntry) | - |
| lastSyncedAt | string(ISO8601) \| null | startggとの最終同期成功日時 | - |

**状態遷移**: なし(Poolそのものはstartgg側の構成に追従するのみ)。

## 2. MatchCard(対戦カード)

spec.md「対戦カード」に対応。startggの `Set` に対応する。

| フィールド | 型 | 説明 | 検証ルール |
|---|---|---|---|
| id | string | `Set.id` | 必須 |
| poolId | string | 所属Pool.id | 必須 |
| identifier | string | プール内の対戦識別子(startgg `Set.identifier`。
  例: "F", "AT") | 必須 |
| round | number | `Set.round`(負数は敗者側) | 必須 |
| bracketSide | "WINNERS" \| "LOSERS" \| "N/A" | `round`の符号から導出
  (総当り等ブラケットを持たない形式は"N/A") | 必須 |
| tableNumber | string \| null | 卓番号(startgg `Set.station`由来) | - |
| entrant1Id / entrant2Id | string \| null | 対戦する参加者ID。BYEの場合は
  片方がnull | - |
| winnerId | string \| null | 勝者の参加者ID | 結果確定時は
  entrant1Id/entrant2Idのいずれかと一致 |
| score | string \| null | 表示用スコア文字列(startgg `Set.displayScore`
  相当) | - |
| status | "NOT_STARTED" \| "IN_PROGRESS" \| "COMPLETED" | 進行状態
  (FR-009の次カード判定に使用) | 必須 |
| isLocked | boolean | 後続カードが進行済みのため結果修正不可
  (FR-022)。導出値(4. EditLockRuleを参照) | 必須 |
| editHistory | MatchCardEdit[] | 修正履歴 | - |
| localOnly | boolean | ローカルでのみ入力済みで、まだstartggへ未反映 | 必須 |

**状態遷移**: `NOT_STARTED → IN_PROGRESS → COMPLETED`。`COMPLETED`から
`NOT_STARTED`/`IN_PROGRESS`への巻き戻しは、`isLocked === false`の場合のみ
許可(FR-021/FR-022)。

### 2.1 MatchCardEdit(修正履歴エントリ)

| フィールド | 型 | 説明 |
|---|---|---|
| editedAt | string(ISO8601) | 修正日時 |
| previousWinnerId | string \| null | 修正前の勝者 |
| previousScore | string \| null | 修正前のスコア |
| editedBy | string \| null | 進行担当者名(3. StaffAssignmentEntry由来) |

## 3. Entrant(選手/参加者)

spec.md「選手/参加者」に対応。startggの `Entrant` に対応する。

| フィールド | 型 | 説明 | 検証ルール |
|---|---|---|---|
| id | string | `Entrant.id` | 必須 |
| poolId | string | 所属Pool.id | 必須 |
| name | string | 表示名 | 必須 |
| attendance | "UNKNOWN" \| "PRESENT" \| "ABSENT" | 出欠状態(FR-004) | 必須 |
| attendanceRecordedAt | string(ISO8601) \| null | 出欠記録日時 | - |
| poolFinished | boolean | プール内の全対戦が完了したか(FR-018の導出値) | 必須 |
| nextMatch | NextMatchInfo \| null | 予選終了後の次戦情報(FR-019) | - |

### 3.1 NextMatchInfo

| フィールド | 型 | 説明 |
|---|---|---|
| opponentName | string \| null | 対戦相手名(未確定時null) |
| tableNumber | string \| null | 卓番号(未確定時null) |
| confirmed | boolean | FR-015で事前キャッシュされた後続フェーズ情報から
  確定できたか。`false`の場合はUIで「未確定」と表示する(edge case対応) |

### 3.2 AwayPeriod(離席記録)

spec.md「離席記録」に対応。Entrantに従属する配列フィールドとして保持する。

| フィールド | 型 | 説明 |
|---|---|---|
| startedAt | string(ISO8601) | 離席開始 |
| endedAt | string(ISO8601) \| null | 離席終了(未終了はnull) |
| reason | string \| null | 任意の理由(トイレ等) |

## 4. StaffAssignmentEntry(進行担当者記録)

spec.md「進行担当者記録」に対応。Poolに対する担当者の変更履歴。

| フィールド | 型 | 説明 |
|---|---|---|
| poolId | string | 対象Pool.id |
| staffName | string | 担当者名 |
| recordedAt | string(ISO8601) | 記録日時 |

## 5. Notice(注意書き)

spec.md「注意書き」に対応。**read-onlyのローカルキャッシュ**であり、本ツール
からは書き込まない(FR-032, FR-033)。

| フィールド | 型 | 説明 | 検証ルール |
|---|---|---|---|
| tournamentSlug | string | 対象トーナメント | 必須 |
| body | string | startgg `Tournament.rules`の内容 | 必須(空文字許容だが
  下記警告の対象) |
| hasEmergencyContact | boolean | `body`から緊急連絡先らしき記載
  (電話番号・メールアドレス・特定キーワード等)を検出した結果。検出方式は
  実装フェーズで確定するヒューリスティック | 必須 |
| lastSyncedAt | string(ISO8601) \| null | 直近の同期日時 | - |

**状態遷移**: なし。

## 6. AdminSession(管理者セッション)

spec.md「管理者セッション」に対応。

| フィールド | 型 | 説明 | 検証ルール |
|---|---|---|---|
| loggedInAt | string(ISO8601) | ログイン日時 | 必須 |
| expiresAt | string(ISO8601) | `loggedInAt` + 24時間(FR-030) | 必須 |
| status | "ACTIVE" \| "LOGGED_OUT_MANUAL" \| "LOGGED_OUT_AUTO" | 現在の状態 | 必須 |
| autoLogoutNotifiedAt | string(ISO8601) \| null | 自動ログアウトの通知
  済み日時(FR-031。未通知はnull) | - |

**状態遷移**: `ACTIVE → LOGGED_OUT_MANUAL`(手動ログアウト)、
`ACTIVE → LOGGED_OUT_AUTO`(24時間経過、`expiresAt`超過を検知した時点で
遷移。アプリを開いていない間に超過した場合は、次回起動時の初回チェックで
遷移させ`autoLogoutNotifiedAt`をnullのままにして通知トリガーとする)。

## 7. StartggIntegrationConfig(startgg連携設定)

spec.md「startgg連携設定」に対応。FR-026〜FR-028の初期化内容を保持する。

| フィールド | 型 | 説明 | 検証ルール |
|---|---|---|---|
| tournamentSlug | string \| null | 対象トーナメント | 対象プール指定前はnull |
| eventId | string \| null | 対象イベント | 同上 |
| phaseId | string \| null | 対象フェーズ | 同上 |
| poolId | string \| null | 対象プール(= Pool.id) | 同上 |
| syncToken | string \| null | 定期同期に使うPersonal Access Token
  (FR-027の(3)) | 保存時に非空文字列であることを検証。値そのものは
  マスクして画面表示する |
| tokenUpdatedAt | string(ISO8601) \| null | トークン最終更新日時 | - |

**注記**: 「ログイン」ステップ(FR-027の(1))で入力するPATは、対象一覧取得の
その場限りの用途であり、永続化対象は`syncToken`(FR-027の(3))のみ。両者が
同一の値であることを妨げないが、モデル上は独立させ、`syncToken`未設定でも
「ログイン」だけ済んだ状態を表現できるようにする。

## 8. SyncStatus(同期状況)

spec.md「同期状況」に対応。

| フィールド | 型 | 説明 | 検証ルール |
|---|---|---|---|
| poolId | string | 対象Pool.id | 必須 |
| lastSuccessAt | string(ISO8601) \| null | 直近の同期成功日時 | - |
| lastFailureAt | string(ISO8601) \| null | 直近の同期失敗日時 | - |
| lastFailureReason | string \| null | 直近の失敗理由(表示用) | - |
| pendingChangeCount | number | 未反映のローカル変更件数
  (MatchCardの`localOnly === true`件数から導出) | 0以上の整数 |
| isStale | boolean | 同期不良スナックバー表示条件(FR-016)を満たすかの
  導出値。`lastSuccessAt`から設定閾値以上経過、かつ`pendingChangeCount > 0`
  またはオフライン状態が閾値以上継続、で真になる | 必須 |

## 9. エンティティ関連図(概念)

```text
Tournament(startgg)
  └─ Event(startgg)
       └─ Phase(startgg)
            └─ Pool(PhaseGroup) ── 1端末が専任 (FR-010)
                 ├─ MatchCard[] (Set)
                 │     └─ MatchCardEdit[]
                 ├─ Entrant[]
                 │     ├─ AwayPeriod[]
                 │     └─ NextMatchInfo?
                 └─ StaffAssignmentEntry[]

StartggIntegrationConfig ── Pool を1件指すポインタ + syncToken
AdminSession ── 端末ローカルの管理者ログイン状態(Poolに従属しない)
Notice ── tournamentSlug 単位(Poolをまたいで共通)
SyncStatus ── Pool 1件につき1レコード
```

## 10. 境界データ検証(Constitution原則II対応)

- startgg GraphQL応答(`PhaseGroup`, `Set`, `Entrant`, `Tournament.rules`等)
  は、`contracts/startgg-graphql-operations.md`に定義するzodスキーマで
  検証してからドメインモデルへマッピングする。
- IndexedDBからの読み出し時も同一(または対応する)zodスキーマで検証し、
  スキーマバージョン不整合(アプリ更新による構造変化)を検知する。
- 管理者が入力するPersonal Access Token等の設定値も、保存前にzodで
  形式検証(非空文字列など)を行う。
