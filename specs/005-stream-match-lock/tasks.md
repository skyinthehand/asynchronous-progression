---

description: "Task list for 005-stream-match-lock"
---

# Tasks: 配信台設定された対戦の編集ロック

**Input**: Design documents from `/specs/005-stream-match-lock/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/stream-field-schema.md, quickstart.md

**Tests**: 001〜004の規約(`domain/rules`配下の純粋関数は
`tests/unit/domain/rules/`、UIを含む挙動は`tests/integration/features/`、
start.gg APIマッピングは`tests/contract/`)を踏襲し、本featureでも
テストタスクを含める。

**Organization**: タスクはspec.mdのユーザーストーリー(US1: P1, US2: P2)
ごとにグループ化する。

> **2026-08-19 更新**: `/speckit-analyze`で検出した3件の指摘
> (I1: 確定済みカードの結果修正が配信ロックの対象から漏れるおそれ、
> G1: 同期失敗時の状態維持(FR-010)のテスト欠如、G2: 配信中は結果修正も
> 不可であることの明示的なテスト欠如)を受け、ユーザーの回答
> (「Streamが設定中のマッチだけロックする。配信が終わったら自動で解除
> される想定でよい」「配信中のマッチは結果修正できない」)に基づき、
> spec.md(FR-004・Edge Cases・Assumptions・Acceptance Scenario追加)・
> data-model.mdを修正し、本tasks.mdを全面的に再採番した。特に
> `MatchCardRow.tsx`(総当り/OTHER形式の表)は、確定済みカードの結果修正
> ボタン(`MatchCardEdit`)が`isEditable`とは別の条件(`!readOnly`のみ)で
> 描画されており、`isEditable`だけに`isStreamLocked`を足しても確定済み
> カードの修正は防げないことが判明したため、修正対象に
> `MatchCardEdit`の描画条件そのものを追加した(旧T015相当、下記T017)。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行実行可能(別ファイル、依存関係なし)
- **[Story]**: 対応するユーザーストーリー(US1, US2)
- 各タスクは正確なファイルパスを含む

## Path Conventions

Single project構成(plan.mdのProject Structureを踏襲):

- `src/domain/schemas/`, `src/domain/rules/` — 型定義・純粋関数
- `src/infra/startgg/` — start.gg GraphQL連携
- `src/features/pool-progress/`, `src/features/sync/` — UI層・同期処理
- `src/app/global.css` — 共通スタイル
- `tests/contract/`, `tests/unit/domain/rules/`,
  `tests/integration/features/` — 対応するテスト

---

## Phase 1: Setup

**Purpose**: 本featureの変更対象となる既存ファイルの現状を確認する。新しい
依存追加・プロジェクト初期化は不要(plan.mdのTechnical Context: 新規
ライブラリなし)。

- [X] T001 `src/domain/schemas/matchCard.ts`・
  `src/infra/startgg/operations.ts`(`SetNodeSchema`, `POOL_DETAIL_QUERY`,
  `fetchPoolDetail`)・`src/features/sync/syncRunner.ts`(`mergeMatchCard`)・
  `src/features/pool-progress/usePoolProgress.ts`・`MatchCardEntry.tsx`・
  `MatchCardRow.tsx`・`MatchCardEdit.tsx`の現状を確認し、Phase 2以降で
  変更する箇所を把握する。特に`MatchCardEdit.tsx`は`card.isLocked`のみを
  見て確定済みカードの修正可否を判定しており、`isStreamed`を直接参照
  できる構造になっていない点に注意する(呼び出し元での描画ガードで
  対応する、下記T017参照)。

**Checkpoint**: Setup完了。直ちにFoundationalへ進める。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `MatchCard.isStreamed`フィールドの追加・start.ggからの取得・
判定用の純粋関数を用意する。US1・US2の両方がこのフィールドと判定関数に
依存するため、ブロッキング。

**⚠️ CRITICAL**: このフェーズが完了するまでUS1・US2の実装は開始できない。

- [X] T002 `src/domain/schemas/matchCard.ts`の`MatchCardSchema`に
  `isStreamed: z.boolean().default(false)`を追加する(data-model.md §1、
  contracts/stream-field-schema.md)。既存フィールドの並びの末尾に追加し、
  コメントで「start.gg上でこの対戦に配信(ストリーム)が割り当てられて
  いるか。読み取り専用、定期同期のたびにstart.gg側の最新値で上書きする」
  旨を明記する。
- [X] T003 [P] `src/infra/startgg/operations.ts`の`SetNodeSchema`に
  `stream: z.object({ id: z.union([z.string(), z.number()]) }).nullable()`
  を追加し、`POOL_DETAIL_QUERY`の`sets.nodes`選択に`station`と同じ並びで
  `stream { id }`を追加する(contracts/stream-field-schema.md)。
  `fetchPoolDetail`内のマッピングで、返す`MatchCard`オブジェクトに
  `isStreamed: set.stream !== null`を追加する。**⚠️ 実装後、本番投入前に
  実際にstart.gg上で配信台を設定した対戦を含むプールでこのクエリを実行し、
  レスポンスの実際の形(フィールド名を含む)を確認すること
  (research.md #1の未検証の前提)。**
- [X] T004 [P] `tests/contract/startgg-operations.test.ts`の
  `describe("Q2: fetchPoolDetail", ...)`に、`stream`フィールドが
  非nullの場合に`isStreamed: true`へ、`null`の場合に`isStreamed: false`へ
  マッピングされることを確認するテストケースを追加する(既存の
  `station`マッピングのテストケースと同じ形式に合わせる)。
- [X] T005 [P] `src/domain/rules/streamLock.ts`を新規作成し、
  `export function isStreamLocked(card: MatchCard): boolean { return
  card.isStreamed; }`をexportする。ファイル冒頭のコメントで、既存の
  `isPreviewSetId`(previewId.ts)・`isEntrantAway`(awayStatus.ts)と同様、
  「状態判定を専用の名前付き関数に切り出す」設計方針に沿うこと、
  `isLocked`(後続対戦の進行によるロック)・プレビューモード(ブラケット
  未開始によるプール全体のロック)とは独立した、対戦カード単位の3つ目の
  ロック条件であること、および対戦カードの状態(未着手・進行中・確定済み)
  を問わず一律に適用される(確定済みカードの結果修正も対象に含む)ことを
  明記する(research.md #2、spec.md Edge Cases 2026-08-19更新)。
- [X] T006 [P] `tests/unit/domain/rules/streamLock.test.ts`を新規作成し、
  `isStreamLocked`のユニットテストを書く(`makeCard(overrides)`ヘルパー
  パターンを使う)。`isStreamed: true`のカードで`true`、`isStreamed: false`
  (既定値)のカードで`false`を返すことを確認する。`status`が
  `NOT_STARTED`/`IN_PROGRESS`/`COMPLETED`のいずれであっても、
  `isStreamed`の値のみで判定結果が変わらないことも確認する(statusに
  依存しないことの確認)。
- [X] T007 `tests/integration/features/table-assignment.test.tsx`の
  既存の`mergeMatchCard`直接呼び出しテスト(`await import(...)`パターン)
  の近くに、以下のテストケースを追加する: (a) ローカルの
  `isStreamed: false`のカードと、リモートの`isStreamed: true`のカードを
  マージした結果が`isStreamed: true`になること(remote優先、
  contracts/stream-field-schema.md「同期時のマージ規則」)。(b)
  `local.localOnly === true`(未送信の結果確定が残っている)状態で
  リモートが`isStreamed: true`を返した場合、マージ結果がローカルの
  `isStreamed`(未送信分の同期完了までは古い値のまま)を維持すること
  (spec.md Edge Cases、既存の`localOnly`ブロック分岐によりコード変更なしで
  成立することの確認)。
- [X] T008 [P] `tests/integration/features/sync.test.tsx`に、
  `fetchPoolDetail`のモックが例外を投げる(同期に失敗する)場合、
  同期前に`isStreamed: true`だった対戦カードが、同期失敗後も
  `isStreamed: true`のまま(配信ロックが解除されない)ことを確認する
  テストケースを追加する(FR-010、`/speckit-analyze`指摘G1)。既存の
  同期失敗テスト(「ローカルデータを一切変更しない」検証)のパターンを
  参考にする。既存の`runSync`は失敗時に`saveMatchCards`自体を呼ばない
  ため、実装コードの追加変更なしにこのテストがPASSするはずである
  ことを確認する(想定通りPASSしない場合のみ`syncRunner.ts`の修正が
  必要)。

**Checkpoint**: `isStreamed`フィールドの取得・保存・判定(同期失敗時の
状態維持を含む)が独立してテスト済みの状態になれば、US1・US2の実装を
開始できる。

---

## Phase 3: User Story 1 - 配信対戦を誤って操作できないようにする (Priority: P1) 🎯 MVP

**Goal**: 配信台が設定されている対戦カードについて、対戦カードの状態
(未着手・進行中・確定済み)を問わず、「進行中にする」「対戦台の割り当て」
「結果確定」「結果修正」のいずれの操作もできないようにする。一覧・
組合せ図からは非表示にせず、次戦候補の対象からは除外する。start.gg側の
結果反映は妨げない。配信が終了し配信台の設定が解除されれば、次回の同期で
自動的に操作可能な状態に戻る。

**Independent Test**: start.gg上で配信台が設定された対戦カードについて、
未着手・進行中・確定済みのいずれの状態でも編集操作(進行中にする・対戦台
選択・結果入力・結果修正)が実行できないこと、かつ一覧には表示され続け、
次戦候補には出ないことを確認する。配信台が設定されていない他の対戦カードは
これまで通り操作できることも確認する。

### Tests for User Story 1 ⚠️

> **NOTE: 実装前にこれらのテストを書き、FAILすることを確認する**

- [X] T009 [P] [US1] `tests/integration/features/stream-lock.test.tsx`を
  新規作成する。`isStreamed: true`の未着手対戦カードを含むプールを
  `seedPool`し、`render(<App />)`後、その対戦カードをタップしても編集
  モーダル(進行中にするボタン・対戦台選択・結果入力フォーム)が開かない
  ことを確認するテストケース(Acceptance Scenario 1)を書く。
  `tests/integration/features/preview-mode.test.tsx`の
  `readOnly`検証パターン(カードタップ→モーダルが開かないことを確認)を
  参考にする。あわせて、その対戦カードの識別子・対戦者名が一覧に表示
  され続けていることも確認する(FR-005、非表示・除外にしないことの
  明示的な確認)。
- [X] T010 [P] [US1] T009と同じファイルに、`isStreamed: false`の他の
  対戦カードは通常どおりタップして編集モーダルが開くことを確認する
  テストケースを追加する(配信台が設定されていないカードへの影響が
  ないことの確認)。
- [X] T011 [P] [US1] `tests/unit/domain/rules/nextMatchSuggestion.test.ts`
  に、`isStreamed: true`かつ出場者が両方確定している未着手の対戦カードが
  `computeNextMatchSuggestions`の候補から除外されることを確認するテスト
  ケースを追加する(FR-006、Acceptance Scenario 2)。他に候補となる
  カードがあればそちらが選ばれることも確認する。
- [X] T012 [P] [US1] `stream-lock.test.tsx`に、`isStreamed: true`の対戦
  カードがstart.gg側の同期で確定済み結果(勝者・スコア)を受け取った
  場合、他の対戦カードと同様に確定済みとして一覧に表示されることを
  確認するテストケースを追加する(FR-009、Acceptance Scenario 3)。
  `tests/integration/features/sync.test.tsx`の同期結果反映テストの
  パターンを参考にする。
- [X] T013 [P] [US1] `stream-lock.test.tsx`に、`status: "COMPLETED"`・
  `isLocked: false`(後続対戦は未進行で、`isStreamed`さえなければ本来
  修正できる状態)・`isStreamed: true`の対戦カードで、(a)
  組合せ図形式(`MatchCardEntry.tsx`、`bracketType`が
  `SINGLE_ELIMINATION`または`DOUBLE_ELIMINATION`)ではカードをタップしても
  修正モーダルが開かないこと、(b) 総当り/OTHER形式の表
  (`MatchCardRow.tsx`)では「結果を修正」ボタン自体が表示されないことを、
  それぞれ確認するテストケースを追加する(FR-004、Acceptance Scenario 4、
  `/speckit-analyze`指摘I1・G2)。比較対象として、`isStreamed: false`・
  `isLocked: false`の確定済みカードでは、いずれの形式でも通常どおり
  修正操作ができることも確認する。

### Implementation for User Story 1

- [X] T014 [US1] `src/features/pool-progress/usePoolProgress.ts`の
  `recordResult`・`assignTable`・`callSuggestedMatch`・`setInProgress`の
  それぞれの冒頭(`isPreviewMode`チェックのすぐ後)に、対象の`target`
  カードを取得した後で`isStreamLocked(target)`が`true`なら早期return
  する処理を追加する(`recordResult`/`setInProgress`/
  `callSuggestedMatch`は何もせずreturn、`assignTable`は`false`を返す)。
  `recordResult`は新規確定・既存結果の修正(`MatchCardEdit`経由)の両方で
  共通して呼ばれる関数のため、この1箇所のガードで両方がブロックされる
  (T013(a)(b)の期待動作の裏付け)。`streamLock.ts`から`isStreamLocked`を
  importする。(依存: T005)
- [X] T015 [US1] `src/domain/rules/nextMatchSuggestion.ts`の`isEligible`
  関数に`!isStreamLocked(card)`の条件を追加する。`streamLock.ts`から
  `isStreamLocked`をimportする。(依存: T005)
- [X] T016 [US1] `src/features/pool-progress/MatchCardEntry.tsx`の
  `canEdit`の算出(`const canEdit = !readOnly && (isEditable ||
  !card.isLocked);`)に`&& !isStreamLocked(card)`を追加し、
  `const canEdit = !readOnly && (isEditable || !card.isLocked) &&
  !isStreamLocked(card);`とする。`canEdit`はカード全体のタップ判定(新規
  入力・修正モーダルの両方の開閉)を一括で制御しているため、この1箇所の
  変更で未着手・進行中・確定済みのいずれの状態でも配信ロックが働く
  (T013(a)の期待動作の裏付け)。`streamLock.ts`から`isStreamLocked`を
  importする。(依存: T005)
- [X] T017 [US1] `src/features/pool-progress/MatchCardRow.tsx`に、以下の
  2箇所の変更を行う。**(a)** `isEditable`の算出(`const isEditable =
  card.status !== "COMPLETED" && !readOnly;`)に
  `&& !isStreamLocked(card)`を追加する(未着手・進行中の新規入力を防ぐ)。
  **(b)** `card.status === "COMPLETED"`の分岐内で`MatchCardEdit`を描画
  している条件`{!readOnly && (<MatchCardEdit ... />)}`を
  `{!readOnly && !isStreamLocked(card) && (<MatchCardEdit ... />)}`に
  変更する(確定済みカードの「結果を修正」ボタン自体を出さないことで
  修正操作を防ぐ。`MatchCardEdit.tsx`自体は`card.isLocked`のみを見て
  `isStreamed`を認識しない構造のため、呼び出し元のこの描画条件で
  防ぐ必要がある。T013(b)の期待動作の裏付け、`/speckit-analyze`指摘I1)。
  `streamLock.ts`から`isStreamLocked`をimportする。(依存: T005)
- [X] T018 [US1] T009〜T013で追加したテストがすべてPASSすることを
  確認する。

**Checkpoint**: この時点でUser Story 1は独立して機能し、テスト可能な
状態になっている(配信対戦への誤操作(修正を含む)が防止され、次戦候補
からも除外される)。

---

## Phase 4: User Story 2 - 配信対戦であることが一目でわかる (Priority: P2)

**Goal**: 配信台が設定されている対戦カードに、他の操作不可理由(確定済み・
後続対戦の進行によるロック)とは区別できる表示を、対戦カードの状態を
問わず付ける。配信台の設定が解除されれば、次回の同期で表示・操作可否が
元に戻る。

**Independent Test**: 配信台が設定されている対戦カードに、配信中である
ことを示す表示(バッジ)が、未着手・進行中・確定済みのいずれの状態でも
付いていること。配信台の設定が解除された後、次回の同期完了時にその表示が
消え、通常どおり操作できる状態に戻ることを確認する。

### Tests for User Story 2 ⚠️

- [X] T019 [P] [US2] `tests/integration/features/stream-lock.test.tsx`に、
  `isStreamed: true`の対戦カードに配信中であることを示すバッジ
  (例: `screen.getByText("配信中")`相当)が表示されることを確認する
  テストケースを追加する(Acceptance Scenario 1)。あわせて、(a)
  後続対戦の進行によるロック(`isLocked: true`)のみが理由のカードには
  この配信中バッジが表示されないことを確認し区別できることを示す。(b)
  T013と同様の`status: "COMPLETED"`・`isStreamed: true`のカードでも
  配信中バッジが表示されること(修正はできないが表示は行われる、
  data-model.md §2)を確認する。
- [X] T020 [P] [US2] `tests/integration/features/stream-lock.test.tsx`に、
  1回目の同期で`isStreamed: true`だった対戦カードが、2回目の同期
  (`fetchPoolDetail`のモックを`isStreamed: false`相当に変えて再実行)で
  配信ロックが解除され、編集モーダルが開けるようになることを確認する
  テストケースを追加する(FR-008、Acceptance Scenario 2)。**実装時の
  変更**: このアプリは既に開いている画面へバックグラウンド同期の完了を
  即座に反映する仕組みを持たない(`usePoolProgress`はマウント時にのみ
  読み込む)ため、`tests/integration/features/sync.test.tsx`ではなく、
  `stream-lock.test.tsx`側で001-pool-progression-trackerの既存テストと
  同じ「`unmount()`→2回目の`runSync()`→再`render`」という端末再起動を
  模すパターンを使って検証する。

### Implementation for User Story 2

- [X] T021 [US2] `src/app/global.css`に`.match-card-stream-badge`を
  新規追加する。既存の`.match-card-status-badge`(進行中バッジ、
  `var(--accent-color)`の青系)とは異なる配色(例: 赤紫系、`#c026d3`や
  `#be185d`等)にし、視覚的に区別できるようにする。表示位置・サイズは
  `.match-card-status-badge`のスタイル(`display: inline-block`,
  `font-size: 0.7rem`, `font-weight: 700`, `color: #fff`,
  `padding: 0.05rem 0.4rem`, `margin: 0.3rem 0.5rem 0`,
  `border-radius: 3px`)に合わせる。
