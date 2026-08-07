# Implementation Plan: 予選プール進行デジタル管理ツール

**Branch**: `001-pool-progression-tracker` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-pool-progression-tracker/spec.md`

## Summary

会場での予選プール進行(出欠・離席・担当者・対戦結果の記録、次に進めるべき
対戦の明示、予選終了選手への次戦案内)を、紙の進行用紙に代わってデジタルで
行うツール。会場ネットワークの不安定さとstartgg側のアクセス集中エラーを
踏まえ、**バックエンドサーバーを持たないブラウザ単体のSPA(Single Page
Application)** として実装する。全ての入力はブラウザのIndexedDBに永続化され、
オンライン時のみ一定間隔でstartggのGraphQL APIと同期する。startggとの認証は
管理者が自分のPersonal Access Tokenを入力する方式とし、OAuth用のバック
エンド(client_secretの保管場所)を新設しない。注意書きはstartgg側の
`Tournament.rules`をread-onlyで同期して表示し、編集はstartgg側で行う。
印刷レイアウトはstartggの印刷/PDF出力(参考資料: `impact_major_4_brackets.pdf`)
と同一の見た目を再現する。

## Technical Context

**Language/Version**: TypeScript 5.6(strict mode)。ランタイムはNode.js 22
(devcontainer/ビルドツール用)、ブラウザ実行対象はES2022相当をサポートする
モダンブラウザ(Chromium系を主対象)。

**Primary Dependencies**:
- React 18 + Vite 5(SPAのUIフレームワーク・ビルド/開発サーバー)
- `idb`(IndexedDBの薄いPromiseラッパー。永続化層)
- `zod`(startgg GraphQL応答・IndexedDB保存データ・LocalStorage設定値の
  実行時スキーマ検証。Constitution原則II「境界データの型検証」に対応)
- `graphql-request`(startgg GraphQL APIへの軽量クライアント。Apollo等の
  重量級キャッシュ層は導入しない。キャッシュは自前のIndexedDBが担う)
- `vitest` + `@testing-library/react` + `jsdom`(テスト)

**Storage**: ブラウザのIndexedDB(端末ローカル、永続)。サーバー側DBは
持たない。管理者トークン等の機微情報もIndexedDB(または`localStorage`)に
端末内でのみ保持し、外部送信はstartgg APIへのリクエスト時のみ。

**Testing**: Vitest(ユニット・契約テスト)、Testing Library(コンポーネント/
結合テスト)、`quickstart.md`に基づく手動検証シナリオ(実機ブラウザでの
オフライン/クラッシュ復元・印刷レイアウト確認など、自動化が非現実的な項目)。

**Target Platform**: 会場に持ち込むノートPC/タブレット上のモダンブラウザで
動作するインストール不要のWebアプリ(ブラウザタブとして起動)。バックエンド
サーバーなし。startgg GraphQL API (`https://api.start.gg/gql/alpha`) にのみ
外部通信する。

**Project Type**: Single project — フロントエンドのみのSPA(独自バックエンド
API・独自DBサーバーは持たない)。

**Performance Goals**: 出欠・結果入力等の操作はローカル完結のため体感的に
即時反映(UI操作からの反映まで200ms未満を目安)。印刷用ページの描画は数秒
以内。これらはSC-001〜SC-009の達成手段であり、それ自体を追加の契約とは
しない。

**Constraints**: 完全オフラインでも入力操作が継続できること(MUST、FR-012)。
端末強制終了後もデータが100%復元されること(MUST、FR-013/SC-003)。印刷
レイアウトはstartggの印刷/PDF出力と視覚的に一致すること(FR-024)。startgg
APIへの書き込みは、公開されているmutation(`reportBracketSet`等)の範囲内で
行い、存在しないmutation(トーナメント/イベントの自由記述欄の更新等)には
依存しない。

