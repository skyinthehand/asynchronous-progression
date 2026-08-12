# Data Model: 次戦サジェストの優先順位修正

本featureは新しい永続データ(IndexedDBスキーマ)を追加しない。
`001-pool-progression-tracker`/`002-match-scoring-and-flow`で定義済みの
`MatchCard`(`entrant1Id`, `entrant2Id`, `round`, `bracketSide`,
`entrant1SourceMatchId`, `entrant2SourceMatchId`, `skippedFromSuggestion`等)
をそのまま読み取り専用で使い、以下の値を都度動的に算出する
(`domain/rules/bracketLayout.ts`が組合せ図の表示位置を保存せず都度算出
するのと同じ設計方針)。

## 1. 対戦カードの遠さ(MatchDistance、永続化しない)

`domain/rules/matchDistance.ts`の`computeMatchDistances`が返す、対戦カード
IDから距離への対応表。

| フィールド | 型 | 説明 |
|---|---|---|
| (Map のキー) | string | 対戦カードのID(`MatchCard.id`) |
| (Map の値) | number | プール抜けを決定づける対戦(基準点)からの距離。基準点自体は1。値が大きいほど基準点から遠い(早いラウンドの対戦)。 |

**算出ルール**(research.md #2/#3で確定):

- 対戦カードの`bracketSide`(`WINNERS`/`LOSERS`)ごとに、その側に属する
  対戦カードのうち`Math.abs(round)`が最大のものを基準点とし、距離1を
  割り当てる。
- 基準点から、対戦カード間の「出場元」の関係
  (`entrant1SourceMatchId`/`entrant2SourceMatchId`が指す対戦を
  「出場元」とする有向辺、勝者側→勝者側・敗者側→敗者側・勝者側→敗者側
  (敗者の"落ち")のいずれも含む)を逆方向にたどるBFSで、既に距離が確定した
  対戦の出場元となる各対戦に「+1」した距離を割り当てる。複数経路がある
  場合はBFSにより自動的に最短(最も小さい)距離が採用される。
- 総当り(`bracketSide`が全て`"N/A"`)のプールでは、この算出自体を行わない
  (下記3. 参照)。

## 2. 次戦サジェストの優先順位比較(永続化しない)

`domain/rules/nextMatchSuggestion.ts`の`computeNextMatchSuggestions`が
候補選定に使う比較規則。既存の`NextMatchSuggestion`
(`matchCardId`, `table`)の形は変更しない。

**候補適格の条件(FR-001)**:

- `entrant1Id !== null && entrant2Id !== null`(理由を問わず、両方確定して
  いない対戦は候補から除外する)。
- `status === "NOT_STARTED"`(既存条件、変更なし)。

**優先順位(適格な候補同士の比較。値が「優先」側が先頭に来るようソート)**:

1. 勝敗ブラケット形式の場合: 対戦カードの遠さ(1. のMatchDistance)が
   大きいものを優先する(FR-004)。総当り形式の場合はこの基準を使わない
   (3. 参照)。
2. 遠さが等しい場合: `bracketSide === "LOSERS"`の対戦を
   `bracketSide === "WINNERS"`の対戦より優先する(FR-005)。
3. 遠さ・側が等しい場合: `bracketLayout.ts`の`computeBracketLayout`が
   算出する`slot`(同じラウンド内での縦位置)が小さいもの(=組合せ図上で
   より上に表示されるもの)を優先する(FR-006)。
4. 上記1〜3がすべて等しい(想定上ほぼ起きない)場合: 既存のフォールバック
   として`round`→`identifier`の昇順を使う。

**`skippedFromSuggestion`との関係**: 既存の`pickBest`の規則
(スキップされていない候補群を優先し、全滅時のみスキップ済み候補群を
使う)は維持する。上記の優先順位比較は、まず`skippedFromSuggestion`で
2群に分けたあと、それぞれの群の中で適用する。

## 3. 総当り(ROUND_ROBIN)形式・敗者側が存在しない形式でのフォールバック

対戦カード配列の中に`bracketSide`が`"WINNERS"`または`"LOSERS"`の
カードが1件も存在しない(=総当り形式)場合、上記2.の優先順位1〜3を
適用せず、既存のフォールバック(`round`→`identifier`の昇順、
`skippedFromSuggestion`による2群分けは維持)のみを使う(FR-008)。

シングルイリミネーション(敗者側の対戦が1件も存在しない)場合は、
2.の優先順位2(敗者側優先)の対象となる敗者側の候補が存在しないだけで、
アルゴリズム自体に分岐は不要(自然に勝者側のみでの比較になる)。