- [X] T022 [US2] `src/features/pool-progress/MatchCardEntry.tsx`に、
  `card.isStreamed`が`true`の場合に`<span
  className="match-card-stream-badge">配信中</span>`を表示する箇所を
  追加する(既存の`match-card-status-badge`(進行中)表示の近くに配置)。
  **`card.status`の値(`NOT_STARTED`/`IN_PROGRESS`/`COMPLETED`)に関わらず
  表示すること**(既存の`進行中`バッジのような特定ステータス限定の
  条件に含めないよう注意する)。
- [X] T023 [US2] `src/features/pool-progress/MatchCardRow.tsx`に、T022と
  同様の配信中バッジ表示を追加する(既存の進行中バッジ表示の近くに
  配置)。既存の`match-card-entrants`セル(未着手・進行中向け)だけでなく、
  `status === "COMPLETED"`の分岐(`match-card-result`セル)側にも表示する
  ことで、**`card.status`の値に関わらず表示されるようにする**。
- [X] T024 [US2] T019〜T020で追加したテストがすべてPASSすることを
  確認する。

**Checkpoint**: User Story 1・2の両方が独立して機能する状態になる。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 全体の整合性確認と最終検証。

- [X] T025 [P] リポジトリ全体で`npm run lint`(Biome)を実行し、新規・
  変更ファイル(`matchCard.ts`, `operations.ts`, `streamLock.ts`,
  `nextMatchSuggestion.ts`, `usePoolProgress.ts`, `MatchCardEntry.tsx`,
  `MatchCardRow.tsx`, `global.css`, 対応するテストファイル)に指摘が
  ないことを確認する。
