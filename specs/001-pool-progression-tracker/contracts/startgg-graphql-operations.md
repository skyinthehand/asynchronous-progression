# Contract: startgg GraphQL API 利用範囲

本ツールがstartgg GraphQL API(`https://api.start.gg/gql/alpha`)に対して
発行する操作の一覧。フィールド名は`research.md`で確認したスキーマ
([PhaseGroup][phasegroup-doc], [Set][set-doc], [Mutation][mutation-doc],
[Tournament][tournament-doc])に基づく。実際のクエリ文字列は実装フェーズで
確定するが、依存するフィールドと用途はこの契約に従う。

[phasegroup-doc]: https://smashgg-schema.netlify.app/reference/phasegroup.doc.html
[set-doc]: https://smashgg-schema.netlify.app/reference/set.doc
[mutation-doc]: https://smashgg-schema.netlify.app/reference/mutation.doc
[tournament-doc]: https://smashgg-schema.netlify.app/reference/tournament.doc

すべてのリクエストは `Authorization: Bearer <token>` ヘッダーを付与する。
`<token>`は初期化時に取得したPersonal Access Token
(`StartggIntegrationConfig.syncToken`、または初期化「ログイン」時に一時的に
入力されたトークン)。

## Q1. 管理権限のあるトーナメント/イベント/フェーズ/プール一覧の取得

- **用途**: 初期化(FR-027の(1)(2))。管理者が入力したPATで、自分が管理権限を
  持つトーナメントとその配下のイベント/フェーズ/プール(PhaseGroup)を一覧
  表示し、対象プールを選択させる。
- **対象**: `currentUser` を起点に、管理権限のあるトーナメント
  (`tournaments`相当のフィールド)→ `events` → `phases` → `phaseGroups`
  (`PhaseGroup.id`, `displayIdentifier`, `bracketType`)を取得する。
- **検証**: 応答はzodスキーマ`TournamentListResponseSchema`で検証する。
  管理権限を持つトーナメントが0件の場合はUIでその旨を案内する
  (spec.md Edge Cases関連)。

## Q2. 対象プールの詳細・対戦カード一覧の取得(定期同期・FR-015)

- **用途**: 対象Poolの`MatchCard`(startgg `Set`)・`Entrant`の初期値/
  最新値を取得する。
- **対象フィールド**(`PhaseGroup`より): `id`, `displayIdentifier`,
  `bracketType`, `sets`(`SetConnection`) → 各`Set`の `id`, `identifier`,
  `round`, `station`, `slots`(entrant情報), `winnerId`, `displayScore`,
  `state`。
- **検証**: `MatchCardSchema`(data-model.md 2.）に対応するzodスキーマで
  検証。`bracketType`が未知の値の場合は`"OTHER"`にフォールバックする
  (壊れず表示だけ簡略化する = graceful degradation)。

## Q3. 予選終了選手の次戦(後続フェーズ配置)情報の取得(FR-015, FR-019)

- **用途**: プール内の全対戦が完了した選手について、次のフェーズでの
  対戦相手・卓番号を事前に取得・キャッシュし、オフライン時にも表示できる
  ようにする(FR-019)。
- **対象**: 対象選手の`Entrant.id`から、後続フェーズの`Seed`/`Set`を辿り
  対戦相手・卓番号を取得する。後続フェーズがまだ組まれていない場合は
  `NextMatchInfo.confirmed = false`として扱う。
- **検証**: `NextMatchInfoSchema`で検証。取得失敗(後続フェーズ未確定含む)は
  エラーではなく「未確定」の正常系として扱う。

## Q4. 注意書き(Tournament.rules)の取得(FR-033)

- **用途**: 定期同期の一部として、対象トーナメントの`rules`フィールドを
  取得し、`Notice`エンティティとしてキャッシュする。
- **対象**: `tournament(slug: $slug) { rules }`
- **検証**: `NoticeSchema`で検証。取得した`rules`に緊急連絡先らしき記載が
  含まれるかをローカルでヒューリスティック判定し
  `hasEmergencyContact`を導出する(判定ロジック自体はstartgg APIの契約
  範囲外、アプリ内ロジック)。
- **注記**: 本ツールはこのフィールドに対する**書き込みmutationを持たない**
  (research.md 6.参照)。

## M1. 対戦結果の報告・修正

- **用途**: 対戦結果の入力(FR-007)・後日修正(FR-021)。
- **mutation**: `reportBracketSet(setId: ID!, winnerId: ID, isDQ: Boolean,
  gameData: [BracketSetGameDataInput])`
- **前提条件**: 呼び出し前にドメイン側で`isLocked === false`
  (data-model.md 2.のMatchCard、FR-022)であることを検証する。このチェックは
  ローカルの`MatchCard`状態(後続カードの状態)に基づいて行い、startgg側の
  応答を待たずにUI上で編集可否を判定できるようにする。
- **オフライン時の扱い**: この呼び出しはFR-015の定期同期時にのみ発生する。
  オフライン中の入力はローカルの`MatchCard`更新のみ行い、`localOnly = true`
  としてキューに積む(即時呼び出しはしない)。
- **検証**: リクエスト送信前に`ReportBracketSetInputSchema`で入力値を検証。
  応答は`Set`の更新結果として Q2 と同じ`MatchCardSchema`で検証する。

## M2. 未使用のmutation(意図的に対象外)

以下は本feature範囲外として利用しない(research.md 6.の調査結果に基づく):

- トーナメント/イベントの説明文・注意書きを更新するmutation
  (**存在しないため**、対応するAPI呼び出しは設計しない。FR-032は
  startgg側の編集画面への導線提供にとどめる)。
- `updatePhaseSeeding`, `swapSeeds`, `updatePhaseGroups`等のシード/
  ブラケット構成そのものを変更するmutation(本ツールは進行入力に専念し、
  ブラケット構成の変更はstartgg側の管理画面で行う前提)。

## エラーハンドリング契約

- ネットワークエラー・startggサーバーエラー(5xx等)・レート制限エラーは、
  いずれも「同期失敗」として`SyncStatus.lastFailureAt` /
  `lastFailureReason`に記録し、ローカルデータには一切影響を与えない
  (FR-014, FR-017)。
- 認証エラー(トークン無効・権限不足)は、他の一時的エラーと区別してUIに
  明示し、管理画面でのトークン再設定(FR-028)を促す。
