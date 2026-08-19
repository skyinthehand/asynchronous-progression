# Contract: 配信台判定のためのスキーマ拡張

`001-pool-progression-tracker/contracts/startgg-graphql-operations.md`
「Q2. 対象プールの詳細・対戦カード一覧の取得」、および
`001-pool-progression-tracker/contracts/local-storage-schema.md`で
定義済みのIndexedDBスキーマ(`matchCards`ストア)を拡張する契約。
ストア構成・keyPath・インデックスに変更はない(既存ストアへの
フィールド追加のみ)。

## Q2クエリへの追加取得フィールド

`POOL_DETAIL_QUERY`(`src/infra/startgg/operations.ts`)の各`Set`選択に、
既存の`station`と同じ並びで配信(ストリーム)割り当てフィールドを追加する。

```graphql
sets(page: 1, perPage: 100) {
  nodes {
    id
    identifier
    round
    station {
      number
    }
    stream {
      id
    }
    slots { ... }
    winnerId
    displayScore
    state
  }
}
```

**⚠️ 実装時に検証が必要**: フィールド名`stream`・返却される形は
research.md #1に基づく推測であり、確定した一次情報ではない。実装後、
本番投入前に一度、実際にstart.gg上で配信台を設定した対戦を含むプールで
このクエリを実行し、レスポンスの実際の形を確認したうえで、下記の
`SetNodeSchema`拡張が正しいことを確かめることを必須の検証手順とする。

## SetNodeSchema(zod)への追加

```ts
const SetNodeSchema = z.object({
  // ...既存フィールド...
  stream: z.object({ id: z.union([z.string(), z.number()]) }).nullable(),
});
```

`fetchPoolDetail`が`MatchCard`へマッピングする際、
`isStreamed: set.stream !== null`として変換する。

## matchCardsストアへの追加フィールド

`MatchCardSchema`(zod、`src/domain/schemas/matchCard.ts`)に以下を追加する。
既存レコード(新フィールドを持たない)の読み込み時は`.default(false)`に
より`false`(配信ロックなし)で補完される(002-match-scoring-and-flowで
確立済みの手法)。`DB_VERSION`は据え置き、マイグレーション処理は不要。

```ts
isStreamed: z.boolean().default(false),
```

## 同期時のマージ規則

`src/features/sync/syncRunner.ts`の`mergeMatchCard`は、`isStreamed`に
ついて特別な保護ロジックを追加しない。すなわち、`{ ...remote, ... }`の
展開によりstart.gg側の最新値がそのまま採用される、既存の「明示的な
上書きフィールドを列挙していないものはremote優先」という挙動に従う
(`tableNumber`・スコア系フィールドのような「ローカル優先で保護する
フィールド」の一覧に`isStreamed`を加えない、というのがこの契約の
本質)。

**例外(既存の`localOnly`ブロック)**: `local.localOnly === true`かつ
`remoteCaughtUpWithAdvancement === false`の間(未送信の結果確定が
残っている間)は、`mergeMatchCard`が`local`をそのまま返す既存の分岐に
より、`isStreamed`の更新も他のフィールドと同様に一時的に反映されない。
これは意図した挙動であり(spec.md Edge Cases)、当該カードの未送信分の
同期が完了し次第、次回の同期で`isStreamed`も通常どおり最新化される。

## 後方互換性

- 新フィールドは`.default(false)`とするため、本feature適用前に保存済みの
  既存レコード(新フィールドを持たない)はそのまま読み込める。
- `station`(既存の物理対戦台取得)への変更はなく、両フィールドは
  互いに独立して共存する。
