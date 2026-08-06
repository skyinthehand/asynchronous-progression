<!--
Sync Impact Report
- Version change: なし (テンプレート) → 1.0.0
- 初回制定。全プレースホルダーを具体的な内容に置換。
- 追加された原則:
  - I. 型安全性の徹底
  - II. 境界データの型検証
  - III. Lint・Formatterの徹底
  - IV. コンテナによる再現可能な開発環境
  - V. pre-commit・GitHub ActionsによるCI
  - VI. セマンティックバージョニング
- 追加されたセクション:
  - 言語ポリシー (コード以外の基本使用言語は日本語)
  - 開発ワークフロー
- 削除されたセクション: なし
- テンプレートの整合性確認:
  - ✅ .specify/templates/plan-template.md (Constitution Checkは動的参照のため変更不要)
  - ✅ .specify/templates/spec-template.md (原則と矛盾なし、変更不要)
  - ✅ .specify/templates/tasks-template.md (原則と矛盾なし、変更不要)
  - ✅ .claude/skills/speckit-*/SKILL.md (エージェント固有名の汚染なし)
  - ⚠ README.md (プロジェクト概要が未記載。手動での追記を推奨)
  - ⚠ pre-commitフック / GitHub Actionsワークフロー (未構築。原則Vに基づき別途実装が必要)
- 保留事項 (TODO): なし
-->

# asynchronous-progression Constitution

## Core Principles

### I. 型安全性の徹底

全てのコードはTypeScriptで記述しなければならない (MUST)。`tsconfig.json`は
`strict: true`を含む厳格モードを維持しなければならない。`any`型の使用は原則禁止とし、
やむを得ず使用する場合はその理由をコード上に明示しなければならない。型エラーが
存在する状態のコードをmainブランチにマージしてはならない (MUST NOT)。

**Rationale**: 型システムを最大限に活用することで実行時エラーを削減し、
リファクタリングやレビューの安全性を担保する。

### II. 境界データの型検証

外部入力(HTTPリクエスト、環境変数、設定ファイル、外部APIレスポンスなど)を
受け取る箇所では、TypeScriptの静的型のみに依存せず、実行時のスキーマ検証を
行わなければならない (MUST)。静的型とスキーマ定義は可能な限り単一のソースから
導出し、二重管理を避けなければならない (SHOULD NOT duplicate definitions)。

**Rationale**: TypeScriptの型情報は実行時には消去されるため、プロセス境界を
越えるデータの安全性は静的型だけでは保証できない。

### III. Lint・Formatterの徹底

全てのコードはBiome (`npm run lint` / `npm run format`) による静的解析と
フォーマットの対象としなければならない (MUST)。lintエラーまたはフォーマット崩れが
残った状態でのコミットおよびマージを禁止する (MUST NOT)。

**Rationale**: 一貫したコードスタイルと静的解析による早期のバグ検出が、
チーム開発における品質とレビュー効率を支える。

### IV. コンテナによる再現可能な開発環境

開発は`.devcontainer`で定義された環境を正 (single source of truth) としなければ
ならない (MUST)。開発に必要なツール(git, tig, Node.js, npm等)の追加・変更は
`.devcontainer/devcontainer.json`に反映し、誰でも同一の手順で同一の環境を
再現できる状態を維持しなければならない。ローカル環境固有の設定・手順に
依存する変更を導入してはならない (MUST NOT)。

**Rationale**: 「自分の環境では動く」問題を排除し、全ての開発者・CIが
同一条件でコードを検証できるようにするため。

### V. pre-commit・GitHub ActionsによるCI

コミット前にpre-commitフックでlint・format・型チェックを自動実行しなければ
ならない (MUST)。GitHub Actions上でも同等のチェック(lint, format, 型チェック/ビルド、
テスト)を実行し、全てのチェックが通過しない変更をmainブランチにマージしては
ならない (MUST NOT)。

**Rationale**: ローカルとCIの二重のゲートにより、品質基準を満たさないコードの
混入を機械的に防ぐ。

### VI. セマンティックバージョニング

バージョン番号は`MAJOR.MINOR.PATCH`のSemVer形式に従わなければならない (MUST)。
後方互換性のない変更はMAJOR、後方互換な機能追加はMINOR、後方互換な修正は
PATCHとしてバージョンを更新しなければならない。

**Rationale**: 利用者・依存先が変更の影響範囲(破壊的変更か否か)を
バージョン番号のみから予測可能にするため。

## 言語ポリシー

コード(識別子、および技術的必然性のあるコードコメントを除く)以外、すなわち
コミットメッセージ、プルリクエストの説明、Issue、ドキュメント、本Constitution等の
基本使用言語は日本語とする (MUST)。ただし、OSSとしての公開やツール・外部連携先の
制約により英語が必要な場合はこの限りではない。

## 開発ワークフロー

全てのプルリクエストは、マージ前にpre-commitフックおよびGitHub Actionsの
全チェック(原則V)を通過しなければならない (MUST)。コードレビューでは、
本Constitutionの各原則(型安全性、境界データの型検証、lint/format、
コンテナ環境の一貫性、バージョニング)への準拠を確認しなければならない。
原則からの逸脱を含む変更は、逸脱の理由と代替案の検討結果を明示しない限り
承認してはならない (MUST NOT)。

## Governance

本Constitutionはプロジェクト内の他の慣習・ドキュメントに優先する。本文書との
矛盾が判明した場合は、矛盾する慣習・ドキュメントを本Constitutionに合わせて
是正しなければならない。

改定はプルリクエストとして提案し、少なくとも1名のレビュー承認を得て取り込む
(MUST)。改定の種別(原則の削除・再定義はMAJOR、原則・セクションの追加はMINOR、
文言の明確化等はPATCH)に応じて`CONSTITUTION_VERSION`をセマンティック
バージョニングに従い更新しなければならない。

全てのプルリクエストレビューにおいて本Constitutionへの準拠を確認しなければ
ならない (MUST)。複雑さの導入(新たな依存、抽象化、例外的な設定等)は
その必要性を明示的に正当化しなければならない。

**Version**: 1.0.0 | **Ratified**: 2026-08-06 | **Last Amended**: 2026-08-06
