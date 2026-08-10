# Research: 対戦結果入力・対戦台呼び出しフローの強化

新しい外部ライブラリ・start.gg APIの新規呼び出しは発生しないため、本
featureのPhase 0は「未知の技術」の調査ではなく、既存コードベース
(`001-pool-progression-tracker`)の実装パターンに沿った設計判断の記録
とする。spec.mdの[NEEDS CLARIFICATION]はすべて`/speckit-clarify`で解消
済みのため、ここでの残課題はない。

## 1. スコア・DQの保存形式

**Decision**: `MatchCard`に`entrant1Score: number | null`・
`entrant2Score: number | null`(0〜3の整数)・`entrant1DQ: boolean`・
`entrant2DQ: boolean`を追加する。既存の表示用`score: string | null`
フィールド(例: "3-1"、"DQ-0")は、これら4項目から導出して自動的に
設定する(印刷レイアウト`TablePrintLayout.tsx`/`BracketPrintLayout.tsx`が
`card.score`をそのまま表示に使っているため、既存コードへの影響を
最小化する)。

**Rationale**: 勝者の自動判定(FR-002)・同点/両者DQの拒否(FR-003/FR-006)・
結果修正時の再編集(FR-008)には、表示用文字列ではなく構造化された数値・
真偽値が必要。一方でscore文字列を廃止すると、印刷レイアウトと
`entrant1Id === card.winnerId`判定以外の既存表示コードすべてに影響が
及ぶため、既存フィールドは残し導出値として扱うのが最小の変更範囲になる。

**Alternatives considered**:
- 文字列(`score: "3-1"`)のみをパースして勝者判定する: 入力/修正のたびに
  文字列⇄数値の変換が必要になり、同点判定・DQ判定のロジックが煩雑になる
  ため却下。
- score文字列を廃止し数値フィールドのみにする: 印刷レイアウト等の既存
  表示コードを本feature スコープ外まで変更する必要が生じるため却下。

## 2. 勝者自動判定・同点/両者DQ拒否のロジック

**Decision**: `domain/rules/matchResult.ts`に、`resolveMatchResult(input: {
entrant1Score: number | null; entrant2Score: number | null; entrant1DQ:
boolean; entrant2DQ: boolean })`という純粋関数を新設する。片方未入力を
0とみなす処理(FR-004)もこの関数内で行い、`{ winnerId: "entrant1" |
"entrant2"; score: string } | { error: "TIE" | "BOTH_DQ" }`を返す。

**Rationale**: 既存の`editLock.ts`・`matchProgression.ts`と同じ
「`domain/rules`配下の副作用なし純粋関数 + `tests/unit/domain/rules/`の
`makeCard`ヘルパーを使った単体テスト」パターンを踏襲する。UIコンポーネント
(`MatchCardEntry.tsx`/`MatchCardRow.tsx`)からはこの関数を呼び出すだけにし、
判定ロジックの重複を避ける(ブラケット表示・総当り表の両方から共通利用)。

**Alternatives considered**: UIコンポーネント内に判定ロジックを直接書く —
ブラケット表示(`MatchCardEntry.tsx`)と総当り表(`MatchCardRow.tsx`)の
2箇所で同じ判定を重複実装することになり、修正漏れのリスクがあるため却下。

## 3. 対戦台の占有判定(FR-014)

**Decision**: `domain/rules/tableAssignment.ts`に`isTableOccupied(tableNumber:
string, matchCards: MatchCard[], excludeCardId?: string): boolean`を
新設する。「`tableNumber`が一致し、かつ`status !== "COMPLETED"`」の
対戦カードが(割り当て対象自身を除いて)1件でもあれば占有中と判定する。
対戦台番号の入力・変更時にこの関数で検証し、占有中ならUI側で入力を拒否する
(US2 Acceptance Scenario 4)。

**Rationale**: spec.md Clarificationsで「未完了(進行中扱い)」という表現が
使われており、`status`が`IN_PROGRESS`に明示的に変更されていなくても
(FR-010により進行中への変更は任意のため)、対戦台が割り当てられ未完了の
対戦は占有中として扱う必要がある。`COMPLETED`以外を占有中とみなす方針が
最も既存要件(FR-010の「進行中への設定は任意」)と整合する。

