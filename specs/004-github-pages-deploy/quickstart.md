# Quickstart: GitHub Pages Deploy

本フィーチャーが実装された後、実際にmainブランチへの変更が自動でGitHub
Pagesへ公開されること、および公開されたサイトが正しく動作することを確認
するための手順。設計判断の詳細は`research.md`を参照し、ここでは重複させ
ない。

## 前提条件(一度だけ)

- 対象リポジトリ(`skyinthehand/asynchronous-progression`)がpublicで
  あること(確認済み。spec.md Clarifications参照)。
- リポジトリの **Settings → Pages → Build and deployment → Source** を
  **GitHub Actions** に設定する(research.md #5)。この設定自体は本
  フィーチャーのworkflowでは自動化されない、初回のみの手動操作。

## シナリオ1: 品質ゲート通過後に自動で公開される(User Story 1, 2 / FR-001〜004)

1. `main`ブランチへ変更をマージする(通常のPRフローで良い)。
2. GitHub Actionsの実行状況(Actionsタブ)を確認し、`quality-gate`
   ジョブ(lint・型チェック・テスト)が成功した後に`deploy`ジョブが
   実行されることを確認する。
3. **期待結果**: 追加の手動操作なしに、10分以内(SC-002)に公開URL
   (`https://skyinthehand.github.io/asynchronous-progression/`)へ変更が
   反映される。
4. ブラウザで公開URLを開き、注意事項確認モーダルが表示される等、通常の
   起動フローが問題なく動作することを確認する(User Story 1 Acceptance
   Scenario 1)。

## シナリオ2: 品質ゲート失敗時は公開されない(User Story 2 Acceptance Scenario 2)

実際に壊れた変更をmainへマージして検証する必要はない。ローカルで以下を
実行し、CIと同じ品質ゲートが同じ基準で失敗することを確認すれば十分。

```bash
npm run lint
npm run build
npm test
```

いずれかのコマンドが失敗する状態のコードでは、CI上の`quality-gate`
ジョブも同様に失敗し、`deploy`ジョブは(`needs`依存により)実行されず、
公開URLの内容は直前の正常な版のまま変わらないことを確認する
(実際にCI上で確認する場合は、意図的に壊した変更を一時的なブランチ/PR
にpushし、`quality-gate`が失敗して`deploy`がスキップされることを
Actionsタブで確認した後、そのブランチ/PRは削除する)。

## シナリオ3: サブパス配信でもアセットが正しく読み込まれる(User Story 3 / FR-005)

1. 公開URL(`https://skyinthehand.github.io/asynchronous-progression/`)を
   ブラウザで開く。
2. ブラウザの開発者ツール(Networkタブ)を開き、JS・CSS等のアセット
   読み込みに404等のエラーが発生していないことを確認する。
3. **期待結果**: 画面が正常に表示され、コンソールにアセット読み込み
   エラーが出力されていない。

## シナリオ4: 公開URLでも既存機能が変わらず動作する(User Story 1 Acceptance Scenario 2)

1. 公開URL上で、管理画面の初期化(Personal Access Token入力〜対象プール
   選択)を行う。
2. 対戦カードへの結果入力、離席記録、次戦候補モーダル等、主要な操作を
   一通り行う。
3. **期待結果**: ローカル開発環境(`npm run dev`)で動作させた場合と
   同じ挙動になる。既存のオフライン入力・IndexedDB永続化の挙動にも
   変化がない。
