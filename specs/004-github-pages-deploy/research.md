# Phase 0 Research: GitHub Pages Deploy

## 1. デプロイ方式(GitHub Pages公式のActionsベース vs branchベース/サードパーティAction)

**Decision**: GitHub公式のActionsベースのPagesデプロイ(`actions/configure-pages`
→ `actions/upload-pages-artifact` → `actions/deploy-pages`)を採用する。

**Rationale**: GitHub純正・継続的にメンテナンスされており、リポジトリの
Pages設定を「Source: GitHub Actions」に切り替えるだけで既存のCI workflow
から直接デプロイできる。`gh-pages`のような公開専用branchを別途管理する
必要がなく、公開履歴もGitHub Actionsの実行履歴とそのまま対応する。

**Alternatives considered**:
- `peaceiris/actions-gh-pages`等のサードパーティAction: 広く使われては
  いるが外部メンテナ依存であり、GitHub公式の代替手段が存在する以上
  採用理由がない。
- `gh-pages`branchへローカル/CIからpush: 公開用branchの管理・force-push
  運用が別途必要になり、FR-003(自動反映)の実現手段としても公式Action
  ベースより複雑。

## 2. デプロイジョブの配置(既存ci.ymlへのジョブ追加 vs 新規workflowファイル)

**Decision**: 新規workflowファイルを追加するのではなく、既存の
`.github/workflows/ci.yml`に`deploy`ジョブを追加し、既存の`quality-gate`
ジョブへの`needs`依存と、`main`ブランチへのpushイベントに限定する`if`
条件を付与する。

**Rationale**: GitHub Actionsの`needs`によるジョブ依存は同一workflow
ファイル内でのみ機能する(別workflowファイル間の依存には`workflow_run`
トリガーが必要で、チェックアウトするコミットの扱いや成果物の受け渡しが
複雑になる)。同一ファイル内でジョブを追加する方が、FR-004(品質ゲート
通過を公開の前提条件にする)をシンプルかつ確実に表現できる。

**Alternatives considered**:
- 独立した`deploy.yml`(`workflow_run`トリガーでci.ymlの成功を待つ):
  トリガーの対象workflow名・ブランチ条件の指定や、対象コミットのチェック
  アウトまわりで実装が複雑になり、同一ファイル内の`needs`より壊れやすい。
- 品質ゲートの内容(lint/型チェック/テスト)をdeploy側にも複製する独立
  workflow: 二重管理になりci.ymlとの内容乖離リスクがある。

## 3. GitHub Pagesプロジェクトページのサブパス対応(Vite `base`設定)

**Decision**: `vite.config.ts`の`base`を、環境変数(例: `BASE_PATH`)が
設定されている場合はその値、未設定の場合は既定値`"/"`を使うようにする。
デプロイ用ビルドのみ、workflow内で`BASE_PATH=/asynchronous-progression/`
を指定してビルドする。

**Rationale**: このリポジトリはユーザー/組織ページ(`<user>.github.io`)
ではなくプロジェクトページであるため、公開URLは
`https://skyinthehand.github.io/asynchronous-progression/`という
サブパス配信になる。Viteの既定の`base: "/"`のままビルドすると、生成される
アセット参照(JS/CSS等)がドメイン直下を指してしまい、サブパス配信では
すべて404になって画面が表示されない(User Story 3が明示的に対象とする
失敗パターン)。環境変数経由の切り替えにすることで、ローカルの
`npm run dev`・`npm run build`・`npm run preview`は現状通り`"/"`のまま
動作し続ける。

**Alternatives considered**:
- `base: "/asynchronous-progression/"`を`vite.config.ts`に直接ハード
  コードする: ローカルの`npm run preview`等が壊れる(ドメイン直下で
  プレビューしているのにサブパスを前提にしたアセット参照になるため)。
  リポジトリ名変更・fork時にも追従できない。
- 独自ドメインを設定してサブパス問題自体を回避する: spec.mdのFR-007/
  Assumptionsで独自ドメインは対象外と明記済みのため不採用。

## 4. 品質ゲート(テスト実行)の安定化

**Decision**: 品質ゲートで使うテスト実行コマンドを、Vitestのファイル単位
並列実行を無効化した`vitest run --no-file-parallelism`に統一する
(`package.json`の`test`スクリプト自体を変更し、ローカル・CI双方で同じ
挙動にする)。

**Rationale**: 本リポジトリの開発中、デフォルトのファイル並列実行下では
無関係な統合テスト(例: 管理画面のログインフロー)が環境負荷(実行環境の
CPU競合)により断続的に失敗する事象を複数回、実機で確認済み。同じテスト
スイートを`--no-file-parallelism`で実行した場合は、確認した全ての回で
テストが安定して全件成功した。GitHub-hostedランナー(標準は2コア)でも
同様のリソース制約下でのflakinessが再現するリスクが現実的にあり、対応
しないまま品質ゲートに組み込むと、正しい変更が見せかけ上の失敗で公開
できなくなり、FR-004・SC-003(品質ゲートの信頼性)を損なう。

**Alternatives considered**:
- 現状の`vitest run`のまま(既定の並列実行)を品質ゲートとして使う: 本
  リポジトリで実際に観測された不安定さをそのまま持ち込むことになり、
  デプロイの信頼性を損なうため不採用。
- CI失敗時に手動で再実行する運用でしのぐ: FR-003(手動操作なしでの自動
  反映)の趣旨に反し、SC-002(10分以内の反映)の達成も不確実になる。

## 5. GitHub Pagesの有効化(一次設定)

**Decision**: リポジトリの「Settings → Pages → Build and deployment →
Source」を「GitHub Actions」に設定する作業を、一度だけ手動で行う必要が
ある前提とする(quickstart.mdに手順として明記する)。

**Rationale**: 公開APIで確認した結果(`GET /repos/{owner}/{repo}/pages`
が404)、対象リポジトリではまだPagesが有効化されていない。GitHub公式の
仕様上、この配信元設定はworkflowの実行だけでは自動的に切り替わらず、
初回のみリポジトリ設定画面での操作が必要になる。

**Alternatives considered**: なし。GitHub Pages初回有効化に伴う不可避な
一度限りの手動設定として扱う(自動化しようとするとGitHub REST APIへの
追加の権限・呼び出しが必要になり、費用対効果が見合わない)。

## 6. SPAフォールバック(404.html)の要否

**Decision**: 追加しない。

**Rationale**: このアプリはクライアント側のURLベースルーティングを持たず
(`router.tsx`はアプリ内state切り替えのみで、パス遷移は発生しない)、常に
同一の`index.html`が唯一のエントリーポイントとなる。存在しないパスへの
直接アクセスというシナリオ自体が通常利用で発生しないため、GitHub Pagesの
既定の404挙動で問題ない。

**Alternatives considered**: `index.html`を`404.html`としても複製配置する
一般的なSPA対応 — 本アプリには該当するルーティングが存在しないため、
不要な複雑さを追加するだけと判断し不採用。