- [X] T026 [P] `npx tsc -p tsconfig.json --noEmit`でTypeScript strict
  モードの型チェックが通ることを確認する(`any`不使用、plan.mdの
  Constitution Check原則Iに対応)。
- [X] T027 `npx vitest run --no-file-parallelism`でテストスイート全体を
  実行し、T004・T006・T007・T008・T009〜T013・T019〜T020の新規テストを
  含む全テストがPASSすることを確認する。
- [X] T028 `npm run build`でVite本番ビルドが通ることを確認する。
- [ ] T029 quickstart.mdのシナリオ1〜5を、実際の開発サーバー
  (`npm run dev`)またはstart.gg同期済みテストプール(実際に配信台を
  設定した対戦を含む)で手動確認する。確定済みカードの結果修正が
  ブロックされること(T013相当)も、組合せ図形式・総当り/OTHER形式の
  両方で手動確認する。T003で明記した未検証の前提(配信フィールドの
  正確な形)を、この手動確認と合わせて検証する。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし。すぐに開始できる。
- **Foundational (Phase 2)**: Setup完了後に開始。US1・US2の両方をブロック
  する(`isStreamed`フィールド・`isStreamLocked`がなければ両ストーリーとも
  実装できないため)。
- **User Story 1 (Phase 3)**: Foundational完了後に開始。
- **User Story 2 (Phase 4)**: Foundational完了後に開始可能。バッジ表示
  ・自動解除はUS1の編集ロック自体とは独立して実装・検証できるが、
  実務上はUS1のUI変更(T016〜T017)と同じファイルを扱うため、US1完了後に
  着手するのが自然。