**Alternatives considered**: `status === "IN_PROGRESS"`のみを占有中とみなす
— 進行中への変更をせず直接結果を確定する運用(FR-010)と組み合わせると、
実際にプレイ中の対戦の対戦台が「空き」と誤判定されてしまうため却下。

## 4. 対戦台番号フィールドの統合

**Decision**: 新規フィールドは追加せず、既存の`MatchCard.tableNumber`
(`string | null`)をそのまま使う。ローカルでの入力・変更時は、既存の
`localOnly: true`保護パターン(本セッションで`matchProgression.ts`の
`advanceWinner`に導入済み)を`tableNumber`の変更にも適用し、
`syncRunner.ts`の`mergeMatchCard`がstartgg同期由来の古い値で上書き
しないようにする。

**Rationale**: spec.md Clarifications(Q2)で明示的に「同一フィールドを
拡張」と決定済み。既存の`localOnly`保護の仕組みをそのまま再利用できる
ため、実装コストが最小になる。

**Alternatives considered**: 独立した新フィールド(例: `localTableNumber`)
を追加する — Clarificationsで却下済みの選択肢(2つの「対戦台番号」概念が
併存し混乱を招く)。

## 5. スキップ機構の設計

**Decision**: `MatchCard`に`skippedFromSuggestion: boolean`(既定`false`)を
追加する。次戦サジェスト計算(下記6)は、`skippedFromSuggestion === true`の
対戦カードを他に候補がない場合のみ提示する(完全除外ではなく優先度を
下げるだけ)。手動での対戦開始(FR-019、一覧から直接選択)は
`skippedFromSuggestion`の値に関わらず常に可能。

**Rationale**: spec.mdは「スキップされた対戦は自動サジェストの対象から
一時的に外れるが、いつでも選び直せる」(Assumptions)と定義しているが、
「全ての残り対戦がスキップ済みの場合」の挙動までは規定していない。
完全除外にすると、全対戦スキップ時にサジェストが恒久的に空になり
FR-017(次に進行すべき対戦カードを1件提示)を満たせなくなるため、
優先度を下げるだけの設計が既存要件と矛盾しない最小の拡張になる。

**Alternatives considered**: スキップを永続的な除外にし、明示的な
「スキップ解除」ボタンを設ける — spec.mdのAssumptionsが要求する以上の
UIをplan段階で追加することになり、YAGNI(過剰設計)と判断し却下。

## 6. 次戦サジェストアルゴリズム

**Decision**: 既存`nextCardIndicator.ts`の`findNextMatchCard`を、
`domain/rules/nextMatchSuggestion.ts`の`computeNextMatchSuggestions(
matchCards: MatchCard[], tableCount: number | null): NextMatchSuggestion[]`
に置き換える。`tableCount`が`null`または`0`の場合はFR-018のフォールバック
として、対戦台に紐付かない単一の`NextMatchSuggestion`(`table: null`)を
返す(既存`findNextMatchCard`と同じ「ラウンド→識別子」の優先順位を流用)。
`tableCount`が設定されている場合は、空いている(3の`isTableOccupied`が
`false`を返す)対戦台ごとに、未着手・未スキップ優先の対戦カードを1件ずつ
割り当てて返す。

**Rationale**: 既存の優先順位ロジック(ラウンド→識別子の昇順)は
FR-018で明示的に維持することが求められており(「従来通りの単純な提示」)、
全面刷新ではなく既存ロジックを対戦台単位に拡張する設計が最も要件に忠実。

**Alternatives considered**: `nextCardIndicator.ts`を残したまま対戦台判定を
別関数として並存させる — 「次の対戦」の判定基準が2箇所に分散し、
BracketBoard・一覧・モーダルの間で表示が食い違うリスクがあるため却下し、
単一の関数に統合する。

## 7. 次戦候補モーダルの実装

