# Tasks: 対戦結果入力・対戦台呼び出しフローの強化

**Input**: Design documents from `/specs/002-match-scoring-and-flow/`
**Prerequisites**: [plan.md](./plan.md)(必須)、[spec.md](./spec.md)(必須、ユーザーストーリー)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/match-result-and-table-schema.md](./contracts/match-result-and-table-schema.md)

**Tests**: 001-pool-progression-trackerで確立された規約(`domain/rules`配下は`makeCard(overrides)`ヘルパーを使う純粋関数の単体テスト、`features/*`配下は`resetDb`/`acknowledgeNotice`ヘルパーを使うTesting Library結合テスト)を踏襲し、plan.mdのProject Structureで明示されたテストファイルを含める。

**Organization**: タスクはspec.mdのユーザーストーリー(US1〜US4、優先度P1×3・P3×1)単位で構成する。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行実行可能(別ファイル・タスク間依存なし)
- **[Story]**: 対応するユーザーストーリー(US1〜US4)
- 各タスクに具体的なファイルパスを含める

---

## Phase 1: Setup

本featureは新しい外部依存・新規プロジェクト構造を追加しない(plan.md Technical Context)。001-pool-progression-trackerのdevcontainer/npm scriptsをそのまま利用できるため、Setup固有のタスクはなし。

---

## Phase 2: Foundational

本featureのComplexity Trackingは「該当なし」(plan.md)であり、全ユーザーストーリーを事前にブロックする共通基盤(新しいエンティティ・新しい抽象化層・新しい依存)は発生しない。各ユーザーストーリーが必要とするスキーマ拡張は、そのストーリー自身のPhase内で行う(下記)。

**⚠️ 全ユーザーストーリーがPhase 3以降、Foundationalの完了を待たずに開始できる。**

---

## Phase 3: User Story 1 - スコア入力による結果確定(最大3・DQ対応) (Priority: P1) 🎯 MVP

**Goal**: FR-001〜FR-008。両出場者のスコア(0〜3)・DQ入力から勝者を自動判定し、既存の「勝者ボタン」方式を置き換える。

**Independent Test**: quickstart.md シナリオ1(片方のみ入力での自動0補完、DQ確定、同点拒否、両者DQ拒否)

### Tests for User Story 1 ⚠️

> **NOTE: 先にテストを書き、実装前に失敗することを確認する**

- [X] T001 [P] [US1] tests/unit/domain/rules/matchResult.test.ts に `resolveMatchResult` のテスト(片側のみ入力→自動0補完、DQ確定、同点拒否、両者DQ拒否)を書く
- [X] T002 [P] [US1] tests/integration/features/match-result-entry.test.tsx にスコア/DQ入力による結果確定の結合テスト(quickstart.md シナリオ1)を書く

### Implementation for User Story 1

