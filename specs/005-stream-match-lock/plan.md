# Implementation Plan: 配信台設定された対戦の編集ロック

**Branch**: `005-stream-match-lock` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-stream-match-lock/spec.md`

## Summary

start.gg上で配信(ストリーム)が割り当てられている対戦カードについて、
このツール上での新規編集(進行中への変更・対戦台の割り当て・結果確定)を
一切できないようにし、start.gg側からの同期のみを待つ状態にする。判定は
定期同期のたびに取得する読み取り専用フラグ(`MatchCard.isStreamed`)で
行い、既存の2種類のロック機構(`isLocked`=修正ロック、`isPreviewMode`=
ブラケット未開始ロック)とは独立した、対戦カード単位の3つ目のロック
条件として実装する。次戦候補(`computeNextMatchSuggestions`)の対象からも
除外する。表示自体は非表示にせず、配信中であることを示す表示を付けた
うえで一覧・組合せ図に残す。

## Technical Context

**Language/Version**: TypeScript 5.6(strict mode)。001〜004と同一。新規追加なし。

**Primary Dependencies**: 001〜004から変更なし(React 18 + Vite 5、`idb`、
`zod`、`graphql-request`、`vitest` + `@testing-library/react` + `jsdom`)。
本featureのために新しいライブラリは追加しない。

**Storage**: 001〜004と同一(ブラウザIndexedDB)。`matchCards`ストアに
読み取り専用フィールド`isStreamed`を1つ追加する(`DB_VERSION`は据え置き、
`.default(false)`による後方互換、contracts/stream-field-schema.md参照)。

**Testing**: Vitest(ユニット・契約テスト)、Testing Library(結合テスト)。
既存の規約(`domain/rules`配下は`makeCard(overrides)`ヘルパーを使う純粋
関数の単体テスト、`tests/contract/startgg-operations.test.ts`でのAPI
マッピングの契約テスト)をそのまま踏襲する。

**Target Platform**: 001〜004と同一(タブレット/PCブラウザで動くバック
エンドサーバーなしのSPA)。

**Project Type**: Single project(001〜004から変更なし)。

**Performance Goals**: 追加の判定は対戦カード1件あたり真偽値の参照のみ
(O(1))であり、既存の次戦候補計算・組合せ図の詰め直し(いずれも
O(対戦カード数))に対して無視できるオーバーヘッドしか生まない。追加の
性能上の契約は発生しない。

**Constraints**: 既存のstart.gg同期基盤(`fetchPoolDetail`・
`mergeMatchCard`)・組合せ図表示(`bracketLayout.ts`)・次戦候補計算
(`nextMatchSuggestion.ts`)の既存の出力形式・呼び出しシグネチャは変更
しない(それらに依存する既存機能への影響を避けるため)。start.gg側の
正確なスキーマ(配信フィールド名)は未検証のため、実装後に実機確認が
必要(research.md #1参照)。

**Scale/Scope**: 001と同一規模(1プール最大24名程度)。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 型安全性の徹底 | PASS | 新規フィールド・関数は全てTypeScript strictで実装し、`any`は使わない。 |
| II. 境界データの型検証 | PASS | start.ggから新たに取得するフィールド(配信情報)は`SetNodeSchema`(zod)に追加して検証する(contracts/stream-field-schema.md)。 |
| III. Lint・Formatterの徹底 | PASS | 既存Biome設定をそのまま使用。追加設定は不要。 |
| IV. コンテナによる再現可能な開発環境 | PASS | 新規ツール・ポートの追加は不要。 |
| V. pre-commit・GitHub ActionsによるCI | PASS | 既存の仕組みをそのまま利用する。本feature固有の追加対応は不要。 |
| VI. セマンティックバージョニング | PASS | 既存の対戦カード編集フローに新しい制約を追加する後方互換な機能追加であり、MINOR相当として扱う。 |

**Complexity Tracking**: 該当なし。既存アーキテクチャ(`domain/rules`
純粋関数 + `infra/startgg`のスキーマ検証 + `features/pool-progress`の
UI層)の範囲内で実装可能であり、新しい抽象化層・新しい依存は導入しない。

## Project Structure

### Documentation (this feature)

```text
specs/005-stream-match-lock/
├── plan.md              # このファイル(/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── stream-field-schema.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── schemas/matchCard.ts               # [変更] isStreamedフィールド追加
│   └── rules/
│       ├── streamLock.ts                  # [新規] isStreamLocked(card)純粋関数
│       └── nextMatchSuggestion.ts         # [変更] isEligibleに!card.isStreamedを追加
├── infra/
│   └── startgg/
│       └── operations.ts                  # [変更] POOL_DETAIL_QUERY/SetNodeSchemaに配信フィールド追加、fetchPoolDetailでisStreamedへマッピング
├── features/
│   ├── sync/
│   │   └── syncRunner.ts                  # 変更なし(mergeMatchCardは isStreamed を明示的に保護しないため、remote優先の既存挙動がそのまま適用される)
│   └── pool-progress/
│       ├── usePoolProgress.ts             # [変更] recordResult/assignTable/callSuggestedMatch/setInProgressの冒頭にisStreamed対象カードの早期returnを追加
│       ├── MatchCardEntry.tsx             # [変更] canEditにisStreamLocked(card)を追加、配信中バッジ表示
│       └── MatchCardRow.tsx               # [変更] isEditableにisStreamLocked(card)を追加、配信中バッジ表示