**Scale/Scope**: 1大会あたり最大数十プール。1プールあたり最大24名程度
(参考PDFの規模)。1端末=1プール専任(FR-010)。端末間の同時実行制御は
不要(各端末はstartggに対してのみ独立に同期し、端末同士が直接通信することは
ない)。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 型安全性の徹底 | PASS | TypeScript strict、React+TSX。`any`は原則禁止。 |
| II. 境界データの型検証 | PASS | startgg GraphQL応答・IndexedDB永続化データ・管理者入力(トークン等)をzodスキーマで検証してから利用する(data-model.md参照)。 |
| III. Lint・Formatterの徹底 | PASS(要設定追加) | 既存Biome設定を継続利用。React/JSXを追加するため`tsconfig.json`に`"jsx": "react-jsx"`・`"lib": ["ES2022", "DOM"]`を追加する(Biomeは追加設定なしでJSX/TSXに対応)。 |
| IV. コンテナによる再現可能な開発環境 | PASS(要更新) | `.devcontainer/devcontainer.json`にVite開発サーバー用のポートフォワーディング(既定5173)を追加する。新規ツールの追加は不要(Node.js 22は導入済み)。 |
| V. pre-commit・GitHub ActionsによるCI | GAP(既知、本feature内で解消) | Constitution制定時点で未構築と判明済みのギャップ。本featureのFoundationalタスクとして、pre-commitフック(lint・format・型チェック)とGitHub Actions workflow(同内容+テスト)を新規に整備する。原則違反ではなく、埋めるべき既存ギャップとして扱う。 |
| VI. セマンティックバージョニング | PASS | 既存`package.json`(0.1.0)を起点に、本feature追加はMINORを想定。実際のバージョン更新はリリース判断時に行う。 |

**Complexity Tracking**: 該当なし。上記の技術選定(React+Vite、IndexedDB、
zod、graphql-request、ブラウザネイティブ印刷)はいずれも要件を満たす中で
最小構成であり、正当化が必要な逸脱は生じていない。

## Project Structure

### Documentation (this feature)

```text
specs/001-pool-progression-tracker/
├── plan.md              # このファイル(/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── startgg-graphql-operations.md
│   └── local-storage-schema.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - 本コマンドでは作成しない)
```

### Source Code (repository root)

```text
src/
├── main.tsx                     # エントリポイント(Reactマウント)
├── app/
│   ├── App.tsx                  # アプリシェル・ルーティング・注意書きゲート
│   └── router.tsx
├── features/
│   ├── notice/                  # US1: 注意書きの表示・再確認・警告
│   ├── pool-progress/           # US2, US6: 出欠・離席・担当者・結果入力/修正
│   ├── sync/                    # US3: startgg定期同期・オフライン通知
│   ├── next-match/              # US4: 予選終了選手の次戦案内
│   ├── admin/                   # US5: 認証・初期化・トークン管理・ログアウト
│   └── print/                   # US7: 印刷用ページ
├── domain/
│   ├── entities/                # 予選プール・対戦カード・選手 等の型定義
│   ├── schemas/                 # zodスキーマ(startgg応答・永続化データ共通)
│   └── rules/                   # 結果修正可否判定などのビジネスルール
├── infra/
│   ├── storage/                 # IndexedDBラッパー(idb初期化・CRUD)
│   └── startgg/                 # GraphQLクライアント・クエリ/ミューテーション定義
└── components/                  # 共通UIコンポーネント(startgg準拠の見た目)

tests/
├── unit/                        # domain/rules, infra/storage 等の単体テスト
├── integration/                 # features配下のユーザーストーリー単位の結合テスト
└── contract/                    # startgg GraphQL応答のzodスキーマ整合性テスト
```

**Structure Decision**: 単一プロジェクト構成(Option 1)を採用し、独自
バックエンドを持たないため`backend/`・`api/`は作成しない。機能はユーザー
ストーリー単位(`features/*`)で分割し、各ストーリーが独立して実装・検証
できるようにする(spec.mdのIndependent Testに対応)。`domain/`と`infra/`は
全ストーリー共通の基盤(Foundationalフェーズ)として先に整備する。

## Complexity Tracking

該当なし(Constitution Checkに違反なし)。

## Post-Design Constitution Check

*Phase 1設計(`data-model.md`, `contracts/`, `quickstart.md`)完了後の再評価。*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 型安全性の徹底 | PASS | data-model.mdの全エンティティをTypeScript型として定義し、`any`を用いない設計にしている。 |
| II. 境界データの型検証 | PASS | `contracts/startgg-graphql-operations.md`の全Query/Mutationにzodスキーマ検証を明記。`contracts/local-storage-schema.md`でもIndexedDB読み書き時の検証を明記。 |
| III. Lint・Formatterの徹底 | PASS | 設計上、既存Biome設定の適用範囲を変更しない。 |
| IV. コンテナによる再現可能な開発環境 | PASS(タスク化) | devcontainer更新はPhase 2(`/speckit-tasks`)のFoundationalタスクとして計上する。 |
| V. pre-commit・GitHub ActionsによるCI | PASS(タスク化) | quickstart.mdの品質ゲートをpre-commit/CIに組み込む旨を明記。実際の整備はPhase 2タスクで行う。 |
| VI. セマンティックバージョニング | PASS | 設計は既存`package.json`のバージョニング方針と矛盾しない。 |

新たな逸脱は生じていないため、Complexity Trackingへの追加項目なし。
`/speckit-tasks`に進む準備が整っている。