- **Polish (Phase 5)**: 望むUser Story(少なくともUS1、可能ならUS2も)
  完了後。

### User Story Dependencies

- **User Story 1 (P1)**: Foundational (Phase 2) 完了後に開始可能。他
  ストーリーへの依存なし。
- **User Story 2 (P2)**: Foundational (Phase 2) 完了後に開始可能。
  `MatchCardEntry.tsx`/`MatchCardRow.tsx`への追記がUS1(T016〜T017)と
  同じ箇所に近いため、コンフリクトを避けるためUS1完了後の着手を推奨。

### Within Each User Story

- テスト(T009〜T013、T019〜T020)を先に書き、実装前にFAILすることを
  確認する。
- US1: `isStreamed`取得・判定(Foundational)→ `usePoolProgress.ts`・
  `nextMatchSuggestion.ts`・`MatchCardEntry.tsx`・`MatchCardRow.tsx`の
  ガード追加(T014〜T017)→ テストPASS確認(T018)。
- US2: バッジCSS→ `MatchCardEntry.tsx`・`MatchCardRow.tsx`への表示追加
  (T021〜T023)→ テストPASS確認(T024)。

### Parallel Opportunities

- T003・T005(Foundational、それぞれ別ファイル)はT002完了後に並行実行
  可能。
