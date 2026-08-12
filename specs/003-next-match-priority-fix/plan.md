# Implementation Plan: 次戦サジェストの優先順位修正

**Branch**: `003-next-match-priority-fix` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-next-match-priority-fix/spec.md`

## Summary

`computeNextMatchSuggestions`(`src/domain/rules/nextMatchSuggestion.ts`)の
候補選定・優先順位ロジックを修正する。(1) 出場者が両方確定していない対戦
(不戦勝(BYE)を含む)を候補から除外し、(2) 勝敗ブラケット形式のプールでは
「プール抜けを決定づける対戦(各側の最終ラウンド)」からの距離(遠さ)が
大きい対戦を優先し、(3) 距離が同じなら敗者側を優先し、(4) さらに同じなら
組合せ図上の表示順(上にあるものを優先)で並べる。総当り形式・対戦台数
不足時の挙動は変更しない。既存の対戦カードデータ(`entrant1SourceMatchId`/
`entrant2SourceMatchId`による前後関係、`bracketLayout.ts`が計算する表示順)
から動的に算出し、新しい永続データは追加しない。

## Technical Context

**Language/Version**: TypeScript 5.6(strict mode)。001/002と同一。新規追加なし。

**Primary Dependencies**: 001/002から変更なし(React 18 + Vite 5、`idb`、
`zod`、`graphql-request`、`vitest` + `@testing-library/react` + `jsdom`)。
本featureのために新しいライブラリは追加しない。

**Storage**: 001/002と同一(ブラウザIndexedDB)。本featureは既存の
`matchCards`ストアのフィールドを一切変更しない(新しい永続データを持たない
純粋な計算ロジックの修正のため)。

**Testing**: Vitest(ユニット・契約テスト)、Testing Library(結合テスト)。
001/002で確立された規約(`domain/rules`配下は`makeCard(overrides)`ヘルパーを
使う純粋関数の単体テスト)をそのまま踏襲する。

**Target Platform**: 001/002と同一(タブレット/PCブラウザで動くバックエンド
サーバーなしのSPA)。

**Project Type**: Single project(001/002から変更なし)。

**Performance Goals**: 対戦カード一覧を都度なめてBFS(幅優先探索)で距離を
算出する処理はO(対戦カード数)で、1プール最大24名程度(001のScale/Scope)の
規模では体感的に即時。追加の性能上の契約は発生しない。

**Constraints**: 既存の`bracketLayout.ts`(組合せ図の表示順計算)・
`matchProgression.ts`(勝者・敗者の進出反映)のロジック・出力形式は変更しない
(それらに依存する既存機能(組合せ図表示・結果反映)への影響を避けるため)。

**Scale/Scope**: 001と同一規模(1プール最大24名程度)。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 型安全性の徹底 | PASS | 新規関数は全てTypeScript strictで実装し、`any`は使わない。 |
| II. 境界データの型検証 | PASS | 新しい永続データ・外部入力を追加しないため、新規のスキーマ検証は不要。既存の`MatchCardSchema`をそのまま使う。 |
| III. Lint・Formatterの徹底 | PASS | 既存Biome設定をそのまま使用。追加設定は不要。 |
| IV. コンテナによる再現可能な開発環境 | PASS | 新規ツール・ポートの追加は不要。 |
| V. pre-commit・GitHub ActionsによるCI | PASS | 既存の仕組みをそのまま利用する。本feature固有の追加対応は不要。 |
| VI. セマンティックバージョニング | PASS | 既存`package.json`を起点にPATCH相当のバグ修正として扱う(既存の次戦サジェスト機能の判定ロジック修正であり、後方互換性のある機能追加ではないため)。 |

**Complexity Tracking**: 該当なし。既存アーキテクチャ(`domain/rules`純粋関数)
の範囲内で実装可能であり、新しい抽象化層・新しい依存は導入しない。

## Project Structure

### Documentation (this feature)

```text
specs/003-next-match-priority-fix/
├── plan.md              # このファイル(/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md
```

**contracts/ を作成しない理由**: 本featureは新しい永続データ(IndexedDB
スキーマ)・外部インターフェースを一切追加せず、既存の`domain/rules`内の
純粋関数の判定ロジックのみを修正する。001/002の`contracts/`はIndexedDBの
スキーマ拡張を文書化するものだったが、本featureはスキーマを拡張しないため
対象となる契約が存在しない。

### Source Code (repository root)

```text
src/
├── domain/
│   ├── entities/matchCard.ts, pool.ts        # 変更なし(既存の再エクスポート)
│   ├── schemas/matchCard.ts, pool.ts         # 変更なし(新規フィールド無し)
│   └── rules/
│       ├── matchDistance.ts                  # [新規] 対戦カードの「プール抜けからの遠さ」を算出する純粋関数
│       ├── nextMatchSuggestion.ts             # [変更] 候補の除外条件・優先順位比較をmatchDistance.ts/bracketLayout.tsの結果で置き換える
│       ├── bracketLayout.ts                   # (既存、変更なし想定 — computeBracketLayoutのslotを表示順の判定に再利用するのみ)
│       ├── tableAssignment.ts                 # (既存、変更なし想定 — isTableOccupiedはそのまま利用)
│       └── matchProgression.ts                # (既存、変更なし想定)
└── features/
    └── pool-progress/                         # UI層(MatchCardList.tsx等)は
                                                # computeNextMatchSuggestionsの
                                                # 呼び出しシグネチャが変わらない
                                                # ため変更不要(コード変更なし)

tests/
├── unit/domain/rules/
│   ├── matchDistance.test.ts                  # [新規]
│   └── nextMatchSuggestion.test.ts             # [変更] 除外条件・優先順位のテストケースを全面的に書き換え
```

**Structure Decision**: 001/002の単一プロジェクト構成をそのまま踏襲する。
`computeNextMatchSuggestions`の外部シグネチャ(`matchCards`, `tableNumbers`を
受け取り`NextMatchSuggestion[]`を返す)は変更しないため、これを呼び出す
UI層(`usePoolProgress.ts`, `MatchCardList.tsx`, `BracketBoard.tsx`,
`MatchTable.tsx`)には一切変更が不要。新しい「遠さ」計算だけを独立した純粋
関数(`matchDistance.ts`)に切り出し、`nextMatchSuggestion.ts`から呼び出す
形にすることで、既存の`domain/rules`の設計方針(単一責務の純粋関数 +
`tests/unit/domain/rules/`でのユニットテスト)を維持する。

## Complexity Tracking

該当なし(Constitution Checkに違反なし)。

## Post-Design Constitution Check

*Phase 1設計(`data-model.md`, `quickstart.md`)完了後の再評価。*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 型安全性の徹底 | PASS | data-model.mdで定義する型は全てTypeScript strictで表現可能。`any`なし。 |
| II. 境界データの型検証 | PASS | 新規の永続フィールド・外部入力なし。既存スキーマへの変更なし。 |
| III. Lint・Formatterの徹底 | PASS | 既存Biome設定の適用範囲に変更なし。 |
| IV. コンテナによる再現可能な開発環境 | PASS | 変更なし。 |
| V. pre-commit・GitHub ActionsによるCI | PASS | 変更なし。 |
| VI. セマンティックバージョニング | PASS | 設計は既存のバージョニング方針と矛盾しない。 |

新たな逸脱は生じていないため、Complexity Trackingへの追加項目なし。
`/speckit-tasks`に進む準備が整っている。