**Decision**: `usePoolProgress.ts`の`recordResult`が結果確定に成功した
直後、確定した対戦カードに割り当てられていた対戦台番号(あれば)を使って
`computeNextMatchSuggestions`を呼び出し、対応する1件を
`nextMatchSuggestion` stateにセットする。`PoolProgressScreen.tsx`は、この
stateが非nullの間、新規`NextMatchModal.tsx`(既存`components/Modal.tsx`を
利用)を表示する。モーダルは「対戦開始」(対戦台番号は任意入力)・
「スキップ」の2アクションのみを持ち、「別の対戦を選ぶ」ボタンは設けない
(spec.md Clarifications Q3)。未選択のまま閉じた場合はstateをクリアする
のみで、対戦カードの状態には触れない(FR-025)。

**Rationale**: `recordResult`は既に対戦カードの更新・`localOnly`付与・
`isLocked`再計算・永続化を一箇所で担っており、次戦候補の計算もこの
関数の最後に追加するのが既存フローへの追加として最小の変更になる。

**Alternatives considered**: `PoolProgressScreen.tsx`側で結果確定後に
`useEffect`で次戦候補を再計算する — `recordResult`呼び出しと非同期に
発火するタイミング制御が複雑になり、SC-004(1秒未満)の検証もしづらく
なるため却下。

## 8. トーナメント表示(組合せ図)への次戦候補の反映

**Decision**: `BracketBoard.tsx`が現在使っている`nextCardId`propの算出元を
`findNextMatchCard`から`computeNextMatchSuggestions`の結果(対戦台が
複数ある場合は全ての提示対象の対戦カードIDの集合)に差し替える。
`MatchCardEntry`の`isNext`表示(既存の強調枠)をそのまま再利用する。

**Rationale**: 既存の強調表示の仕組み(`isNext` → `.match-card-next`の
CSS)をそのまま使えるため、UIパターンの追加は不要。対戦台が複数ある場合は
複数の対戦カードが同時に強調されうる(1台につき1件の候補があるため)。

**Alternatives considered**: ブラケット表示専用の新しい強調スタイルを
追加する — 既存の`isNext`強調と見た目が異なると進行担当者が混乱するため
却下。

## 9. 総当り表とブラケット表示でのスコア入力UIの共通化

**Decision**: スコア/DQ入力フォームを`ScoreEntryForm.tsx`という共有
コンポーネントとして新設し、`MatchCardEntry.tsx`(ブラケット表示)と
`MatchCardRow.tsx`(総当り表)の両方から利用する。`MatchCardEdit.tsx`
(結果修正)も同じコンポーネントを再利用し、初期値に既存の
`entrant1Score`/`entrant2Score`/DQフラグを渡す。

**Rationale**: US1のスコア入力・自動0補完・同点/両者DQエラー表示は、
ブラケット表示・総当り表・修正フォームの3箇所で全く同じ挙動が要求される
(spec.mdはこの3箇所を区別していない)。共通コンポーネント化により、
`domain/rules/matchResult.ts`の呼び出し・エラー表示ロジックを1箇所に
集約できる。

**Alternatives considered**: 3箇所それぞれに個別実装する — 001の既存
コードで一部重複(`MatchCardEntry.tsx`と`MatchCardRow.tsx`が似た
入力UIを個別に持つ)が既に生じており、これ以上重複を増やさない方針とする。

## 10. IndexedDBスキーマ変更の適用方法

**Decision**: `MatchCardSchema`/`PoolSchema`への新規フィールド追加は、
本セッション中に確立された既存パターン(`z.xxx().nullable().default(null)`
または`z.boolean().default(false)`)に従い、IndexedDBの`DB_VERSION`は
据え置く(`upgrade`コールバックでのマイグレーション処理は不要)。

**Rationale**: `entrant1SourceMatchId`/`entrant2SourceMatchId`の追加時に
確立済みの手法で、既存データとの後方互換性を保ちながらフィールドを
追加できることが実証済み(既存テストフィクスチャへの影響は、新規
フィールドを明示的に追加するだけで済む)。

**Alternatives considered**: `DB_VERSION`を上げて`upgrade`コールバックで
マイグレーションする — `contracts/local-storage-schema.md`(001)は
将来的にこの方式を想定しているが、nullable+defaultで十分に安全に
拡張できる現状では過剰設計と判断し、今回は見送る。
