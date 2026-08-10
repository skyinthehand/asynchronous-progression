# Implementation Plan: 対戦結果入力・対戦台呼び出しフローの強化

**Branch**: `002-match-scoring-and-flow` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-match-scoring-and-flow/spec.md`

## Summary

対戦結果の入力を「勝者ボタン」方式から、両出場者のスコア(0〜3)・DQを
入力して勝者を自動判定する方式へ置き換える(US1)。プールに対戦台の数を
設定でき、対戦カードに対戦台番号を割り当てられるようにする(US2)。
対戦結果の確定直後に、その対戦台へ次に呼ぶべき対戦カードをモーダルで
サジェストし、対戦台番号の任意入力・「進行中」への変更をその場で行える
ようにする。サジェストは変更・スキップでき、トーナメント表示(組合せ図)
上でも次戦候補を確認できるようにする(US3)。「進行中」ステータスは対戦台
割り当てとは独立に、任意で設定できるようにする(US4)。

既存の`001-pool-progression-tracker`の対戦カード/プールのデータモデルを
拡張する形で実装し、新しい外部依存(ライブラリ・startgg APIの新規
呼び出し)は追加しない。既存の「次に進行すべき対戦カード」判定
(`nextCardIndicator.ts`)は、対戦台を考慮した新しい判定ロジックに置き換える。

## Technical Context

**Language/Version**: TypeScript 5.6(strict mode)。001と同一。新規追加なし。

**Primary Dependencies**: 001から変更なし(React 18 + Vite 5、`idb`、`zod`、
`graphql-request`、`vitest` + `@testing-library/react` + `jsdom`)。本feature
のために新しいライブラリは追加しない(モーダルは既存の`components/Modal.tsx`
を再利用する)。

**Storage**: 001と同一(ブラウザIndexedDB、`pool-progression-tracker`
データベース)。既存の`matchCards`・`pools`ストアにフィールドを追加する
(新規ストアは作らない)。

**Testing**: Vitest(ユニット・契約テスト)、Testing Library(結合テスト)。
001で確立された規約(`domain/rules`配下は`makeCard(overrides)`ヘルパーを
使う純粋関数の単体テスト、`features/*`配下は`resetDb`/`acknowledgeNotice`
ヘルパーを使うTesting Library結合テスト)を踏襲する。

**Target Platform**: 001と同一(タブレット/PCブラウザで動くバックエンド
サーバーなしのSPA)。

**Project Type**: Single project(001から変更なし)。

**Performance Goals**: SC-002/SC-004(結果確定操作の削減、モーダル表示は
1秒未満)は全てローカル計算(IndexedDBの読み書きとメモリ内フィルタ処理)で
達成可能であり、追加の性能上の契約は発生しない。

**Constraints**: 対戦台番号は既存のtableNumberフィールドを共有し、start.gg
同期由来の値をローカル入力が上書きされないよう保護する必要がある
(spec.md Clarifications参照。`localOnly`保護に類する仕組みを流用する)。
次戦候補モーダルは、既存の同期不良通知(スナックバー、001 FR-016)の表示を
妨げてはならない(FR-027)。

**Scale/Scope**: 001と同一規模(1プール最大24名程度)。対戦台数は1プール
あたり数台〜十数台を想定し、上限のハードコード制約は設けない。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 型安全性の徹底 | PASS | 新規フィールド・新規関数は全てTypeScript strictで実装し、`any`は使わない。 |
| II. 境界データの型検証 | PASS | MatchCard/Poolへの新規フィールドは既存の`MatchCardSchema`/`PoolSchema`(zod)に追加し、IndexedDBの読み書き境界で引き続き検証する。startgg同期側の新規フィールドは追加しない(既存`tableNumber`を再利用するため)。 |
| III. Lint・Formatterの徹底 | PASS | 既存Biome設定をそのまま使用。追加設定は不要。 |
| IV. コンテナによる再現可能な開発環境 | PASS | 新規ツール・ポートの追加は不要。 |
| V. pre-commit・GitHub ActionsによるCI | PASS(既存ギャップは001で対応中) | 001のFoundationalタスクで整備される前提に乗る。本feature固有の追加対応は不要。 |
| VI. セマンティックバージョニング | PASS | 既存`package.json`を起点にMINOR相当の機能追加として扱う。 |

**Complexity Tracking**: 該当なし。既存アーキテクチャ(domain/rules純粋関数
+ zodスキーマ + features/*コンポーネント)の範囲内で実装可能であり、新しい
抽象化層・新しい依存は導入しない。

## Project Structure

### Documentation (this feature)

```text
specs/002-match-scoring-and-flow/
├── plan.md              # このファイル(/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── match-result-and-table-schema.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - 本コマンドでは作成しない)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── entities/matchCard.ts, pool.ts        # 型の再エクスポート(既存)
│   ├── schemas/matchCard.ts, pool.ts         # zodスキーマにフィールド追加(既存ファイルを変更)
│   └── rules/
│       ├── matchResult.ts                    # [新規] スコア/DQ入力→勝者判定・表示用score文字列の純粋関数
│       ├── tableAssignment.ts                # [新規] 対戦台の占有判定(FR-014)の純粋関数
│       ├── nextMatchSuggestion.ts            # [新規] 対戦台単位の次戦サジェスト計算(既存nextCardIndicator.tsを置き換え)
│       ├── editLock.ts                       # (既存、変更なし想定)
│       └── matchProgression.ts               # (既存、変更なし想定 — advanceWinnerはスコア入力後もwinnerId経由でそのまま動作)
├── features/
│   └── pool-progress/
│       ├── MatchCardEntry.tsx                # [変更] 勝者ボタン→スコア/DQ入力フォームに置き換え(ブラケット表示側)
│       ├── MatchCardRow.tsx                  # [変更] 同上(総当り表側)
│       ├── MatchCardEdit.tsx                 # [変更] 修正フォームもスコア/DQ入力に統一
│       ├── TableCountSettingPanel.tsx        # [新規] プールの対戦台数設定UI(モーダルまたは進行担当者パネルに追加)
│       ├── NextMatchModal.tsx                # [新規] 結果確定直後の次戦候補モーダル(components/Modal.tsxを利用)
│       ├── usePoolProgress.ts                # [変更] recordResult後にモーダル用の次戦候補stateを計算・保持
│       └── nextCardIndicator.ts              # [削除→置換] domain/rules/nextMatchSuggestion.tsに統合
│   └── print/
│       └── BracketPrintLayout.tsx, TablePrintLayout.tsx  # (既存、score表示は互換のため変更なし想定)
│   └── pool-progress/BracketBoard.tsx        # [変更] 次戦候補ハイライトを新しいサジェスト結果に合わせて更新
└── infra/storage/matchCardRepository.ts, poolRepository.ts  # (既存、スキーマ変更に追従するのみ)

tests/
├── unit/domain/rules/
│   ├── matchResult.test.ts                   # [新規]
│   ├── tableAssignment.test.ts                # [新規]
│   └── nextMatchSuggestion.test.ts            # [新規]
└── integration/features/
    ├── match-result-entry.test.tsx            # [新規] スコア/DQ入力の結合テスト
    ├── table-assignment.test.tsx              # [新規]
    └── next-match-modal.test.tsx              # [新規]
```

**Structure Decision**: 001の単一プロジェクト構成をそのまま踏襲する。新規
ロジックは`domain/rules/*`の純粋関数として追加し(既存の`editLock.ts`・
`matchProgression.ts`と同じパターン)、UIは`features/pool-progress/*`に
コンポーネントを追加・変更する。新しいディレクトリ階層やプロジェクト分割は
不要。

## Complexity Tracking

該当なし(Constitution Checkに違反なし)。

## Post-Design Constitution Check

*Phase 1設計(`data-model.md`, `contracts/`, `quickstart.md`)完了後の再評価。*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 型安全性の徹底 | PASS | data-model.mdの新規フィールドは全てTypeScript型として定義済み。`any`なし。 |
| II. 境界データの型検証 | PASS | `contracts/match-result-and-table-schema.md`で、MatchCard/Poolへの追加フィールドのzod検証ルール(範囲・排他条件)を明記。 |
| III. Lint・Formatterの徹底 | PASS | 既存Biome設定の適用範囲に変更なし。 |
| IV. コンテナによる再現可能な開発環境 | PASS | 変更なし。 |
| V. pre-commit・GitHub ActionsによるCI | PASS | 001の整備結果をそのまま利用する設計であり、本feature固有の追加対応は不要。 |
| VI. セマンティックバージョニング | PASS | 設計は既存のバージョニング方針と矛盾しない。 |

新たな逸脱は生じていないため、Complexity Trackingへの追加項目なし。
`/speckit-tasks`に進む準備が整っている。