- [X] T003 [US1] src/domain/schemas/matchCard.ts に `entrant1Score`/`entrant2Score`(`z.number().int().min(0).max(3).nullable().default(null)`)、`entrant1DQ`/`entrant2DQ`(`z.boolean().default(false)`)を追加する(data-model.md §1, contracts §matchCardsストア)
- [X] T004 [US1] src/domain/rules/matchResult.ts を新設し `resolveMatchResult(input)` を実装する(未入力側を0として扱う自動補完・同点/両者DQのエラー返却を含む)(research.md #2)(依存: T003。T001が先に失敗することを確認してから実装する)
- [X] T005 [P] [US1] src/features/pool-progress/ScoreEntryForm.tsx を新設する(両出場者のスコア(0〜3)・DQ入力欄、`resolveMatchResult`を呼び出しTIE/BOTH_DQのエラーを表示する共有コンポーネント)(research.md #9)(依存: T004)
- [X] T006 [US1] src/features/pool-progress/usePoolProgress.ts の `recordResult` を、`winnerId`直接指定からスコア/DQ入力を受け取り`resolveMatchResult`経由で勝者判定する方式に置き換え、`entrant1Score`/`entrant2Score`/`entrant1DQ`/`entrant2DQ`と導出した`score`文字列を保存する(依存: T004)
- [X] T007 [US1] src/features/pool-progress/MatchCardEntry.tsx の勝者ボタンUIを`ScoreEntryForm`に置き換える(依存: T005, T006)
- [X] T008 [US1] src/features/pool-progress/MatchCardRow.tsx の勝者ボタンUIを`ScoreEntryForm`に置き換える(依存: T005, T006)
- [X] T009 [US1] src/features/pool-progress/MatchCardEdit.tsx の勝者ボタンUIを`ScoreEntryForm`に置き換え、既存の`entrant1Score`/`entrant2Score`/DQフラグを初期値として渡す(既存の結果修正機能をスコア/DQ入力でも提供する、FR-008)(依存: T005, T006)
- [X] T010 [P] [US1] src/features/pool-progress/MatchCardList.tsx・BracketBoard.tsx・MatchTable.tsx の`onRecordResult`の型を新しい`recordResult`シグネチャに追従させる(依存: T006)

**Checkpoint**: この時点でUser Story 1は独立して動作・テスト可能(T001, T002がパスする)

---

## Phase 4: User Story 2 - 対戦台の設定と対戦カードへの割り当て (Priority: P1)

**Goal**: FR-011〜FR-016。プールの対戦台数を設定し、対戦カードに対戦台番号を割り当てられるようにする。User Story 3(対戦台単位の次戦サジェスト)の前提となる(spec.md「Why this priority」)。

**Independent Test**: quickstart.md シナリオ2(対戦台数設定、番号割り当て、重複拒否、startgg同期後もローカル入力が保護されること)

### Tests for User Story 2 ⚠️

- [X] T011 [P] [US2] tests/unit/domain/rules/tableAssignment.test.ts に `isTableOccupied` のテスト(未完了カードによる占有判定、`COMPLETED`は占有扱いしない、対象自身の除外)を書く
- [X] T012 [P] [US2] tests/integration/features/table-assignment.test.tsx に対戦台数設定・割り当て・重複拒否・startgg同期後のローカル優先(quickstart.md シナリオ2)の結合テストを書く

### Implementation for User Story 2

- [X] T013 [US2] src/domain/schemas/pool.ts に `tableCount`(`z.number().int().min(1).nullable().default(null)`)を追加する(data-model.md §2)
- [X] T014 [US2] src/domain/rules/tableAssignment.ts を新設し `isTableOccupied(tableNumber, matchCards, excludeCardId?)` を実装する(`status !== "COMPLETED"`のカードを占有中とみなす)(research.md #3)(依存: T011が先に失敗することを確認してから実装する)
- [X] T015 [P] [US2] src/features/pool-progress/TableCountSettingPanel.tsx を新設する(プールの`tableCount`を1以上の整数(または未設定)で設定するUI)(依存: T013)
- [X] T016 [US2] src/features/pool-progress/usePoolProgress.ts に `setTableCount(tableCount)` と `assignTable(matchCardId, tableNumber)` を追加する。**実装時の変更**: `assignTable`で`localOnly: true`は付与しない。代わりに`syncRunner.ts`の`mergeMatchCard`を、`localOnly`の状態に関わらず常に`tableNumber`(および`entrant1Score`/`entrant2Score`/DQ/`skippedFromSuggestion`)をローカル優先でマージするよう変更した。理由: `localOnly`はresult確定(`winnerId`あり)がpushされた時にのみクリアされる(`syncRunner.ts`の`if (!card.winnerId) continue;`)ため、対戦台のみの変更に`localOnly: true`を使うと、結果確定までその対戦カードの`entrant1Id`/`entrant2Id`等の他のフィールドまでstartgg同期から永久に取り残される副作用があった(/speckit-analyze で検出したF2)。(依存: T013, T014)
- [X] T017 [US2] src/features/pool-progress/PoolProgressScreen.tsx に対戦台数設定ボタン/パネルを追加し`TableCountSettingPanel`を配線する(依存: T015, T016)
- [X] T018 [US2] src/features/pool-progress/MatchCardEntry.tsx・MatchCardRow.tsx に対戦台番号の入力(`pool.tableCount`を上限に1〜tableCountから選択、占有中は拒否)を追加する(依存: T016)。**スコープ調整**: `MatchCardEdit.tsx`(完了済みカードの結果修正フォーム)には追加しなかった — `isTableOccupied`は`COMPLETED`カードを占有中とみなさないため、完了後の対戦台再割り当ての実用上の必要性が薄いと判断した。

**Checkpoint**: この時点でUser Story 1・2が共に独立して動作する

---

## Phase 5: User Story 3 - 対戦台ごとの次戦サジェストと呼び出しの変更・スキップ (Priority: P1)

**Goal**: FR-017〜FR-027。対戦結果確定直後に、対戦台へ次に呼ぶべき対戦カードをモーダルでサジェストし、変更・スキップを可能にする。トーナメント表示上でも次戦候補を識別できるようにする。

**依存に関する注記**: spec.mdの明記どおり、対戦台単位のサジェストが価値を持つにはUser Story 2(対戦台数・割り当て)が前提となる(`pool.tableCount`未設定時のフォールバック部分のみはUS2なしでも成立するが、完全な機能はUS2に依存する)。また、結果確定直後にモーダルを出すトリガーはUser Story 1で変更した`recordResult`(T006)に依存する。そのためUS3は、通常のP1間の独立性の原則から外れ、US1・US2の完了後に着手することを推奨する。

**Independent Test**: quickstart.md シナリオ3(対戦台1へのサジェスト提示、スキップと再提示、対戦台未設定時のフォールバック、組合せ図上での識別)

### Tests for User Story 3 ⚠️

- [X] T019 [P] [US3] tests/unit/domain/rules/nextMatchSuggestion.test.ts に `computeNextMatchSuggestions` のテスト(tableCount未設定時は従来のラウンド→識別子順で1件、tableCount設定時は空いている対戦台ごとに1件、`skippedFromSuggestion`は他に候補がない場合のみ提示)を書く
- [X] T020 [P] [US3] tests/integration/features/next-match-modal.test.tsx に結果確定直後のモーダル自動表示・対戦開始・スキップ・未選択のまま閉じた場合の再提示(quickstart.md シナリオ3)、および同期不良スナックバーとの共存(シナリオ5)の結合テストを書く

### Implementation for User Story 3

- [X] T021 [US3] src/domain/schemas/matchCard.ts に `skippedFromSuggestion`(`z.boolean().default(false)`)を追加する(data-model.md §1)
- [X] T022 [US3] src/domain/rules/nextMatchSuggestion.ts を新設し `computeNextMatchSuggestions(matchCards, tableCount)` を実装する。既存の src/features/pool-progress/nextCardIndicator.ts(`findNextMatchCard`)を削除し、この関数に統合する(research.md #6)(依存: T014, T021。T019が先に失敗することを確認してから実装する)
- [X] T023 [US3] src/features/pool-progress/MatchCardList.tsx・BracketBoard.tsx・MatchTable.tsx・MatchCardEntry.tsx・MatchCardRow.tsx の次カードハイライトを、`computeNextMatchSuggestions`が返す対戦カードIDの集合に差し替える(`nextCardId: string | null` → 複数対戦台分を同時に強調できる集合へ変更)(依存: T022)
- [X] T024 [US3] src/features/pool-progress/NextMatchModal.tsx を新設する(`components/Modal.tsx`を利用。「対戦開始」(対戦台番号は任意入力)・「スキップ」の2アクションのみを持ち、「別の対戦を選ぶ」ボタンは設けない、spec.md Clarifications Q3)(依存: T021)。**実装時の修正**: モーダルの対戦台入力欄は、サジェスト対象の対戦台であっても既定値を空欄にした(Acceptance Scenario 7「入力せずに対戦開始すると対戦台番号を割り当てない」との整合を、統合テストで実際に検証して発見・修正)。
- [X] T025 [US3] src/features/pool-progress/usePoolProgress.ts の`recordResult`成功直後に、確定した対戦カードの対戦台番号を使って`computeNextMatchSuggestions`を呼び、対応する1件を`nextMatchSuggestion` stateにセットする。`callSuggestedMatch`(対戦開始、IN_PROGRESSへ変更)・`skipSuggestion`(`skippedFromSuggestion`を`true`に)・`dismissSuggestion`(状態変更なしでstateのみクリア、FR-025)を追加する(依存: T022, T006)
- [X] T026 [US3] src/features/pool-progress/PoolProgressScreen.tsx に`NextMatchModal`を配線する。`nextMatchSuggestion` stateが非nullの間表示し、既存の同期不良スナックバー(`SyncStatusSnackbar`)の表示・操作を妨げないことを確認する(FR-027)(依存: T024, T025)。`SyncStatusSnackbar`は`App.tsx`直下でモーダルと独立にマウントされているため、追加のコード変更なしで共存を確認できた。

**Checkpoint**: この時点でUser Story 1〜3が全て独立して動作する

---

## Phase 6: User Story 4 - 対戦の「進行中」ステータスの任意設定 (Priority: P3)

**Goal**: FR-009〜FR-010。呼び出した対戦を任意で「進行中」に設定できるようにする(設定しなくても結果は直接確定できる)。

**Independent Test**: quickstart.md シナリオ4

### Tests for User Story 4 ⚠️

- [X] T027 [P] [US4] tests/integration/features/match-result-entry.test.tsx に「進行中」への設定・区別表示・「進行中」を経由しない直接確定(quickstart.md シナリオ4)のテストケースを追加する

### Implementation for User Story 4

- [X] T028 [US4] src/features/pool-progress/usePoolProgress.ts に `setInProgress(matchCardId)` を追加する(`status: "NOT_STARTED" → "IN_PROGRESS"`。対戦台割り当てとは独立した操作とする)
- [X] T029 [US4] src/features/pool-progress/MatchCardEntry.tsx・MatchCardRow.tsx に「進行中にする」ボタンと、IN_PROGRESS状態を未着手と区別する表示を追加する(依存: T028)

**Checkpoint**: 全ユーザーストーリーが独立して機能する

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T030 [P] src/features/print/BracketPrintLayout.tsx・TablePrintLayout.tsx が、DQ由来の導出`score`文字列("DQ-0"等)を既存の表示ロジックのままで正しく表示できることを確認する(コード変更は不要な想定。Edge Cases「失格した側にはスコアではなく失格したことが分かる表示」を実機で確認する)。コード変更は不要だったことを確認し、tests/integration/features/print.test.tsxに`score: "0-DQ"`を持つCOMPLETEDカードの回帰テストを追加して自動検証した。
- [X] T031 `npm run lint`・`npm run format`・`tsc --noEmit`・`vite build` を実行し、型エラー・lintエラー・フォーマット崩れ・ビルドエラーがないことを確認した(Constitution I/III)。全127件のテストも安定して(2回連続)パスすることを確認した。
- [X] T032 specs/002-match-scoring-and-flow/quickstart.md の全シナリオ(1〜5)を確認した。**制約**: この実装環境にはブラウザ自動化ツール(Playwright等)がなく、`npm run dev`での実ブラウザ手動確認は行えなかった。代わりに、各シナリオの手順・期待結果を対応する結合テスト(Testing Library + jsdom、実際のDOM操作・イベント発火を伴う)で1対1に近い形でカバーし、全て通過することを確認した: シナリオ1→match-result-entry.test.tsx(Acceptance Scenario 1-5)、シナリオ2→table-assignment.test.tsx、シナリオ3→next-match-modal.test.tsx(手順9-10のブラケット強調表示のテストをこのタスク中に追加)、シナリオ4→match-result-entry.test.tsxの「進行中」ステータスのdescribeブロック、シナリオ5→next-match-modal.test.tsxとPoolProgressScreen.tsxの配線確認(SyncStatusSnackbarがApp.tsx直下でモーダルと独立にマウントされていることを確認)。実ブラウザでの見た目・レイアウト崩れ(特にブラケット表示のROW_HEIGHT固定レイアウトへの新UI追加分の収まり)は未確認のため、リリース前に一度`npm run dev`での目視確認を推奨する。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: タスクなし
- **Foundational (Phase 2)**: タスクなし。全User StoryはPhase 3以降、即座に着手可能
- **User Story 1 (Phase 3)**: 他ストーリーへの依存なし。即座に着手可能
- **User Story 2 (Phase 4)**: 他ストーリーへの依存なし。US1と並行して着手可能
- **User Story 3 (Phase 5)**: US1(T006の`recordResult`変更)・US2(T013の`tableCount`・T014の`isTableOccupied`)に依存。両者の完了後に着手することを推奨(スキップ機構等US3固有の追加は先行して設計・レビューしてもよいが、統合(T022以降)はUS1・US2完了後)
- **User Story 4 (Phase 6)**: 他ストーリーへの機能的な依存はないが、`usePoolProgress.ts`・`MatchCardEntry.tsx`・`MatchCardRow.tsx`をUS1と共有するため、コンフリクト回避のためUS1完了後の着手を推奨
- **Polish (Phase 7)**: 全User Story完了後

### Parallel Opportunities

- T001/T002(US1のテスト)とT011/T012(US2のテスト)は並行して書ける
- Phase 3(US1)とPhase 4(US2)は別々の担当者で並行実装できる(ファイルの重複はT016/T018がT006より後になる程度で、マージ順を揃えれば問題ない)
- T003(matchCardスキーマ)とT013(poolスキーマ)は別ファイルのため並行可能
- T005(ScoreEntryForm)とT015(TableCountSettingPanel)は別ファイルのため並行可能

---

## Parallel Example: User Story 1

```bash
# US1のテストを並行して書く:
Task: "tests/unit/domain/rules/matchResult.test.ts に resolveMatchResult のテストを書く"
Task: "tests/integration/features/match-result-entry.test.tsx に結合テストを書く"
```

## Parallel Example: User Story 1 と User Story 2

```bash
# 別担当者で並行実装:
Developer A: T001-T010 (User Story 1: スコア/DQ入力)
Developer B: T011-T018 (User Story 2: 対戦台設定・割り当て)
# 両者完了後にUser Story 3(対戦台単位の次戦サジェスト)へ進む
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 3(User Story 1: スコア/DQ入力による結果確定)を完了する
2. **STOP and VALIDATE**: quickstart.md シナリオ1を確認する
3. spec.mdの「Why this priority」どおり、これが現場の中核操作を最初に是正するMVP

### Incremental Delivery

1. User Story 1 → 独立してテスト・デプロイ可能(MVP)
2. User Story 2 → 対戦台の設定・割り当てが可能になる(US1と並行実装可)
3. User Story 3 → US1・US2の上に、対戦台単位の次戦サジェスト・モーダル・スキップを追加
4. User Story 4 → 「進行中」の任意設定を追加(優先度最低、単独では現場課題を解決しないためP3)

---

## Notes

- `[P]`タスク = 別ファイル、かつタスク間に直接の依存がないもの
- `[Story]`ラベルはタスクをユーザーストーリーに対応づけるため
- 各ユーザーストーリーは独立して完了・テスト可能であることを確認する(US3のみ、spec.md自身が明記するUS2への依存を持つ例外)
- 実装前にテストが失敗することを確認する
- 論理的なまとまりごとにコミットする
- 各チェックポイントで一旦立ち止まり、ストーリー単体の動作を確認する
