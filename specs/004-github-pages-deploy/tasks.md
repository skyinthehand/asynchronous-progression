# Tasks: GitHub Pages Deploy

**Input**: Design documents from `/specs/004-github-pages-deploy/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: spec.mdでテストタスクは明示的に要求されていない(このフィーチャーはCI/CD設定であり、既存のVitestスイート自体がその品質ゲートとして使われる)。テストタスクは含めない。

**Organization**: タスクはspec.mdのユーザーストーリー単位でグループ化されている。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行実行可能(別ファイル・依存関係なし)
- **[Story]**: 対応するユーザーストーリー(US1, US2, US3)
- 各タスクに具体的なファイルパスを含める

## Path Conventions

単一プロジェクト構成(`src/`, `tests/`がリポジトリ直下)。本フィーチャーは
`src/`配下のアプリケーションコードを追加しない。変更対象は
`.github/workflows/ci.yml`・`vite.config.ts`・`package.json`・
`README.md`のみ(plan.mdのProject Structure参照)。

---

## Phase 1: Setup

**Purpose**: デプロイ実行の前提となる、リポジトリ設定(コード変更ではない)を整える

- [ ] T001 GitHub Pagesを有効化する: リポジトリの Settings → Pages →
      Build and deployment → Source を **GitHub Actions** に設定する
      (手動操作。手順は`specs/004-github-pages-deploy/quickstart.md`の
      「前提条件」参照。公開APIで確認済みの通り、対象リポジトリでは
      まだPagesが有効化されていない — research.md #5)

**Checkpoint**: リポジトリ側でGitHub Actionsからのデプロイを受け付ける準備が整った

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: どのユーザーストーリーの検証も、この2つの変更なしには正しく
成立しない(公開URLが正しく描画されない/品質ゲートが不安定なため)

**⚠️ CRITICAL**: このフェーズ完了までユーザーストーリーの検証を開始できない

- [ ] T002 [P] `vite.config.ts` の `base` を、環境変数(`BASE_PATH`)が
      設定されていればその値、未設定なら既定値 `"/"` を使うように変更する
      (research.md #3)。`npm run dev`・`npm run build`・`npm run preview`
      は環境変数未設定のため、これまで通り `"/"` で動作し続けることを
      ローカルで確認する。
- [ ] T003 [P] `package.json` の `test` スクリプトを
      `vitest run --no-file-parallelism` に変更する(research.md #4)。
      変更後、`npm test` を実行しテストスイートが全件成功することを
      ローカルで確認する。

**Checkpoint**: 基盤となる変更が完了し、各ユーザーストーリーの実装・検証に進める

---

## Phase 3: User Story 1 - 会場スタッフが安定したURLでツールにアクセスできる (Priority: P1) 🎯 MVP

**Goal**: ビルド成果物をGitHub Pagesへ公開し、公開URLでアプリが正しく動作する状態にする(まずは手動トリガーで検証できる形)

**Independent Test**: `.github/workflows/ci.yml`の`deploy`ジョブを手動実行し、公開URLにアクセスして通常通りアプリが起動・動作することを確認する

### Implementation for User Story 1

- [ ] T004 [US1] `.github/workflows/ci.yml` に `deploy` ジョブを追加する:
      `actions/checkout` → `actions/setup-node`(既存`quality-gate`と同じ
      Node 22設定) → `npm ci` → `BASE_PATH=/asynchronous-progression/
      npm run build`(T002のbase切り替えを利用) →
      `actions/configure-pages` → `actions/upload-pages-artifact`
      (`path: dist`) → `actions/deploy-pages`。トリガーはまず
      `workflow_dispatch`(手動実行)のみとする。
- [ ] T005 [US1] `deploy` ジョブに、GitHub Pagesデプロイに必要な
      `permissions`(`contents: read`, `pages: write`, `id-token: write`)
      と `environment: github-pages` を `.github/workflows/ci.yml` に
      設定する。
- [ ] T006 [US1] T001完了後、Actionsタブから`deploy`ジョブを手動実行し、
      `specs/004-github-pages-deploy/quickstart.md`のシナリオ1手順4・
      シナリオ4を実施して、公開URL
      (`https://skyinthehand.github.io/asynchronous-progression/`)で
      注意事項確認モーダル・対戦カード操作・管理画面初期化等が
      ローカル開発環境と同じ挙動になることを確認する。

**Checkpoint**: この時点で、手動トリガーによる公開が可能になり、公開URLでアプリ全体が正しく動作する

---

## Phase 4: User Story 2 - mainブランチへの変更が自動的に公開される (Priority: P2)

**Goal**: `deploy`ジョブを、既存の品質ゲート(`quality-gate`)通過を条件に、mainブランチへのpushで自動実行されるようにする

**Independent Test**: mainブランチに変更をpushし、追加の手動操作なしに公開URLへ一定時間以内に反映されることを確認する

### Implementation for User Story 2