tests/
├── contract/
│   └── startgg-operations.test.ts         # [変更] 配信フィールドのマッピングのテストケース追加
├── unit/domain/rules/
│   ├── streamLock.test.ts                 # [新規]
│   └── nextMatchSuggestion.test.ts        # [変更] 配信中カードの除外のテストケース追加
└── integration/features/
    └── stream-lock.test.tsx               # [新規] 配信中カードの編集不可・バッジ表示・次戦候補除外・同期での解除をUIレベルで検証
```

**Structure Decision**: 001〜004の単一プロジェクト構成をそのまま踏襲する。
配信ロックの判定自体は`domain/rules/streamLock.ts`という新しい純粋関数
(現時点では`card.isStreamed`をそのまま返すだけの薄いラッパーだが、
`isPreviewSetId`・`isEntrantAway`等、既存の「状態判定を専用の名前付き
関数に切り出す」設計方針に合わせ、将来判定条件が変わってもUI層・
`nextMatchSuggestion.ts`側を変更せずに済むようにする)に切り出し、UI層
(`MatchCardEntry.tsx`/`MatchCardRow.tsx`)・`usePoolProgress.ts`・
`nextMatchSuggestion.ts`のそれぞれから呼び出す。`isPreviewMode`のような
プール全体に及ぶ`readOnly` propとは別に、対戦カード単位の判定として
`canEdit`/`isEditable`の算出に組み込む。

## Complexity Tracking

該当なし(Constitution Checkに違反なし)。

## Post-Design Constitution Check

*Phase 1設計(`data-model.md`, `contracts/`, `quickstart.md`)完了後の再評価。*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 型安全性の徹底 | PASS | data-model.md・contracts/で定義した型は全てTypeScript strictで表現可能。`any`なし。 |
| II. 境界データの型検証 | PASS | 新規の外部入力(start.ggの配信フィールド)は`SetNodeSchema`拡張で検証する契約を明記した。 |
| III. Lint・Formatterの徹底 | PASS | 既存Biome設定の適用範囲に変更なし。 |
| IV. コンテナによる再現可能な開発環境 | PASS | 変更なし。 |
| V. pre-commit・GitHub ActionsによるCI | PASS | 変更なし。 |
| VI. セマンティックバージョニング | PASS | 設計は既存のバージョニング方針と矛盾しない。 |

新たな逸脱は生じていないため、Complexity Trackingへの追加項目なし。
`/speckit-tasks`に進む準備が整っている。ただし、research.md #1で
明記した「start.gg側の配信フィールドの正確な形は未検証」という前提は、
実装(`/speckit-implement`)時に実機確認を行うまで残るリスクとして
引き継ぐ。
