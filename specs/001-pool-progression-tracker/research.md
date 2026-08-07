# Phase 0 Research: 予選プール進行デジタル管理ツール

各項目は Decision / Rationale / Alternatives considered の形式でまとめる。

## 1. フロントエンドフレームワーク・ビルドツール

- **Decision**: React 18 + Vite 5
- **Rationale**: リポジトリは現状フレームワーク未選定のTypeScript
  スケルトン(`src/index.ts`のみ)。オフライン耐性のあるSPA、印刷用の別
  レイアウト、フォーム主体の複雑なUI(出欠・離席・結果入力・管理画面)を
  要件が求めており、コンポーネント指向フレームワークが適する。Viteは
  開発サーバー起動が速く、devcontainer内での開発体験がよい。
- **Alternatives considered**: Vue(チーム内実績が確認できないため見送り)、
  フレームワークなしのVanilla TS(状態管理・フォームが複雑になり過ぎる)、
  Next.js等のSSRフレームワーク(バックエンドサーバーを持たない方針=SSR不要
  のため過剰)。

## 2. ローカル永続化

- **Decision**: ブラウザIndexedDB + `idb`ライブラリ
- **Rationale**: FR-013(端末強制終了後もデータ復元)を満たすには
  `localStorage`より大容量・非同期・構造化データに強いIndexedDBが適する。
  `idb`はIndexedDBの生APIをPromiseベースにする薄いラッパーで、追加の
  ランタイム挙動(独自キャッシュ層等)を持ち込まない。
- **Alternatives considered**: `localStorage`(容量・同期API・構造化データの
  扱いに難があり不採用)、サーバー側DB(バックエンドを持たない方針のため
  不採用)。

## 3. 実行時スキーマ検証

- **Decision**: `zod`
- **Rationale**: Constitution原則II「境界データの型検証」により、startgg
  GraphQL応答・IndexedDB永続化データ・管理者入力(トークン等)は実行時検証が
  必須。zodはTypeScriptの型をスキーマから導出でき、静的型とスキーマの
  二重管理を避けられる(原則IIの「SHOULD NOT duplicate definitions」に合致)。
- **Alternatives considered**: 手書きの型ガード関数(保守性が低く原則IIの
  意図に反する)、`io-ts`(zodよりAPIが冗長)。

## 4. startgg API連携方式

- **Decision**: `graphql-request`による直接GraphQL呼び出し + zodによる
  応答検証。Apollo Client等の重量キャッシュ層は導入しない。
- **Rationale**: 本ツールの「キャッシュ」の実体はIndexedDBであり、Apollo等の
  インメモリキャッシュは重複・競合の原因になる。`graphql-request`は
  依存が小さく、fetchベースでオフライン時のエラーハンドリングも単純に
  書ける。
- **Alternatives considered**: Apollo Client(キャッシュ層が要件と衝突し
  過剰)、生`fetch`直書き(型定義・エラーハンドリングの重複コードが増える)。

## 5. startgg認証方式

- **Decision**: startgg **Personal Access Token(PAT)** のみを用いる。
  OAuth2認可コードフローは採用しない。
- **Rationale**: start.gg公式ドキュメント([OAuth Overview][oauth-overview])
  によれば、OAuth2の認可コードフローはトークン交換時に`client_secret`を
  サーバーサイドで送信することが前提とされており、PKCE等の公開クライアント
  (ブラウザ単体)向け方式は用意されていない。一方、[Authentication][auth-docs]
  ページにあるPersonal Access Tokenは、ユーザーが自分のアカウント設定画面で
  発行し、`Authorization: Bearer <token>`ヘッダーで使うだけの単純な方式で、
  サーバー不要。さらに[Update Phase Seeding][update-phase-seeding]の記載
  「You will need an API auth token belonging to a user who has admin
  permissions for your tournament」から、PATは発行者本人のアカウント権限を
  そのまま引き継ぐことが確認できる。したがって「管理権限のある大会の一覧
  取得」も「結果報告等の書き込み」も、対象大会の管理者本人が発行したPAT
  だけで完結し、OAuth用のバックエンド(client_secret保管場所)を新設する
  必要がない。この方針は本feature検討時にユーザー本人にも確認済み。
- **仕様への反映**: spec.md FR-027/FR-028、User Story 5を、
  「startggアカウントでログイン」ではなく「Personal Access Tokenの入力」を
  用いる表現に更新済み。「ログイン」ステップ(トークンを用いて管理権限のある
  トーナメント一覧を取得・選択)と「token設定」ステップ(以降の定期同期に
  使うトークンの保存)は、同種のPATを異なるタイミングで入力・保存する、
  独立して再実行可能な2つの操作として扱う。
- **Alternatives considered**: 本格的なOAuthログイン(「Login with
  start.gg」体験は提供できるが、client_secretの安全な保管のために軽量
  バックエンド/サーバーレス関数の新設が必要になり、「ローカルのみで完結・
  サーバー依存を避ける」という本featureの目的そのものと矛盾するため不採用)。

[oauth-overview]: https://developer.start.gg/docs/oauth/oauth-overview/
[auth-docs]: https://developer.start.gg/docs/authentication/
[update-phase-seeding]: https://developer.start.gg/docs/e2e/update-phase-seeding/

## 6. 注意書き(Notice)の保存・配信方式

