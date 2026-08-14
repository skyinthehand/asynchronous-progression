# Phase 1 Data Model: GitHub Pages Deploy

本フィーチャーは、新規のデータエンティティを一切導入しない。

対象はCI/CD設定(GitHub Actions workflow・ビルド設定・テスト実行コマンド)
のみであり、アプリケーションのランタイムデータモデル(`Pool`・`MatchCard`・
`Entrant`・`SyncStatus`・`Notice`等、`specs/001-pool-progression-tracker/
data-model.md`で定義済みのエンティティ群)には一切変更を加えない。

IndexedDBのスキーマ・start.gg同期の対象データ・保存先のいずれも、公開先が
ローカル開発サーバーからGitHub Pagesに変わることによる影響は受けない
(ブラウザのIndexedDBはオリジン単位で分離されるが、この挙動自体は既存の
アーキテクチャがどのオリジンで動いても同じであり、本フィーチャー固有の
考慮事項ではない)。
