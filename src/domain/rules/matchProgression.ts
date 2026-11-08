import type { MatchCard } from "../entities/matchCard.js";

/**
 * entrant1/entrant2SourceMatchIdの参照先を解決する際の側の判定。
 * bracketLayout.tsと同じ畳み込み規則。MatchCardEntry.tsx側でも、未確定な
 * 枠が出場元対戦の「勝者」/「敗者」のどちらを待っているかの表示
 * (artifactの`placeholder()`相当)に再利用する。
 */
export function foldSide(
  bracketSide: MatchCard["bracketSide"],
): "WINNERS" | "LOSERS" {
  return bracketSide === "LOSERS" ? "LOSERS" : "WINNERS";
}

/**
 * 対戦カードの指定した枠に、出場元の対戦(sourceCard)の勝者と敗者の
 * どちらが入るか。start.ggが返す順位(entrant1/2SourcePlacement、1=勝者・
 * 2=敗者)があればそれに従う。無い場合(古いデータ等)は従来どおり、
 * 出場元と同じ側(勝者側→勝者側、敗者側→敗者側)なら勝者、別の側
 * (勝者側→敗者側)なら敗者と推測する。
 *
 * ユーザーフィードバック(2026-11-08): 推測だけでは、グランドファイナル
 * (勝者側)の片方の枠に敗者側決勝の「敗者」を、グランドファイナル
 * リセットの両方の枠にGFの「勝者」を入れてしまっていた(「Miya vs
 * Miya」)。MatchCardEntry.tsxの「Xの勝者/敗者」表示も同じ判定を使う。
 */
export function slotTakesWinner(
  card: MatchCard,
  slot: "entrant1" | "entrant2",
  sourceCard: MatchCard,
): boolean {
  const placement =
    slot === "entrant1"
      ? card.entrant1SourcePlacement
      : card.entrant2SourcePlacement;
  if (placement === 1) return true;
  if (placement === 2) return false;
  return foldSide(card.bracketSide) === foldSide(sourceCard.bracketSide);
}

/**
 * FR-023: 対戦カードの結果が確定した際、その結果を後続の対戦カード
 * (entrant1/entrant2SourceMatchIdでこのカードを出場元として参照している
 * カード)のentrant1Id/entrant2Idへ反映する。startgg同期後はstartgg側の
 * 処理で後続カードのentrantが埋まるが、オフラインでローカルに結果を
 * 入力した場合は自分で送り込む必要がある(そうしないとブラケット表示・
 * 次戦案内で後続カードがBYEのまま止まって見える)。
 *
 * 勝者と敗者のどちらを送るかはslotTakesWinner(start.ggの順位、無ければ
 * 同じ側なら勝者・別の側なら敗者)で決める。この判定を取り違えると、
 * 敗者側の対戦にいつまでも出場者が反映されない(または勝者側の勝者が
 * 誤って敗者側に現れる)。
 *
 * 反映した後続カードは必ずlocalOnly: trueにする。startggへの結果送信
 * (M1)が現状動いていない間は、start.gg側のこの後続カードのentrantは
 * いつまでもnullのままになる。そのため次回同期時、
 * syncRunner.tsのmergeMatchCardはlocalOnly===falseのカードをstartgg側の
 * (古い)値で丸ごと上書きしてしまう。ここでlocalOnly: trueにしておかない
 * と、せっかく反映した後続カードのentrantが次回同期のたびに消えてしまう
 * (実際に報告されたバグ: 「まだ敗者側に反映されない」→表示の問題では
 * なく、同期のたびにデータごと巻き戻っていた)。
 */
export function advanceWinner(
  matchCards: MatchCard[],
  sourceCard: MatchCard,
): MatchCard[] {
  if (!sourceCard.winnerId) return matchCards;
  const winnerId = sourceCard.winnerId;
  const loserId =
    sourceCard.entrant1Id === winnerId
      ? sourceCard.entrant2Id
      : sourceCard.entrant1Id;

  return matchCards.map((card) => {
    const advancingId = (slot: "entrant1" | "entrant2") =>
      slotTakesWinner(card, slot, sourceCard) ? winnerId : loserId;

    const entrant1Id =
      card.entrant1SourceMatchId === sourceCard.id
        ? advancingId("entrant1")
        : card.entrant1Id;
    const entrant2Id =
      card.entrant2SourceMatchId === sourceCard.id
        ? advancingId("entrant2")
        : card.entrant2Id;

    if (entrant1Id === card.entrant1Id && entrant2Id === card.entrant2Id) {
      return card;
    }
    return { ...card, entrant1Id, entrant2Id, localOnly: true };
  });
}

/**
 * FR-023: 確定済み(winnerId有り)の全対戦カードについてadvanceWinnerを
 * 再適用し、後続カードの出場者反映が抜け落ちていないか自己修復する。
 *
 * advanceWinnerは結果を記録したその場でしか呼ばれないため、それより前に
 * (例えばlocalOnly: trueを付け忘れていた古いバージョンで記録した結果が、
 * その後の同期で上書きされて消えてしまった等)反映が欠けたまま保存されて
 * しまったカードは、再度そのカードの結果を修正しない限り直らない。
 * プールを読み込むたびにこの関数を通すことで、そうした既存データの
 * ズレも次に開いたときには自動的に直る(実際に「Winners Round1の結果
 * だけLosersに反映されていない」という形で報告されたのは、後続ラウンド
 * を記録した時点では既にlocalOnly対応が入っていたが、Round1はそれより
 * 前に記録され、その後の同期で一度上書きされてしまっていたため)。
 * advanceWinner自身が「実際に変化がある場合のみ」新しいオブジェクトを
 * 返すため、既に正しい状態のカードには触れず、何度呼んでも安全
 * (冪等)。
 */
export function reconcileAdvancement(matchCards: MatchCard[]): MatchCard[] {
  const completedSources = matchCards.filter((card) => card.winnerId !== null);
  return completedSources.reduce(
    (cards, source) => advanceWinner(cards, source),
    matchCards,
  );
}
