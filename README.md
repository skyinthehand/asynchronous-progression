# asynchronous-progression

スマブラ大会などの現地で、予選プールの進行(出欠・離席・進行担当者・
対戦結果の記録)を紙の進行用紙の代わりにデジタルで行うためのツールです。
会場ネットワークが不安定な状況でも、入力はすべて端末内に保存され、
オンライン時に一定間隔でstartggへ自動反映されます。

**公開URL**: <https://skyinthehand.github.io/asynchronous-progression/>
(GitHub Pagesで公開。mainブランチへの変更は、品質ゲート(lint・型
チェック・テスト)通過後に自動的に反映されます。詳細は
[`specs/004-github-pages-deploy/`](specs/004-github-pages-deploy/)参照)

詳細な仕様・設計は [`specs/001-pool-progression-tracker/`](specs/001-pool-progression-tracker/)
を参照してください([spec.md](specs/001-pool-progression-tracker/spec.md) /
[plan.md](specs/001-pool-progression-tracker/plan.md) /
[tasks.md](specs/001-pool-progression-tracker/tasks.md))。

## 技術スタック

- TypeScript(strict) + React 18 + Vite 5
- ブラウザIndexedDB(`idb`)によるローカル永続化。バックエンドサーバーなし
- startgg GraphQL APIとの連携(`graphql-request`、Personal Access Token認証)
- 実行時スキーマ検証: `zod`
- テスト: Vitest + Testing Library
- Lint/Format: Biome

## セットアップ

devcontainer(`.devcontainer/devcontainer.json`)を使うと、Node.js・git・tig
などの開発環境が自動的に整います。

```bash
npm install
```

## 開発

```bash
npm run dev       # Vite開発サーバーを起動(既定ポート 5173)
npm run lint       # Biomeによる静的解析
npm run format      # Biomeによるフォーマット
npm run build       # 型チェック + 本番ビルド
npm test         # Vitestによるテスト実行
```

## 利用の流れ

1. アプリを開くと、まず注意書きが表示されます(内容を確認するまで他の
   操作はできません)。
2. 管理画面(パスワード認証)で、startgg Personal Access Tokenを入力し、
   対象のトーナメント/イベント/フェーズ/プールを選択して初期化します。
3. 一般モードで、担当プールの出欠・離席・対戦結果を入力します。
   入力内容は常に端末内に保存され、オンライン時に自動的にstartggへ反映
   されます。
4. 印刷用ページから、startggの印刷/PDF出力に準じたレイアウトで出力できます。

詳しい検証手順は [`quickstart.md`](specs/001-pool-progression-tracker/quickstart.md)
を参照してください。

## プロジェクトの方針

このリポジトリの開発方針は [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
にまとめられています(型安全性、境界データの型検証、Lint/Formatter、
コンテナによる再現可能な開発環境、CI、セマンティックバージョニング、
コード以外の基本言語は日本語)。
