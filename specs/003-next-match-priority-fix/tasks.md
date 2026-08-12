---

description: "Task list for 003-next-match-priority-fix"
---

# Tasks: 次戦サジェストの優先順位修正

**Input**: Design documents from `/specs/003-next-match-priority-fix/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md（`contracts/`は本featureでは作成されていない — 新規永続データ・外部インターフェースがないため）

**Tests**: 001/002の規約（`domain/rules`配下の純粋関数は`tests/unit/domain/rules/`でユニットテストする）を踏襲し、本featureでもテストタスクを含める。

**Organization**: タスクはspec.mdのユーザーストーリー（US1: P1, US2: P2）ごとにグループ化する。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行実行可能（別ファイル、依存関係なし）
- **[Story]**: 対応するユーザーストーリー（US1, US2）
- 各タスクは正確なファイルパスを含む

## Path Conventions

Single project構成（plan.mdのProject Structureを踏襲）:
- `src/domain/rules/` — 純粋関数のロジック
- `tests/unit/domain/rules/` — 対応するユニットテスト

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 本featureは新しいプロジェクト初期化・依存追加・lint設定を必要としない（plan.mdのTechnical Context: 新規ライブラリ・新規永続データ・新規UI層の変更なし）。

- [X] T001 `src/domain/rules/nextMatchSuggestion.ts`と`tests/unit/domain/rules/nextMatchSuggestion.test.ts`の現状（既存の`pickBest`ロジックと既存テストケース）を確認し、Phase 3以降で書き換える範囲を把握する。

**Checkpoint**: Setup完了。プロジェクト構造・依存関係の変更は不要なため、直ちにFoundationalへ進める。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: US1・US2の両方が依存する「対戦カードの遠さ」計算ロジック（`matchDistance.ts`）を先に実装する。US1のFR-002〜FR-006がこの計算結果を前提とするため、ブロッキング。

**⚠️ CRITICAL**: このフェーズが完了するまでUS1・US2の実装（`nextMatchSuggestion.ts`の書き換え）は開始できない。

- [X] T002 `src/domain/rules/matchDistance.ts`を新規作成し、`computeMatchDistances(matchCards: MatchCard[]): Map<string, number>`をexportする。data-model.md §1のアルゴリズムに従う: (a) `bracketSide`（`"WINNERS"`/`"LOSERS"`）ごとに、その側に属するカードのうち`Math.abs(round)`が最大のものを基準点とし距離1を割り当てる（複数タイの場合は全て基準点にする）。(b) `entrant1SourceMatchId`/`entrant2SourceMatchId`が指す対戦を「出場元」とする有向辺（出場元→この対戦）を全カードから構築し、基準点群からの多始点BFSで逆方向（この対戦→出場元）にたどり、既に距離が確定した対戦の出場元となる各対戦に「+1」した距離を割り当てる（複数経路がある場合はBFSにより自動的に最短距離が採用される）。(c) `bracketSide`が全カードで`"N/A"`（総当り形式）の場合は空のMapを返す。
- [X] T003 [P] `tests/unit/domain/rules/matchDistance.test.ts`を新規作成し、`computeMatchDistances`のユニットテストを書く。既存の`makeCard(overrides)`ヘルパーパターン（`tests/unit/domain/rules/nextMatchSuggestion.test.ts`と同じ形）を使う。最低限のケース: (1) spec.mdの例（WF/LSFが距離1、WSF/LQFが距離2）を`entrant1SourceMatchId`/`entrant2SourceMatchId`で構成し正しい距離が返ることを確認、(2) 勝者側から敗者側への「落ち」エッジ（`entrant2SourceMatchId`が別サイドの対戦を指す等）を含む構成で距離が正しく伝播することを確認、(3) 総当り形式（`bracketSide`が全て`"N/A"`）で空のMapが返ることを確認、(4) シングルイリミネーション（`LOSERS`側のカードが存在しない）で勝者側のみ距離が算出されることを確認。

**Checkpoint**: `matchDistance.ts`が独立してテスト済みの状態になれば、US1・US2の実装を開始できる。

---

## Phase 3: User Story 1 - 進行可能な対戦だけを優先順位に沿って提示する (Priority: P1) 🎯 MVP

**Goal**: 出場者が両方確定していない対戦（不戦勝(BYE)を含む）を次戦候補から除外し、適格な候補は「プール抜けからの遠さ」→「敗者側優先」→「組合せ図上の表示順」の順で優先順位付けする。

**Independent Test**: 出場者が両方は決まっていない対戦カードが存在するプールで、その対戦が次戦候補として一切提示されないこと。あわせて、出場者が両方確定している対戦の中から、優先順位規則（FR-002〜FR-006）に沿って正しい対戦が選ばれること。`computeNextMatchSuggestions`のユニットテストで検証する。

### Tests for User Story 1 ⚠️

> **NOTE: 実装前にこれらのテストを書き、FAILすることを確認する**

- [X] T004 [P] [US1] `tests/unit/domain/rules/nextMatchSuggestion.test.ts`に、FR-001（適格条件）の新規テストケースを追加する: (a) `entrant1Id`または`entrant2Id`のいずれかが`null`の未着手カードが候補から除外されること（Acceptance Scenario 1）、(b) 不戦勝(BYE)相当（片方の枠のみ埋まっている）カードも同様に除外されること（Acceptance Scenario 2、ユーザー訂正済みの仕様）。既存の「両者確定済みなら候補になる」ケースは維持しつつ、除外系のケースを追加する。
- [X] T005 [P] [US1] `tests/unit/domain/rules/nextMatchSuggestion.test.ts`に、FR-004（遠さ優先）のテストケースを追加する: spec.mdの例（WF/LSF距離1・WSF/LQF距離2相当の`entrant1SourceMatchId`/`entrant2SourceMatchId`構成）で、WF/LSFがまだ出場者未確定、WSF/LQFが出場者確定済みの状態を作り、距離の大きいWSF/LQFが優先して候補になることを確認する（Acceptance Scenario 3）。
- [X] T006 [P] [US1] `tests/unit/domain/rules/nextMatchSuggestion.test.ts`に、FR-005（敗者側優先タイブレーク）のテストケースを追加する: 勝者側・敗者側で遠さが等しい出場者確定済みカードが1つずつあり、対戦台が1つしか空いていない状態で、敗者側のカードが優先されることを確認する（Acceptance Scenario 4）。
- [X] T007 [P] [US1] `tests/unit/domain/rules/nextMatchSuggestion.test.ts`に、FR-006（表示順タイブレーク）のテストケースを追加する: 遠さ・側とも等しい出場者確定済みカードが複数あり、`bracketLayout.ts`の`computeBracketLayout`が算出する`slot`が異なる状態で、`slot`が小さい（＝組合せ図上で上に表示される）方が優先されることを確認する（Acceptance Scenario 5）。テスト内で`computeBracketLayout`を呼び出して対象カードの`slot`差を検証してから、`computeNextMatchSuggestions`の結果と突き合わせる。
- [X] T008 [P] [US1] `tests/unit/domain/rules/nextMatchSuggestion.test.ts`に、プール開始直後（初戦のみ出場者確定済み）のテストケースを追加する: ラウンド1のみ出場者が確定しており、ラウンド2以降は未確定の状態で、候補が必ずラウンド1のカードの中から選ばれることを確認する（Acceptance Scenario 6）。
- [X] T009 [P] [US1] `tests/unit/domain/rules/nextMatchSuggestion.test.ts`に、FR-008（総当り・単一エリミネーションのフォールバック）のテストケースを追加する: `bracketSide`が全て`"N/A"`のカード群で、既存どおり`round`→`identifier`昇順で候補が決まること（距離ベースの優先順位が適用されないこと）を確認する。あわせて、`LOSERS`側のカードが1件も存在しない（シングルイリミネーション相当）構成で、勝者側のみで距離に基づく優先順位が正しく機能することも確認する。

### Implementation for User Story 1

- [X] T010 [US1] `src/domain/rules/nextMatchSuggestion.ts`の`pickBest`を書き換える。（依存: T002）具体的には: (a) 適格条件に`card.entrant1Id !== null && card.entrant2Id !== null`を追加（既存の`status === "NOT_STARTED"`フィルタと組み合わせる）。(b) `matchDistance.ts`の`computeMatchDistances(matchCards)`を呼び出し、距離Mapを取得する。(c) 距離Mapが空（総当り形式、data-model.md §3）の場合は既存の`round`→`identifier`昇順ロジックをそのまま使う。(d) 距離Mapが非空の場合は、比較関数を「距離降順 → `bracketSide === "LOSERS"`優先 → `bracketLayout.ts`の`computeBracketLayout`から得た`slot`昇順 → `round`→`identifier`昇順（フォールバック）」の順に適用する。既存の`skippedFromSuggestion`による2群分け（`notSkipped`優先、全滅時のみスキップ済み群を使う）はそのまま維持し、新しい比較ロジックは各群内のソートにのみ適用する。
- [X] T011 [US1] `src/domain/rules/nextMatchSuggestion.ts`内で、`computeBracketLayout`（`bracketLayout.ts`からimport）の呼び出し結果から対戦カードID→`slot`の対応を作るヘルパー（ローカル関数で可、新規exportは不要）を追加し、T010の比較関数から参照できるようにする。`bracketLayout.ts`自体は変更しない（plan.mdのProject Structureどおり）。
- [X] T012 [US1] T004〜T009で追加したテストがすべてPASSすることを確認する。既存の（本feature以前からある）テストケースで、新しい適格条件・優先順位により意味が変わってしまうものがあれば、spec.mdの規則に合わせて更新する（過去の挙動保持が目的ではなく、正しい挙動への修正が目的であるため）。
  - 実施結果: `tests/integration/features/match-progression.test.tsx`の「敗者側への反映」テストが、出場者2名のみのプールで敗者側対戦カード(J)が片方の枠(Bobのみ)しか埋まらない構成になっており、旧ロジックでは(誤って)次戦候補として自動提示されモーダルが開いていた。新しいFR-001の適格条件では正しく対象外となりモーダルが開かなくなるため、テストの前提コメントとアサーションを実際の挙動(モーダルは表示されない)に合わせて更新した。それ以外の既存テストケースは変更なしでPASS。

**Checkpoint**: この時点でUser Story 1は独立して機能し、テスト可能な状態になっている（次戦候補の適格条件・優先順位が仕様どおりに動作する）。

---

## Phase 4: User Story 2 - 進行可能な対戦が対戦台数に満たなくても支障なく進行できる (Priority: P2)

**Goal**: 出場可能な対戦の数が空いている対戦台の数より少なくても、エラーや進行の停止を発生させない。

**Independent Test**: 出場者が両方確定している未着手の対戦の数が、設定されている対戦台の数より少ないプールで、余った対戦台には次戦候補が提示されず、かつエラー表示や進行の停止が発生しないことを確認する。

**Note**: research.md 決定7・plan.mdより、`computeNextMatchSuggestions`の既存ループ構造（`tableNumbers`を1件ずつ処理し、候補が尽きたら単に追加しない）は既にFR-007の要件を満たしている。US1の実装（適格条件・優先順位の変更）によってこの挙動が壊れていないことを確認するテストのみが必要で、実装コードの追加変更は不要。

### Tests for User Story 2 ⚠️

- [X] T013 [P] [US2] `tests/unit/domain/rules/nextMatchSuggestion.test.ts`に、対戦台が3つ設定されているが出場者両方確定済みの未着手カードが1つしかない状態のテストケースを追加し、1つの対戦台にのみ候補が提示され、残り2つの対戦台には候補が提示されず、かつ関数が例外を投げないことを確認する（Acceptance Scenario 1）。
- [X] T014 [P] [US2] `tests/unit/domain/rules/nextMatchSuggestion.test.ts`に、出場者両方確定済みの未着手カードが1つもない状態のテストケースを追加し、`computeNextMatchSuggestions`が空配列を返すこと（どの対戦台にも候補が提示されないこと）を確認する（Acceptance Scenario 2）。

### Implementation for User Story 2

- [X] T015 [US2] T013〜T014を実行し、FAILする場合のみ`src/domain/rules/nextMatchSuggestion.ts`の対戦台ループ処理を調整する。（想定: 既存ループ構造で既にPASSするはずのため、追加実装は不要な可能性が高い。PASSする場合はこのタスクは検証のみで完了とする。）

**Checkpoint**: User Story 1・2の両方が独立して機能する状態になる。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 全体の整合性確認と最終検証。

- [X] T016 [P] リポジトリ全体で`npm run lint`（Biome）を実行し、新規・変更ファイル（`matchDistance.ts`, `nextMatchSuggestion.ts`, 対応するテストファイル）に指摘がないことを確認する。
- [X] T017 [P] `npx tsc --noEmit`でTypeScript strictモードの型チェックが通ることを確認する（`any`不使用、plan.mdのConstitution Check原則Iに対応）。
- [X] T018 `npx vitest run`でテストスイート全体を実行し、T003〜T009・T013〜T014の新規テストを含む全テストがPASSすることを確認する（既知の`tests/integration/features/admin.test.tsx`のフレーク以外に失敗がないこと）。
- [X] T019 quickstart.mdのシナリオ1〜6を、実際の開発サーバー（`npm run dev`）またはstart.gg同期済みテストプールで手動確認する（可能な範囲で。特にシナリオ2〜4は組合せ図上での目視確認が有効）。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし。すぐに開始できる。
- **Foundational (Phase 2)**: Setup完了後に開始。US1・US2の両方をブロックする（`matchDistance.ts`がなければ優先順位ロジックを実装できないため）。
- **User Story 1 (Phase 3)**: Foundational完了後に開始。
- **User Story 2 (Phase 4)**: Foundational完了後に開始可能だが、実質的にはUS1の`nextMatchSuggestion.ts`変更（T010）が入っていないと対象コードが存在しないため、US1完了後に着手するのが自然（対戦台ループ構造自体はUS1のT010でも変更されないため、技術的にはUS1完了前でもテストのみは書ける）。
- **Polish (Phase 5)**: 望むUser Story（少なくともUS1、可能ならUS2も）完了後。

### User Story Dependencies

- **User Story 1 (P1)**: Foundational (Phase 2) 完了後に開始可能。他ストーリーへの依存なし。
- **User Story 2 (P2)**: Foundational (Phase 2) 完了後に開始可能。US1が変更する`nextMatchSuggestion.ts`のコードに対してテストを追加する形になるため、実務上はUS1のT010完了後に着手する。

### Within Each User Story

- テスト（T004〜T009、T013〜T014）を先に書き、実装前にFAILすることを確認する。
- US1: `matchDistance.ts`（Foundational）→ `nextMatchSuggestion.ts`書き換え（T010〜T011）→ テストPASS確認（T012）。
- US2: 既存ループ構造の検証テスト（T013〜T014）→ 必要な場合のみ調整（T015）。

### Parallel Opportunities

- T003（matchDistance.test.ts作成）はT002完了後、他の作業と並行不可（同じ機能への依存のため実質的に直列だが、書き始め自体はT002の型定義さえ決まれば並行可）。
- T004〜T009（US1のテストケース追加）は同一ファイル（`nextMatchSuggestion.test.ts`）内への追記のため、複数エージェントでの完全並行編集は競合しやすい。[P]マークは「他ストーリー・他ファイルとの独立性」を示すものであり、同一ファイル内の追記は実務上は順次適用を推奨する。
- T013〜T014（US2のテストケース）も同様に`nextMatchSuggestion.test.ts`への追記。
- T016〜T017（lint・型チェック）は独立して並行実行可能。

---

## Parallel Example: Foundational + User Story 1

```bash
# Foundational phase
Task: "Create computeMatchDistances in src/domain/rules/matchDistance.ts (T002)"
Task: "Write unit tests in tests/unit/domain/rules/matchDistance.test.ts (T003)"