- T004(T003に依存)・T006(T005に依存)・T008(T002・T003に依存、別ファイル)
  はそれぞれの実装タスク完了後に並行実行可能。
- T009〜T013(US1のテスト、同一ファイルへの追記が多い)は実務上は順次
  適用を推奨。T011のみ別ファイル(`nextMatchSuggestion.test.ts`)のため
  完全並行可能。
- T014〜T017(US1の実装、いずれも別ファイル)は並行実行可能。
- T025〜T026(lint・型チェック)は独立して並行実行可能。

---

## Parallel Example: Foundational

```bash
# T002完了後
Task: "Add stream field to SetNodeSchema/POOL_DETAIL_QUERY in src/infra/startgg/operations.ts (T003)"
Task: "Create isStreamLocked in src/domain/rules/streamLock.ts (T005)"

# それぞれの実装完了後
Task: "Add contract test for stream mapping in tests/contract/startgg-operations.test.ts (T004)"
Task: "Add unit test for isStreamLocked in tests/unit/domain/rules/streamLock.test.ts (T006)"
Task: "Add sync-failure retention test in tests/integration/features/sync.test.tsx (T008)"
```

## Parallel Example: User Story 1 Implementation

```bash
# T005完了後、いずれも別ファイルのため並行実行可能
Task: "Guard recordResult/assignTable/callSuggestedMatch/setInProgress in src/features/pool-progress/usePoolProgress.ts (T014)"
Task: "Exclude streamed cards in src/domain/rules/nextMatchSuggestion.ts (T015)"
Task: "Gate canEdit in src/features/pool-progress/MatchCardEntry.tsx (T016)"
Task: "Gate isEditable and MatchCardEdit rendering in src/features/pool-progress/MatchCardRow.tsx (T017)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup完了
2. Phase 2: Foundational(`isStreamed`フィールド・取得・`isStreamLocked`・
   同期失敗時の状態維持確認)完了 — CRITICAL、全ストーリーをブロック
3. Phase 3: User Story 1完了
4. **STOP and VALIDATE**: T018でUser Story 1を独立してテスト・検証
5. これでMVP(配信対戦への誤操作(修正を含む)防止)は完成し、単独で
   リリース可能(バッジによる視覚的な区別(US2)がなくても、操作自体は
   防止される)

### Incremental Delivery

1. Setup + Foundational完了 → 基盤準備完了
2. User Story 1追加 → 独立テスト → MVPとしてリリース可能
3. User Story 2追加(視覚的な区別・自動解除の確認) → 独立テスト → リリース
4. Polish(lint・型チェック・全体テスト・build・quickstart手動確認)

---

## Notes

- [P]タスク = 別ファイル・依存関係なし。
- [Story]ラベルはユーザーストーリーへの追跡可能性のために付与。
- T003で明記した「start.gg側の配信フィールドの正確な形は未検証」という
  前提(research.md #1)は、T029の手動確認まで残るリスクとして引き継ぐ。
  実機確認の結果、フィールド名や形が異なることが判明した場合は、T003・
  T004・contracts/stream-field-schema.mdを修正すること。
- `MatchCardRow.tsx`(総当り/OTHER形式)の確定済みカード修正ボタン
  (`MatchCardEdit`)は、`isEditable`とは別条件(`!readOnly`のみ)で描画
  されているため、T017では`isEditable`と`MatchCardEdit`描画条件の
  **両方**に`!isStreamLocked(card)`を追加する必要がある(片方だけでは
  確定済みカードの修正を防げない、`/speckit-analyze`指摘I1)。
- 各タスク完了後、または論理的なまとまりごとにコミットする。