- **Decision**: startggの**`Tournament.rules`**(トーナメント詳細ページの
  「遅刻、キャンセル、疑問点について」等が表示される自由記述欄)をread-only
  で定期同期し、ローカルに表示する。編集はstartgg側のトーナメント管理画面
  (本ツールの外)で行う。本ツールの管理画面は、現在の内容の表示と、
  startgg側編集画面への導線提供にとどめる。
- **Rationale**: start.ggの公開GraphQL API [Mutation一覧][mutation-doc]
  (`assignStation`, `assignStream`, `deletePhase`, `deleteStation`,
  `deleteWave`, `generateRegistrationToken`, `markSetCalled`,
  `markSetInProgress`, `registerForTournament`, `reportBracketSet`,
  `resetSet`, `resolveScheduleConflicts`, `swapSeeds`, `updateBracketSet`,
  `updatePhaseGroups`, `updatePhaseSeeding`, `updateVodUrl`, `upsertPhase`,
  `upsertStation`, `upsertWave`)を確認した結果、トーナメント/イベントの
  自由記述テキストを更新するmutationは存在しないことが判明した。一方、
  [Tournament型のスキーマ][tournament-doc]には`rules: String`フィールドが
  あり、これはquery(読み取り)で取得可能。会場の全端末で同じ注意書きを
  自動的に持たせたいという要件(「注意書きを全台に手入力するのは面倒」)は、
  「管理者がstartgg上の既存の編集手段(Rules欄)を1箇所だけ更新し、全端末が
  それを定期同期で自動的に取得する」という設計で、新規インフラ(サーバー等)
  なしに満たせる。この方式はユーザー本人の提案([start.ggの大会詳細ページ
  の該当欄を使えないか]という質問)に基づく。
- **仕様への反映**: spec.md FR-003, FR-032, FR-033, User Story 1/5,
  Key Entities「注意書き」を、「本ツール内で編集し保存を必須項目でブロック
  する」方式から「startgg側で編集されたものをread-only同期し、緊急連絡先の
  記載が確認できない場合は警告表示する」方式に更新済み。
- **Alternatives considered**: 専用の軽量共有クラウドストレージ(Firebase等)
  を新設(外部マネージドサービスへの依存が1つ増える)、会場LAN内でのローカル
  配信(配信元端末が常時起動・同一LAN上にある必要があり運用制約が増える)、
  自動配信を諦めて全端末への手動入力に統一(要件で「面倒」と明記されている
  ため不採用)。いずれも`Tournament.rules`の活用でより低コストに要件を
  満たせるため不採用。

[mutation-doc]: https://smashgg-schema.netlify.app/reference/mutation.doc
[tournament-doc]: https://smashgg-schema.netlify.app/reference/tournament.doc

## 7. 印刷/PDF出力方式

- **Decision**: ブラウザネイティブの印刷機能(CSS `@media print` +
  `window.print()`)。専用のPDF生成ライブラリは導入しない。
- **Rationale**: spec.md User Story 7 AC2は「端末の印刷機能でPDF等に出力
  する」ことを求めており、ブラウザの印刷ダイアログから「PDFに保存」する
  操作を前提としている。専用ライブラリ(例: `jspdf`, `puppeteer`)は
  サーバーサイドレンダリングやNode環境を要するものが多く、フロントエンド
  完結の方針と相性が悪い。CSS印刷スタイルシートで画面用UIを非表示にし、
  参考PDF(`impact_major_4_brackets.pdf`)のレイアウト(組合せブラケット図・
  ヘッダー・フッター)をCSS Grid/SVGで再現する。
- **Alternatives considered**: `jspdf`等のクライアントサイドPDF生成
  ライブラリ(レイアウト精度・日本語フォント埋め込みの手間が増え、
  ブラウザ標準の印刷機能で要件を満たせるため見送り)。

## 8. オフライン検知・バックグラウンド同期のスケジューリング

- **Decision**: `navigator.onLine` / `online` `offline`イベント +
  `setInterval`による定期同期。Service Worker(PWA化)は本feature範囲外。
- **Rationale**: spec.mdはインストール可能なPWAであることまでは要求して
  おらず、「ブラウザタブを開いている間、オフラインでも操作でき、オンライン
  復帰時に同期する」ことが要件の本質(FR-012, FR-015〜FR-017)。Service
  Workerによるオフラインキャッシュ・バックグラウンド同期APIは実装・
  デバッグコストが高く、現時点でのMVPスコープには過剰。
- **Alternatives considered**: Service Worker + Background Sync API
  (端末を閉じた状態での同期が可能になるが、要件上「端末を開いて進行担当が
  操作している」ことが前提のため必須ではない。将来的な拡張候補として
  data-model.md/quickstart.mdには影響しない形で除外)。

## 9. テスト戦略

- **Decision**: Vitest(ユニット・契約テスト)、`@testing-library/react`
  (コンポーネント/結合テスト、jsdom環境)。E2E自動化(Playwright等)は
  本feature範囲外とし、`quickstart.md`の手動検証シナリオで代替する。
- **Rationale**: Constitution原則I・IIの検証(型安全性・境界データの
  スキーマ検証)は契約テストで機械的に担保できる。オフライン/端末強制終了/
  実際の印刷結果の視覚確認は、自動E2Eより手動検証の方が費用対効果が高い
  スコープ(端末環境やブラウザ印刷ダイアログに依存するため)。
- **Alternatives considered**: Playwright等によるE2E自動化(将来的な拡張
  候補だが、MVPスコープでは投資対効果が見合わないため見送り)。

## 未解決事項

なし。Technical Contextの`NEEDS CLARIFICATION`は全て上記の調査・
ユーザー確認により解消済み。
