---

description: "Task list template for feature implementation"
---

# Tasks: 予選プール進行デジタル管理ツール

**Input**: Design documents from `/specs/001-pool-progression-tracker/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md(いずれも生成済み)

**Tests**: 一部のタスクにテストを含める(Constitution原則I・IIの機械的検証、および
FR-013/FR-022等の重要なビジネスルールの回帰防止のため)。全数E2E自動化は
`research.md` 9.の判断によりスコープ外とし、`quickstart.md`の手動検証で代替する。

**Organization**: タスクはspec.mdのUser Story単位(優先度順)でグループ化。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行実行可能(異なるファイル、未完了タスクへの依存なし)
- **[Story]**: 対応するUser Story(US1〜US7)
- 各タスクに具体的なファイルパスを含める

## Path Conventions

単一プロジェクト構成(`plan.md` Project Structure準拠):

- `src/app/`, `src/features/`, `src/domain/`, `src/infra/`, `src/components/`
- `tests/unit/`, `tests/integration/`, `tests/contract/`

---

## Phase 1: Setup(プロジェクト初期化)

**Purpose**: React SPAとしてビルド・起動できる最小限の土台を整える

- [ ] T001 `package.json` に本番依存(`react`, `react-dom`, `idb`, `zod`,
  `graphql-request`)と開発依存(`vite`, `@vitejs/plugin-react`, `vitest`,
  `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`,
  `@types/react`, `@types/react-dom`)を追加して `npm install` し、あわせて
  リポジトリ直下に `index.html`(Viteエントリポイント、`src/main.tsx` を
  読み込む)を作成する
- [ ] T002 [P] `tsconfig.json` に `"jsx": "react-jsx"` と
  `"lib": ["ES2022", "DOM", "DOM.Iterable"]` を追加する
- [ ] T003 [P] リポジトリ直下に `vite.config.ts` を作成し、Reactプラグイン・
  開発サーバーポート(5173)・Vitestのjsdom環境設定を行う
- [ ] T004 [P] `package.json` の `scripts` に `"dev": "vite"`,
  `"preview": "vite preview"`, `"test": "vitest run"` を追加する
- [ ] T005 [P] `.devcontainer/devcontainer.json` にVite開発サーバー用ポート
  (5173)の `forwardPorts` を追加する

**Checkpoint**: `npm run dev` でVite開発サーバーが起動できる状態。

---

## Phase 2: Foundational(全User Story共通の基盤)

**Purpose**: 全User Storyが依存するドメインモデル・永続化層・startgg連携層・
品質ゲートを整備する

**⚠️ CRITICAL**: このフェーズが完了するまで、いかなるUser Storyの実装も
開始できない

- [ ] T006 [P] pre-commitフック(`lint-staged` + `simple-git-hooks` 等)を
  導入し、コミット前に `npm run lint` と `npm run build` を実行するよう
  設定する(Constitution原則V)
- [ ] T007 [P] `.github/workflows/ci.yml` を作成し、push/PR時に
  `npm run lint`, `npm run build`, `npm test` を実行するGitHub Actions
  ワークフローを設定する(Constitution原則V)
- [ ] T008 [P] `src/domain/entities/pool.ts`, `matchCard.ts` に
  Pool・MatchCard・MatchCardEditの型を、`src/domain/schemas/pool.ts`,
  `matchCard.ts` に対応するzodスキーマを実装する(data-model.md 1, 2, 2.1)
- [ ] T009 [P] `src/domain/entities/entrant.ts` にEntrant・NextMatchInfo・
  AwayPeriodの型を、`src/domain/schemas/entrant.ts` に対応するzodスキーマを
  実装する(data-model.md 3, 3.1, 3.2)
- [ ] T010 [P] `src/domain/entities/staffAssignment.ts`,
  `notice.ts`, `adminSession.ts`, `startggConfig.ts`, `syncStatus.ts` に
  StaffAssignmentEntry・Notice・AdminSession・StartggIntegrationConfig・
  SyncStatusの型を、`src/domain/schemas/` に対応するzodスキーマを実装する
  (data-model.md 4〜8)
- [ ] T011 `src/infra/storage/db.ts` に、`idb` を用いたIndexedDB初期化と
  `contracts/local-storage-schema.md` のオブジェクトストア定義
  (`pools`, `matchCards`, `entrants`, `staffAssignments`, `notice`,
  `adminSession`, `startggConfig`, `syncStatus`)、およびバージョン
  マイグレーション機構を実装する(依存: T008, T009, T010)
- [ ] T012 [P] `src/infra/storage/poolRepository.ts`,
  `matchCardRepository.ts`, `entrantRepository.ts` に、保存前・読み出し後の
  zod検証を行うCRUDリポジトリ関数を実装する(依存: T011)
- [ ] T013 [P] `src/infra/storage/adminRepository.ts` に、
  StaffAssignmentEntry・Notice・AdminSession・StartggIntegrationConfig・
  SyncStatus用のCRUDリポジトリ関数を実装する(依存: T011)
- [ ] T014 [P] `src/infra/startgg/client.ts` に、`graphql-request` を用いた
  startgg GraphQLクライアント(トークンを`Authorization: Bearer`ヘッダーに
  付与)を実装する
- [ ] T015 `src/infra/startgg/operations.ts` に、
  `contracts/startgg-graphql-operations.md` のQ1〜Q4・M1をzod検証付きで
  実装する(依存: T014, T008〜T010)
- [ ] T016 [P] `src/domain/rules/editLock.ts` に、後続MatchCardの状態から
  `isLocked` を導出するロジックを実装する(data-model.md MatchCard状態遷移、
  FR-022)
- [ ] T017 [P] `src/domain/rules/noticeValidation.ts` に、Notice本文から
  緊急連絡先らしき記載を検出するヒューリスティックを実装する(FR-003、
  data-model.md `hasEmergencyContact`)
- [ ] T018 `src/main.tsx` に `ReactDOM.createRoot` で `<App />` をマウントする
  エントリポイントを実装し、`src/app/App.tsx`, `src/app/router.tsx` に
  一般モード/管理画面モードを切り替えるアプリシェルとルーティングの土台を
  実装する(Assumptions: 同一アプリ内モード切り替え)(依存: T001)
- [ ] T019 [P] `src/components/` に、startggの画面構成に準拠した共通UI
  コンポーネント(テーブル・ボタン・フォーム入力等)の土台を実装する(FR-011)

**Checkpoint**: ドメインモデル・永続化・startgg連携・アプリシェルが揃い、
以降のUser Storyを並行して実装できる状態。

---

## Phase 3: User Story 1 - 注意書きの確認と緊急連絡先の明示 (Priority: P1) 🎯 MVPの一部

**Goal**: 起動時に注意書きを表示し、いつでも再確認でき、緊急連絡先の記載が
確認できない場合は警告する。

**Independent Test**: 他の機能が未実装でも、アプリ起動時に注意書きが
表示されること、再表示ボタンが機能すること、緊急連絡先欠落時に警告される
ことを単独で検証できる。

### Tests for User Story 1

- [ ] T020 [P] [US1] `tests/unit/domain/rules/noticeValidation.test.ts` に
  緊急連絡先検出ロジックの単体テストを作成する(FR-003)
- [ ] T021 [P] [US1] `tests/integration/features/notice.test.tsx` に、
  起動時ゲート表示・再確認ボタン・警告表示の結合テストを作成する

### Implementation for User Story 1

- [ ] T022 [P] [US1] `src/features/notice/noticeSync.ts` に、T015のQ4を
  呼び出しNoticeをローカルへ同期する処理を実装する(FR-033)
- [ ] T023 [US1] `src/features/notice/NoticeGate.tsx` に、確認操作を
  するまで他の操作に進めない全画面の注意書き表示を実装し、`App.tsx`
  (T018)に組み込む。初回同期がまだ完了しておらずローカルキャッシュが
  存在しない場合の表示内容(同期中である旨の案内)も定義する(FR-001、
  edge case: 初回同期前の表示)
- [ ] T024 [US1] `src/features/notice/NoticeViewer.tsx` に「注意書きを
  確認」ボタンからの再表示モーダルを実装し、`App.tsx` に組み込む(FR-002)
- [ ] T025 [US1] `src/features/notice/EmergencyContactWarning.tsx` に、
  T017のルールを用いた緊急連絡先欠落時の警告表示を実装する(FR-003)

**Checkpoint**: User Story 1が単独で完全に機能する。

---

## Phase 4: User Story 2 - 予選プール進行のオフライン入力・保持 (Priority: P1) 🎯 MVP

**Goal**: 出欠・離席・進行担当者・対戦結果をオフラインでも入力・保持でき、
端末強制終了後も復元される。

**Independent Test**: startgg同期を止めた状態でも、1プール分の出欠・離席・
担当者・結果の入力と、次に行うべき対戦の把握が一連の操作として完結できる。

### Tests for User Story 2

- [ ] T026 [P] [US2] `tests/unit/domain/rules/roundRobinGenerator.test.ts`
  に総当り対戦カード生成ロジックの単体テストを作成する(FR-008)
- [ ] T027 [P] [US2]
  `tests/integration/features/pool-progress-persistence.test.tsx` に、
  入力→リロード→復元の結合テストを作成する(FR-013, SC-003)

### Implementation for User Story 2

- [ ] T028 [P] [US2] `src/features/pool-progress/AttendancePanel.tsx` に
  出欠記録UIを実装する(FR-004)
- [ ] T029 [P] [US2] `src/features/pool-progress/AwayPeriodPanel.tsx` に
  離席(開始/終了・任意の理由)記録UIを実装する(FR-005)
- [ ] T030 [P] [US2] `src/features/pool-progress/StaffAssignmentPanel.tsx`
  に進行担当者記録UIを実装する(FR-006)
- [ ] T031 [P] [US2] `src/domain/rules/roundRobinGenerator.ts` に総当り
  形式の対戦カード生成ロジックを実装する(FR-008)
- [ ] T032 [US2] `src/features/pool-progress/MatchCardList.tsx`,
  `MatchCardEntry.tsx` に対戦カード一覧と結果入力UIを実装する(FR-007)
  (依存: T012, T031)
- [ ] T033 [US2] `src/features/pool-progress/nextCardIndicator.ts` と
  `MatchCardList.tsx` への統合により、次に着手すべき対戦カードの強調表示を
  実装する(FR-009)(依存: T032)
- [ ] T034 [US2] 出欠・離席・担当者・結果の全入力経路が、オンライン/
  オフラインを問わず常にIndexedDBへ即時コミットされ、未反映分は
  `MatchCard.localOnly` としてキューされることを、T028〜T032の各パネルで
  確認・統合する(FR-012, FR-014)

**Checkpoint**: User Story 1, 2が単独で完全に機能する(MVP)。

---

## Phase 5: User Story 3 - startggへの自動バックグラウンド同期とオフライン通知 (Priority: P2)

**Goal**: オンライン時に一定間隔でstartggへ自動反映し、同期不良が続く場合は
スナックバーで通知する。

**Independent Test**: User Story 2で入力したデータに対し、オンライン/
オフラインを切り替え、自動反映とスナックバー通知の挙動を検証できる。

### Tests for User Story 3

- [ ] T035 [P] [US3] `tests/unit/features/sync/syncStatus.test.ts` に
  `SyncStatus.isStale` 導出ロジックの単体テストを作成する(FR-016)
- [ ] T036 [P] [US3] `tests/integration/features/sync.test.tsx` に、
  オンライン同期成功・オフライン継続時の警告・復帰時の解消を検証する
  結合テストを作成する

### Implementation for User Story 3

- [ ] T037 [US3] `src/features/sync/syncScheduler.ts` に、
  `navigator.onLine`/`online`・`offline`イベントと`setInterval`による
  定期同期スケジューラを実装する(FR-015, research.md 8.)
- [ ] T038 [US3] `src/features/sync/syncRunner.ts` に、未反映
  `MatchCard`(`localOnly`)のM1送信と、Q2/Q3/Q4の取得・反映を行う同期処理を
  実装し、`SyncStatus` を更新する(FR-015, FR-017)(依存: T015, T037)
- [ ] T039 [P] [US3] `src/features/sync/SyncStatusSnackbar.tsx` に、
  `SyncStatus.isStale` に基づくスナックバー通知を実装する(FR-016)

**Checkpoint**: User Story 1〜3が単独で完全に機能する。

---

## Phase 6: User Story 4 - 予選終了選手への次戦案内 (Priority: P2)

**Goal**: 予選が終了した選手の次戦(対戦相手・卓番号)を、下位クラスも含めて
案内する。

**Independent Test**: 単一クラス・複数クラス(下位クラス含む)双方のデータで
次戦案内の表示を検証できる。

### Tests for User Story 4

- [ ] T040 [P] [US4] `tests/unit/domain/rules/poolFinished.test.ts` に
  `poolFinished` 導出ロジックの単体テストを作成する(FR-018)
- [ ] T041 [P] [US4] `tests/integration/features/next-match.test.tsx` に、
  複数クラスでの次戦案内表示の結合テストを作成する(FR-020)

### Implementation for User Story 4

- [ ] T042 [US4] `src/domain/rules/poolFinished.ts` に、選手のプール内
  全対戦完了判定ロジックを実装する(FR-018)
- [ ] T043 [US4] `src/features/next-match/NextMatchBanner.tsx` に、
  対戦相手・卓番号を表示し、未確定時は「未確定」と表示するコンポーネントを
  実装する(FR-019)(依存: T042, T038のQ3反映)
- [ ] T044 [US4] `src/features/pool-progress/EntrantList.tsx` に、
  クラスによる除外を行わない選手一覧・次戦案内対象表示を実装する(FR-020)
  (依存: T043)

**Checkpoint**: User Story 1〜4が単独で完全に機能する。

---

## Phase 7: User Story 5 - 管理画面(認証・初期化・トークン管理・ログアウト・注意書き連携) (Priority: P2)

**Goal**: パスワード認証で管理画面に入り、PATによる初期化(対象プール指定・
トークン設定)・ログアウト(手動/24時間自動)・注意書きの確認と導線を提供する。

**Independent Test**: 一般モードと切り離して、パスワード入退室・PAT認証・
対象プール指定・トークン設定・ログアウト(手動/自動)・注意書き確認を
それぞれ単独で検証できる。

### Tests for User Story 5

- [ ] T045 [P] [US5] `tests/unit/features/admin/sessionExpiry.test.ts` に
  AdminSessionの24時間期限切れ・自動ログアウト判定ロジックの単体テストを
  作成する(FR-030, FR-031)
- [ ] T046 [P] [US5] `tests/integration/features/admin.test.tsx` に、
  初期化フロー・個別再設定・ログアウト(手動/自動)の結合テストを作成する

### Implementation for User Story 5

- [ ] T047 [P] [US5] `src/features/admin/AdminPasswordGate.tsx` に
  パスワード入力による管理画面入室UIを実装する(FR-026)
- [ ] T048 [US5] `src/features/admin/InitLogin.tsx` に、PAT入力とT015の
  Q1呼び出しによる管理権限のあるトーナメント/イベント/フェーズ/プール
  一覧表示・選択UIを実装する(FR-027 (1)(2))(依存: T015)
- [ ] T049 [US5] `src/features/admin/PoolSelection.tsx` に、対象プールを
  `StartggIntegrationConfig` へ保存する処理を実装し、単独での再設定を
  可能にする(FR-010, FR-027 (2), FR-028)(依存: T048, T013)
- [ ] T050 [US5] `src/features/admin/TokenSettings.tsx` に、定期同期用
  トークンの保存処理を実装し、単独での再設定を可能にする(FR-027 (3),
  FR-028)(依存: T013)
- [ ] T051 [P] [US5] `src/features/admin/logout.ts` とUIへの組み込みで、
  手動ログアウトを実装する(FR-029)
- [ ] T052 [US5] `src/features/admin/sessionExpiry.ts` に、AdminSessionの
  24時間経過判定・自動ログアウト・その場および次回起動時の通知を実装する
  (FR-030, FR-031)(依存: T010)
- [ ] T053 [P] [US5] `src/features/admin/NoticeAdminPanel.tsx` に、現在の
  注意書き表示とstartgg側編集画面へのリンクを実装する(FR-032)(依存: T022
  [US1] — US1のnoticeSyncが前提となるため、US5をUS1と独立に着手する場合は
  この依存を先に解消しておくこと)

**Checkpoint**: User Story 1〜5が単独で完全に機能する。

---

## Phase 8: User Story 6 - 結果の後日修正 (Priority: P3)

**Goal**: 入力済み結果を後から修正でき、後続対戦が進行済みの場合は拒否する。

**Independent Test**: 後続対戦が未着手の結果は修正でき、進行済みの結果は
拒否されることを検証できる。

### Tests for User Story 6

- [ ] T054 [P] [US6] `tests/unit/domain/rules/editLock.test.ts` に
  `isLocked` 判定ロジックの単体テストを作成する(FR-022)
- [ ] T055 [P] [US6] `tests/integration/features/match-card-edit.test.tsx`
  に、修正可否それぞれの結合テストを作成する

### Implementation for User Story 6

- [ ] T056 [US6] `src/features/pool-progress/MatchCardEdit.tsx` に、
  確定済み対戦カードの修正UIを実装する(FR-021)(依存: T032)
- [ ] T057 [US6] `MatchCardEdit.tsx` にT016の`isLocked`判定を組み込み、
  修正拒否時の案内メッセージを実装する(FR-022)(依存: T016, T056)

**Checkpoint**: User Story 1〜6が単独で完全に機能する。

---

## Phase 9: User Story 7 - 印刷用ページの出力 (Priority: P3)

**Goal**: startggの印刷/PDF出力と同一レイアウトの印刷用ページを提供する。

**Independent Test**: 入力済みプールの印刷用ページが
`impact_major_4_brackets.pdf`と同等のレイアウトで表示され、PDF出力できる
ことを検証できる。

### Tests for User Story 7

- [ ] T058 [P] [US7] `tests/integration/features/print.test.tsx` に、
  ブラケット形式・総当り形式それぞれの印刷用ページ表示を検証する結合
  テストを作成する

### Implementation for User Story 7

- [ ] T059 [P] [US7] `src/features/print/print.css` に、画面用UI要素を
  非表示にする印刷スタイルシート(`@media print`)を実装する(FR-024)
- [ ] T060 [US7] `src/features/print/BracketPrintLayout.tsx` に、
  `impact_major_4_brackets.pdf`を参考にした組合せブラケット図・ヘッダー
  (プール名・大会名・日時・種目名・Judge欄)・フッター(生成日時)のレイアウトを
  実装する(FR-023, FR-024)(依存: T032)
- [ ] T061 [US7] `src/features/print/TablePrintLayout.tsx` に、総当り形式
  向けの表形式レイアウトを実装する(FR-025)
- [ ] T062 [US7] `src/features/print/PrintPage.tsx` に、プールの
  `bracketType` に応じてT060/T061を切り替え表示し、`window.print()` で
  出力するページを実装する(依存: T059, T060, T061)

**Checkpoint**: 全User Storyが単独で完全に機能する。

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: 全User Story横断の品質確認・ドキュメント整備

- [ ] T063 [P] `tests/contract/startgg-operations.test.ts` に、Q1〜Q4・M1の
  zodスキーマをサンプル応答で検証する契約テストを作成する
- [ ] T064 [P] `README.md` にプロジェクト概要・セットアップ手順を追記する
  (constitution.md Sync Impact Reportの保留事項)
- [ ] T065 `quickstart.md` のシナリオ1〜7を実機ブラウザで手動検証し、結果を
  記録する
- [ ] T066 [P] 全画面がstartggの画面構成と一貫した見た目になっているか
  横断的に確認・調整する(FR-011)
- [ ] T067 `npm run lint`, `npm run build`, `npm test` が全て通過することを
  確認する(Constitution原則I・III)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし。即座に開始可能
- **Foundational (Phase 2)**: Setup完了後。全User Storyをブロックする
- **User Stories (Phase 3+)**: 全てFoundational完了後に開始可能
  - 優先度順(P1→P1→P2→P2→P2→P3→P3)に進めることを推奨するが、
    Foundational完了後は並行着手も可能
- **Polish (Phase 10)**: 実装対象のUser Story完了後

### User Story Dependencies

- **US1 (P1)**: Foundational完了後に開始可能。他Storyへの依存なし
- **US2 (P1)**: Foundational完了後に開始可能。他Storyへの依存なし
- **US3 (P2)**: Foundational完了後に開始可能だが、意味のある検証には
  US2の対戦カードデータが必要(データ依存であり実装のブロックではない)
- **US4 (P2)**: Foundational完了後に開始可能。次戦情報の取得はUS3の同期
  処理(T038)と連動するが、UI自体はUS2完了後に統合するのが自然
- **US5 (P2)**: Foundational完了後に開始可能。対象プール指定・トークン
  管理・ログアウト系は他Storyへの依存なしだが、注意書きパネル(T053)のみ
  US1のnoticeSync(T022)に依存する。US5を他Storyと完全並行で進める場合は
  T053を最後に回すか、T022相当の取得処理を先に済ませること
- **US6 (P3)**: US2(対戦カード結果入力)完了後
- **US7 (P3)**: US2(対戦カードデータ)完了後

### Within Each User Story

- テスト(該当する場合)は実装前に作成する
- ドメインルール/リポジトリ→UIコンポーネント→画面統合の順
- 各Storyは他Storyを壊さず完了できること

### Parallel Opportunities

- Setup内の[P]タスク(T002〜T005)は並行実行可能
- Foundational内の[P]タスク(T006, T007, T008〜T010, T012〜T014, T016,
  T017, T019)は、それぞれの直接の前提タスク完了後に並行実行可能
- Foundational完了後、US1・US2・US5は互いに並行着手可能(担当者が複数いる
  場合。ただしUS5のT053はUS1のT022完了後に着手すること)
- 各Story内の[P]タスクは並行実行可能

---

## Parallel Example: Foundational Phase

```bash
# ドメインエンティティ/スキーマを並行して実装:
Task: "Pool・MatchCard・MatchCardEditの型とzodスキーマ in src/domain/entities/pool.ts, matchCard.ts, src/domain/schemas/pool.ts, matchCard.ts"
Task: "Entrant・NextMatchInfo・AwayPeriodの型とzodスキーマ in src/domain/entities/entrant.ts, src/domain/schemas/entrant.ts"
Task: "StaffAssignmentEntry・Notice・AdminSession・StartggIntegrationConfig・SyncStatusの型とzodスキーマ in src/domain/entities/*.ts, src/domain/schemas/*.ts"
```

## Parallel Example: User Story 2

```bash
# 出欠・離席・担当者記録UIを並行して実装:
Task: "出欠記録UI in src/features/pool-progress/AttendancePanel.tsx"
Task: "離席記録UI in src/features/pool-progress/AwayPeriodPanel.tsx"
Task: "進行担当者記録UI in src/features/pool-progress/StaffAssignmentPanel.tsx"
Task: "総当り対戦カード生成ロジック in src/domain/rules/roundRobinGenerator.ts"
```

---

## Implementation Strategy

### MVP First(User Story 1 + 2)

1. Phase 1: Setup を完了
2. Phase 2: Foundational を完了(全Story共通基盤、CRITICAL)
3. Phase 3: User Story 1(注意書き)を完了
4. Phase 4: User Story 2(オフライン入力)を完了
5. **STOP and VALIDATE**: US1・US2が単独で機能することを確認
   (紙の進行用紙をこのツールだけで置き換えられる状態 = MVP)
6. 必要であればここでデプロイ/デモ

### Incremental Delivery

1. Setup + Foundational → 基盤完成
2. US1 + US2 → MVP(オフラインでの紙代替)
3. US3(自動同期)→ 転記作業の完全排除
4. US4(次戦案内)→ 案内漏れ防止
5. US5(管理画面)→ 大会当日の準備作業を効率化
6. US6(結果修正)→ 誤入力への対応
7. US7(印刷)→ 予備手段・記録用途
8. 各StoryはPolishフェーズを待たず、完了ごとに検証・デモ可能

### Parallel Team Strategy

複数人での開発の場合:

1. 全員でSetup + Foundationalを完了
2. Foundational完了後:
   - 担当者A: US1 → US6(いずれも対戦カード確定ロジックを扱う)
   - 担当者B: US2 → US7(いずれも対戦カードデータを扱う)
   - 担当者C: US3 → US4(いずれも同期・次戦情報を扱う)
   - 担当者D: US5(管理画面。ただしT053はUS1完了後に着手)
3. 各Storyは独立して完了・統合可能

---

## Notes

- [P]タスク = 異なるファイル、未完了タスクへの依存なし
- [Story]ラベルはタスクを対応するUser Storyに対応付ける(トレーサビリティ用)
- 各User Storyは独立して完了・テスト可能であること
- 実装前にテストが失敗することを確認する(テストを作成するタスクがある場合)
- 論理的な単位ごと(タスクごと、またはStoryごと)にコミットする
- チェックポイントごとに、そのStoryが単独で動作することを検証してから
  次へ進む
- 避けるべきこと: 曖昧なタスク、同一ファイルへの競合、Story間の独立性を
  壊すクロスStory依存