- [ ] T007 [US2] `.github/workflows/ci.yml` の `deploy` ジョブのトリガーに
      `push`(`branches: [main]`)を追加し、`needs: quality-gate` と
      `if: github.ref == 'refs/heads/main' && github.event_name ==
      'push'` を設定する(research.md #2)。これにより、品質ゲート
      (lint・型チェック・T003で安定化済みのテスト)を通過した場合のみ
      デプロイが実行される(FR-004)。
- [ ] T008 [US2] `specs/004-github-pages-deploy/quickstart.md`の
      シナリオ2を実施する: ローカルで`npm run lint && npm run build &&
      npm test`を実行して品質ゲートの内容を確認し、任意で一時的な
      ブランチ/PRに意図的に壊れた変更をpushして、`quality-gate`失敗時
      に`deploy`ジョブがスキップされることをActionsタブで確認する
      (確認後、そのブランチ/PRは削除する)。
- [ ] T009 [US2] 実際にmainブランチへ変更をpushし、
      `specs/004-github-pages-deploy/quickstart.md`のシナリオ1を
      end-to-endで実施する: `quality-gate` → `deploy` の自動実行、
      および公開URLへの反映がSC-002(10分以内)を満たすことを確認する。

**Checkpoint**: User Story 1・2ともに独立して動作する(手動トリガーなしで、mainへのマージだけで公開URLが更新される)

---

## Phase 5: User Story 3 - 配信環境固有の問題でアプリが壊れない (Priority: P3)

**Goal**: GitHub Pagesのプロジェクトページ配信(サブパス)でも、全アセットが正しく読み込まれることを確認する

**Independent Test**: 公開URLにアクセスし、ブラウザの開発者ツールでリソース読み込みエラー(404等)が発生していないことを確認する

### Implementation for User Story 3

- [ ] T010 [US3] `specs/004-github-pages-deploy/quickstart.md`の
      シナリオ3を実施する: 公開URLをブラウザで開き、開発者ツールの
      Networkタブで全アセット(JS/CSS)が404等のエラーなく読み込まれて
      いることを確認する(T002のbase path切り替えが正しく機能して
      いることの実地検証)。

**Checkpoint**: すべてのユーザーストーリーが独立して検証済みの状態になる

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 複数ストーリーにまたがる仕上げ

- [ ] T011 [P] `README.md` に公開URL
      (`https://skyinthehand.github.io/asynchronous-progression/`)と、
      mainブランチへのマージで自動デプロイされる旨を追記する。
- [ ] T012 `specs/004-github-pages-deploy/quickstart.md`の全シナリオを
      通しで再実施し、回帰がないことを最終確認する。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし。ただし公開URLへの実際のデプロイ(T006)より前に完了している必要がある。
- **Foundational (Phase 2)**: 依存なし(Setupと並行可能)。全ユーザーストーリーの検証をブロックする。
- **User Story 1 (Phase 3)**: Foundational完了後に開始。T001(Setup)完了もT006の前提。
- **User Story 2 (Phase 4)**: User Story 1(T004/T005で作成した`deploy`ジョブ)の上に構築するため、Phase 3完了後に開始する。
- **User Story 3 (Phase 5)**: Foundational(T002)の検証が主目的のため、Phase 3(実際に公開URLが存在する状態)完了後に実施する。
- **Polish (Phase 6)**: すべてのユーザーストーリー完了後。

### User Story Dependencies

- **User Story 1 (P1)**: Foundational完了後に開始可能。他のストーリーへの依存なし。
- **User Story 2 (P2)**: User Story 1で作成した`deploy`ジョブを拡張するため、User Story 1完了が前提(通常のstory独立性の原則から外れるが、同一ジョブを段階的に拡張する構成のため技術的に不可避)。
- **User Story 3 (P3)**: 独立した追加実装はなく、Foundational(T002)の検証のみ。User Story 1完了後(公開URLが存在する状態)に実施する。

### Within Each User Story

- User Story 1: ジョブ追加(T004) → permissions設定(T005) → 手動実行・検証(T006)
- User Story 2: トリガー拡張(T007) → ローカル検証(T008) → 実地検証(T009)
- User Story 3: 検証のみ(T010)

### Parallel Opportunities

- T002・T003(Foundationalの2タスク)は別ファイルのため並行実行可能。
- T011(README更新)はPolishフェーズの他タスクと並行実行可能。

---

## Parallel Example: Foundational

```bash
# Foundationalの2タスクを並行実行:
Task: "vite.config.ts の base を環境変数対応にする"
Task: "package.json の test スクリプトを --no-file-parallelism 付きにする"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup(T001)を完了する
2. Phase 2: Foundational(T002, T003)を完了する — 全ストーリーをブロックする重要フェーズ
3. Phase 3: User Story 1(T004〜T006)を完了する
4. **この時点で一度止めて検証**: 手動トリガーで公開URLが正しく動作することを確認する
5. ここまでで最小限の「公開できる」状態(MVP)が完成

### Incremental Delivery

1. Setup + Foundational完了 → 基盤が整う
2. User Story 1追加 → 手動デプロイで検証 → 最小限のPages公開(MVP)
3. User Story 2追加 → 自動デプロイに切り替え、検証
4. User Story 3追加 → サブパス配信の健全性を実地確認
5. Polish → READMEの更新、最終確認

---

## Notes

- [P] タスク = 別ファイル・依存なし
- [Story] ラベルはspec.mdのユーザーストーリーとの対応を示す
- 本フィーチャーには新規の`src/`コード追加がないため、通常のモデル/サービス
  層のタスクは存在しない(data-model.md参照)。
- 各タスク完了後にコミットすることを推奨する。
