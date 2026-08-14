# Implementation Plan: GitHub Pages Deploy

**Branch**: `004-github-pages-deploy` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-github-pages-deploy/spec.md`

## Summary

このアプリはバックエンドサーバーを持たないクライアント完結型SPA(Vite
ビルドの静的成果物のみ)であるため、`dist/`をそのまま静的ホスティングへ
公開すれば動作する。既存の`.github/workflows/ci.yml`(lint・型チェック・
テストの品質ゲート)にビルド・公開ジョブを追加し、mainブランチへの変更が
品質ゲート通過後に自動でGitHub Pagesへ反映されるようにする。GitHub Pages
はプロジェクトページ(`https://skyinthehand.github.io/asynchronous-progression/`)
としての配信になるため、Viteのbase pathをデプロイ時のみサブパスに切り替える
対応が必要(User Story 3)。あわせて、既存テストスイートに実機で確認済みの
並列実行起因のflakinessがあるため、CI用のテスト実行方法を固定化し
品質ゲートの信頼性を確保する。

## Technical Context

**Language/Version**: 既存踏襲。TypeScript 5.6(strict mode)/ Node.js 22
(既存`.github/workflows/ci.yml`の`setup-node`設定と一致)。本フィーチャーの
変更自体はGitHub Actions workflow(YAML)が中心。

**Primary Dependencies**: GitHub公式のPagesデプロイ用Action一式
(`actions/checkout`, `actions/setup-node`, `actions/configure-pages`,
`actions/upload-pages-artifact`, `actions/deploy-pages`)。アプリ側の依存
ライブラリの追加・変更はなし(既存のVite 5ビルド設定を利用)。

**Storage**: 対象外。既存のIndexedDB永続化・start.gg同期の挙動に変更なし。

**Testing**: 既存のVitestスイート(`npm test`)を品質ゲートとしてそのまま
利用する。実機検証の結果判明した、ファイル並列実行時のflakiness
(`vitest run`のデフォルト並列実行で、無関係なテストファイルが環境負荷に
より断続的に失敗することを本リポジトリで複数回確認済み。
`--no-file-parallelism`指定時は安定して全件成功)を踏まえ、品質ゲートで
使うテスト実行コマンドをこのオプション付きに固定する。

**Target Platform**: GitHub Pages(静的サイトホスティング)+ GitHub Actions
(`ubuntu-latest`ランナー)。ブラウザ実行対象は既存と同じ(Chromium系
モダンブラウザ)。

**Project Type**: 既存の単一プロジェクト構成(フロントエンドのみのSPA)は
不変。本フィーチャーはCI/CD設定の追加のみで、`src/`配下のアプリケーション
構造には変更を加えない。

**Performance Goals**: SC-001(公開URLアクセスから通常操作可能な画面表示
までが一般的なWebページと同程度)、SC-002(mainマージから公開反映まで
10分以内)。

**Constraints**: リポジトリはpublicのまま維持(FR-006、確認済み)。独自
ドメインは使用しない(FR-007)。GitHub Pagesのプロジェクトページ配信
(サブパス)でも全アセットが正しく読み込まれること(FR-005/User Story 3)。
既存のローカル開発フロー(`npm run dev`/`npm run build`/`npm run preview`)
の挙動を壊さないこと。