# User Story 1 tests (can be drafted in parallel by different people conceptually,
# but land in the same file — sequence commits to avoid merge conflicts)
Task: "Add FR-001 eligibility test cases (T004)"
Task: "Add FR-004 distance-priority test cases (T005)"
Task: "Add FR-005 loser-side tiebreak test cases (T006)"
Task: "Add FR-006 display-order tiebreak test cases (T007)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup完了
2. Phase 2: Foundational（`matchDistance.ts`）完了 — CRITICAL、全ストーリーをブロック
3. Phase 3: User Story 1完了
4. **STOP and VALIDATE**: T012でUser Story 1を独立してテスト・検証
5. これでMVP（次戦サジェストの優先順位バグ修正）は完成し、単独でリリース可能

### Incremental Delivery

1. Setup + Foundational完了 → 基盤準備完了
2. User Story 1追加 → 独立テスト → MVPとしてリリース可能
3. User Story 2追加（実質的には既存挙動の検証） → 独立テスト → リリース
4. Polish（lint・型チェック・全体テスト・quickstart手動確認）

---

## Notes

- [P]タスク = 別ファイル・依存関係なし（ただし同一テストファイルへの複数追記タスクは実務上は順次適用を推奨、上記Parallel Opportunities参照）。
- [Story]ラベルはユーザーストーリーへの追跡可能性のために付与。
- 本featureは新しいUI変更・新しい永続データを含まないため、Setup・Polishフェーズは001/002と比べて小規模。
- `computeNextMatchSuggestions`の外部シグネチャ（`matchCards`, `tableNumbers`引数、`NextMatchSuggestion[]`戻り値）はplan.mdの方針どおり変更しない。
- 各タスク完了後、または論理的なまとまりごとにコミットする。
