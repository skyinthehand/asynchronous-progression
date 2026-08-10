# Contract: 対戦結果(スコア/DQ)・対戦台スキーマ拡張

`001-pool-progression-tracker/contracts/local-storage-schema.md`で定義済みの
IndexedDBスキーマ(`pool-progression-tracker`データベース、`matchCards`・
`pools`ストア)を拡張する契約。ストア構成・keyPath・インデックスに変更は
ない(既存ストアへのフィールド追加のみ)。

## matchCardsストアへの追加フィールド

`MatchCardSchema`(zod)に以下を追加する。既存レコード(新フィールドを
持たない)の読み込み時は、`nullable().default(...)`によりデフォルト値で
補完される(`entrant1SourceMatchId`追加時に確立済みの手法。IndexedDBの
`DB_VERSION`は据え置き、マイグレーション処理は不要)。

```ts
entrant1Score: z.number().int().min(0).max(3).nullable().default(null),
entrant2Score: z.number().int().min(0).max(3).nullable().default(null),
entrant1DQ: z.boolean().default(false),
entrant2DQ: z.boolean().default(false),
skippedFromSuggestion: z.boolean().default(false),
```

**書き込み時の追加検証ルール(スキーマのrefineまたは呼び出し側で保証)**:

- `entrant1DQ && entrant2DQ`は不可(FR-006)。呼び出し側
  (`domain/rules/matchResult.ts`)が結果確定前に検証し、エラーを返す。
  スキーマ自体はこの相互排他制約を型では表現しない(zodの`.refine()`で
  実装するか、呼び出し側のみで検証するかは実装フェーズで決定)。
- `entrant1Score === entrant2Score`(ともに非null)の状態での結果確定は
  拒否する(FR-003)。これも`domain/rules/matchResult.ts`側の検証であり、
  スキーマ自体は同点値の格納を禁止しない(修正途中の一時状態を許容する
  ため)。

**tableNumber(既存フィールド)の追加契約**:

- ローカルでの入力・変更(FR-012)は、保存時に`localOnly: true`を設定する
  (既存の`advanceWinner`が下流カードの`entrant1Id`/`entrant2Id`を更新する
  際と同じ保護パターン)。
- `features/sync/syncRunner.ts`の`mergeMatchCard`は、この保護により
  `localOnly === true`のカードの`tableNumber`を、startgg同期由来の古い
  `station`値で上書きしない(既存の`mergeMatchCard`ロジックがそのまま
  適用される。コード変更は不要)。
- 対戦台番号の入力・変更操作(UI)は、保存前に
  `domain/rules/tableAssignment.ts`の`isTableOccupied`で検証し、既に
  他の未完了(`status !== "COMPLETED"`)の対戦カードが同じ`tableNumber`を
  使っている場合は保存を拒否する(FR-014)。

## poolsストアへの追加フィールド

`PoolSchema`(zod)に以下を追加する。

```ts
tableCount: z.number().int().min(1).nullable().default(null),
```

- `null`は「対戦台数を設定していない」ことを表す(0ではなくnullを未設定の
  表現として使う。0を許容すると「0台」という無意味な状態が生まれるため)。
- 対戦台番号(`matchCards.tableNumber`)の入力候補は、UI側でこの値を
  上限として1〜`tableCount`に制限する(FR-013)。

## 次戦サジェスト・スコア判定は非永続

`domain/rules/matchResult.ts`(スコア/DQ→勝者判定)・
`domain/rules/nextMatchSuggestion.ts`(次戦候補算出)は、いずれも
IndexedDBへの読み書きを行わない純粋関数であり、これ自体は「保存契約」の
対象外(呼び出しのたびに`matchCards`/`pools`から動的に計算する。
既存の`domain/rules/bracketLayout.ts`・`domain/rules/editLock.ts`と同じ
設計方針)。

## 後方互換性

- 新フィールドはすべて`nullable().default(...)`または`.default(false)`と
  するため、001時点で保存済みの既存レコード(新フィールドを持たない)は
  そのまま読み込める。
- 既存のstartgg同期(`infra/startgg/operations.ts`の`fetchPoolDetail`)は
  変更しない。新フィールドはローカル入力専用であり、start.gg
  GraphQL APIから同期されることはない(スコア/DQ/対戦台数はこのツール
  独自の入力であり、start.gg側の`Set.displayScore`等とは別管理とする)。