**Scale/Scope**: 静的サイト1つ、GitHub Actions workflowへのジョブ追加1件、
`vite.config.ts`・`package.json`への小規模な変更のみ。新規の`src/`コード
追加はなし。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 型安全性の徹底 | PASS(対象外) | 本フィーチャーはアプリケーションコード(TS)を変更しない。`vite.config.ts`の変更のみ既存のTS strict設定下で行う。 |
| II. 境界データの型検証 | PASS(対象外) | 新たな外部データ境界を導入しない。start.gg APIアクセスパターンは不変。 |
| III. Lint・Formatterの徹底 | PASS | 変更対象の`vite.config.ts`・`package.json`はBiomeの対象(既存設定のまま)。追加するGitHub Actions workflow(YAML)はBiomeの対象範囲外だが、既存の`ci.yml`も同様であり新たな逸脱ではない。 |
| IV. コンテナによる再現可能な開発環境 | PASS | デプロイはGitHub-hostedランナー上で完結し、devcontainerの構成変更は不要。ローカル開発コマンド(`npm run dev`等)の挙動も変更しない。 |
| V. pre-commit・GitHub ActionsによるCI | PASS(強化) | 既存の`ci.yml`(品質ゲート)にジョブを追加する形で拡張し、品質ゲート通過を公開の前提条件にする(FR-004)。あわせて既知のテストflakinessを解消し、CIの信頼性そのものを向上させる。 |
| VI. セマンティックバージョニング | PASS(対象外) | 本ツールは継続的デプロイ対象の内部ツールであり、外部の依存先がSemVerに基づき`package.json`のバージョンを参照する運用ではない。デプロイのたびにバージョンを更新する必要はない。 |

**Complexity Tracking**: 該当なし。GitHub公式のPages用Action一式を利用する
最小構成であり、正当化が必要な逸脱は生じていない。

## Project Structure

### Documentation (this feature)

```text
specs/004-github-pages-deploy/
├── plan.md              # このファイル(/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command) — 新規データエンティティなしを明記
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - 本コマンドでは作成しない)
```

`contracts/`は作成しない(下記Structure Decision参照)。

### Source Code (repository root)

```text
.github/workflows/
└── ci.yml                # 既存の品質ゲートジョブ(quality-gate)に、
                           # mainブランチへのpush時のみ実行するdeployジョブを
                           # 追加(quality-gateへのneeds依存で、品質ゲート
                           # 通過を公開の前提条件にする)

vite.config.ts             # base pathを、デプロイ時のみ環境変数経由で
                            # GitHub Pagesのプロジェクトページ用サブパス
                            # (/asynchronous-progression/)に切り替えられる
                            # ようにする(ローカル開発時の既定値は現状通り "/")

package.json                # "test"スクリプトを、品質ゲート(ローカル/CI共通)
                            # として`vitest run --no-file-parallelism`に固定
```

**Structure Decision**: 単一プロジェクト構成は不変。本フィーチャーは`src/`
配下のアプリケーションコードを変更せず、CI/CD設定(GitHub Actions
workflow・ビルド設定・テスト実行コマンド)の追加・調整のみで完結する。
このツールは外部に公開するAPI・ライブラリインターフェースを持たない
(ユーザー向けの画面のみ)ため、`contracts/`ディレクトリは作成しない
(Phase 1手順の「Skip if project is purely internal」に該当)。運用手順
(有効化の一次設定・検証手順)はquickstart.mdに記載する。

## Complexity Tracking

該当なし。

## Post-Design Constitution Check

*Phase 1設計(`data-model.md`, `quickstart.md`)完了後の再評価。*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 型安全性の徹底 | PASS(対象外) | data-model.mdの通り新規データエンティティなし。`vite.config.ts`の変更のみ既存のTS strict設定下で行う。 |
| II. 境界データの型検証 | PASS(対象外) | 新たな外部データ境界を導入しない。 |
| III. Lint・Formatterの徹底 | PASS | 変更対象はBiome適用範囲内(`vite.config.ts`/`package.json`)。 |
| IV. コンテナによる再現可能な開発環境 | PASS | quickstart.mdの手順もローカル(devcontainer)で完結するコマンド(`npm run lint`等)のみで構成されている。 |
| V. pre-commit・GitHub ActionsによるCI | PASS(強化) | research.md #2/#4の設計により、品質ゲート通過が公開の前提条件になり、かつゲート自体の信頼性(flakiness解消)も向上する。 |
| VI. セマンティックバージョニング | PASS(対象外) | 設計は既存`package.json`のバージョニング方針と矛盾しない。 |

新たな逸脱は生じていないため、Complexity Trackingへの追加項目なし。
`/speckit-tasks`に進む準備が整っている。
