# Research: 配信台設定された対戦の編集ロック

## 1. start.gg APIで「配信台が設定されているか」をどう取得するか

- **Decision**: 対戦カード取得クエリ(`Q2. 対象プールの詳細・対戦カード
  一覧の取得`、`src/infra/startgg/operations.ts`の`POOL_DETAIL_QUERY`)の
  各`Set`選択に、`station`と同じ並びで`stream { id }`(または同等の
  ストリーム割り当てフィールド)を追加し、`null`でなければ「配信台が
  設定されている」と判定する。
- **Rationale**: `001-pool-progression-tracker/specs/.../research.md`で
  既に確認済みのstart.gg公開Mutation一覧に`assignStream`(station向けの
  `assignStation`と対になるmutation)が存在することを確認済み。station側は
  「Set.station(query) ⇔ assignStation(mutation)」という対応関係で
  既に実装済み(`SetNodeSchema.station`)であるため、streamも同様に
  「Set.stream(query) ⇔ assignStream(mutation)」という対応関係を持つ
  可能性が高い。既存の`station: z.object({ number: ... }).nullable()`と
  同じ形(nullableなオブジェクト。中身の詳細フィールドは使わず、
  存在有無(null/非null)のみを判定に使う)を踏襲する。
- **⚠️ 検証が必要な前提**: 正確なフィールド名(`stream`か、別名か)・
  返却される形(単一オブジェクトか配列か)は、非公式スキーマ参照や過去の
  類推に基づく推測であり、確定した一次情報ではない。本プロジェクトでは
  過去に`Event.rulesMarkdown`が非公式スキーマ文書と実際のレスポンスで
  型が異なっていた事例があり(配列型と誤認識し、実際は文字列だった)、
  同様の食い違いが起きうる。実装時、実際にstart.gg上で配信台を設定した
  対戦を用意し、`POOL_DETAIL_QUERY`のレスポンスを実機で確認したうえで
  スキーマ(`SetNodeSchema`)を確定させることを必須の検証手順とする
  (契約テスト`tests/contract/startgg-operations.test.ts`は、実機確認前は
  推測したフィールド名で仮実装し、確認後に必要なら修正する)。
- **Alternatives considered**:
  - 対戦カードの`identifier`や`station`から配信中かどうかを推測する
    (例: 特定の対戦台番号を「配信台」として運用上取り決める) →
    ユーザーの説明(「startgg上でStreamが設定されていたら」)に反する
    独自ルールになり、start.gg側の実際の設定と乖離するリスクがあるため
    却下。
  - このアプリから配信台の設定・解除自体を行う(`assignStream`
    mutationを呼ぶ機能を追加する) → ユーザーの要望は「外部から設定
    されることがある」状態を検知して編集をロックすることであり、
    このアプリから配信台を操作する要件はない(spec.md Assumptions)。
    スコープ外として却下。

## 2. 既存のロック機構(プレビューモード・isLocked)との関係

- **Decision**: 配信ロックは、既存の2種類のロック機構
  (`isLocked`=後続対戦の進行による確定済みカードの修正ロック、
  `isPreviewMode`=プール全体のstart.gg未開始ロック)とは独立した
  **3つ目の、対戦カード単位のロック条件**として実装する。UI側の
  「編集可否」判定(`MatchCardEntry.tsx`/`MatchCardRow.tsx`の`canEdit`/
  `isEditable`相当)に、`!card.isStreamed`を追加の条件として組み込む。
- **Rationale**: 3つのロックはそれぞれ発生条件・解除条件が異なる
  (isLocked=後続対戦の進行/取り消しで自動再計算、isPreviewMode=
  ブラケット未開始/開始で切り替わる、配信ロック=start.gg上の配信台
  設定/解除で切り替わる)独立した状態であり、単一のフラグに統合すると
  「なぜ編集できないか」の表示(spec.md User Story 2)が区別できなくなる。
  各ロックが持つ既存の表示メッセージ(`後続の対戦が進行しているため...`
  等)と同様に、配信ロック専用の表示(「配信中」バッジ)を追加する
  ことで、3つを独立に判定・表示できる設計を維持する。
- **Alternatives considered**: `isPreviewMode`と同じ`readOnly`propに
  統合する(プール全体を配信ロック対象にする) → spec.mdの要求(配信台が
  設定された対戦だけをロックし、他の対戦は通常通り操作できる)に反する
  ため却下。あくまで対戦カード単位の判定が必要。

## 3. 次戦候補(computeNextMatchSuggestions)からの除外方法

- **Decision**: `src/domain/rules/nextMatchSuggestion.ts`の`isEligible`
  (FR-001の判定関数)に`!card.isStreamed`の条件を追加する。
- **Rationale**: `isEligible`は既に「候補にしてはいけない対戦カード」を
  一箇所で判定する関数として存在し(003-next-match-priority-fixで
  出場者未確定カードの除外に使われている)、配信中の対戦も同じ意味で
  「候補にしてはいけない」対戦であるため、同じ関数に条件を足すのが
  最小の変更になる。優先順位の比較ロジック(`compareByPriority`)には
  手を加えない。
- **Alternatives considered**: `compareByPriority`側で配信中の対戦を
  最下位に回す(離席中判定と同様の扱い) → 離席中は「一時的に呼べない
  だけで対象ではある」のに対し、配信中は「この進行担当者が呼ぶべき
  対戦では最初からない」という性質の違いがあり、FR-006(次戦候補の対象
  から除外しなければならない)の表現として`isEligible`側での完全除外が
  適切。

## 4. IndexedDBスキーマへの影響

- **Decision**: `MatchCardSchema`に`isStreamed: z.boolean().default(false)`
  を追加する。`DB_VERSION`は据え置き、マイグレーション処理は不要
  (002-match-scoring-and-flowで確立済みの`nullable().default(...)`/
  `.default(false)`パターンをそのまま踏襲)。
- **Rationale**: 既存レコード(新フィールドを持たない)を読み込む際、
  zodのデフォルト値補完により`false`(配信ロックなし)として扱われる
  ため、後方互換性が保たれる。
