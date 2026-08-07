# Contract: ローカルIndexedDBスキーマ

`idb`で管理するIndexedDBデータベースのオブジェクトストア定義。
data-model.mdの各エンティティに対応する。全ストアの値は、保存前・読み出し後
の両方でzodスキーマ検証を行う(Constitution原則II)。

## データベース

- **名前**: `pool-progression-tracker`
- **バージョニング**: スキーマ変更時は`idb`のマイグレーション機構
  (`upgrade`コールバック)でバージョンを1つずつ上げる。破壊的変更を行う
  場合も、既存データを失わないマイグレーション処理を用意する(FR-013,
  FR-014の「データを失ってはならない」要件を、アプリ更新時にも適用する)。

## オブジェクトストア一覧

| ストア名 | keyPath | 対応エンティティ | インデックス |
|---|---|---|---|
| `pools` | `id` | Pool | - |
| `matchCards` | `id` | MatchCard | `poolId` |
| `entrants` | `id` | Entrant | `poolId` |
| `staffAssignments` | 自動採番 | StaffAssignmentEntry | `poolId` |
| `notice` | `tournamentSlug` | Notice | - |
| `adminSession` | 固定キー`"current"` | AdminSession | - |
| `startggConfig` | 固定キー`"current"` | StartggIntegrationConfig | - |
| `syncStatus` | `poolId` | SyncStatus | - |

`adminSession`・`startggConfig`は端末につき1レコードのみのため、固定キーで
シングルトンとして扱う。

## 書き込み経路の一本化

- 全ての書き込みは`infra/storage`配下のリポジトリ関数を経由し、UI層や
  `features/*`から直接IndexedDB APIを呼び出さない(境界を1箇所に集約し、
  zod検証の抜け漏れを防ぐ)。
- `MatchCard`・`Entrant`・`StaffAssignmentEntry`への書き込みは、
  オンライン/オフラインを問わず常にまずこのローカルストアへ即時コミットし、
  その後(オンライン時のみ)`contracts/startgg-graphql-operations.md`の
  M1等でstartggへ反映する(ローカルが正、startggは非同期の反映先という
  片方向優先度)。

## 同時書き込みに関する契約

- 1端末=1プール専任(FR-010)のため、同一`poolId`への書き込みは単一端末内で
  発生する前提とし、複数タブでの同時書き込みは考慮しない(同一端末内で
  複数タブを開く運用はサポート対象外とし、UIレベルで多重起動を検知した
  場合は警告する)。
