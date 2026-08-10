import type { MatchCard } from "../entities/matchCard.js";
import { type BracketSide, groupBySideAndRound } from "./bracketGrouping.js";

const SPREADSHEET_IDENTIFIER = /^[A-Za-z]+$/;

/**
 * startggの対戦識別子(A, B, ..., Z, AA, AB, ...)をExcel/スプレッドシートの
 * 列名と同じ base-26 の通し番号に変換する。単純な文字列比較(localeCompare)
 * だと "AA" が "Z" より前に来てしまう(A<Zのため)。
 */
function spreadsheetRank(identifier: string): number {
  let rank = 0;
  for (const char of identifier.toUpperCase()) {
    rank = rank * 26 + (char.charCodeAt(0) - "A".charCodeAt(0) + 1);
  }
  return rank;
}

/**
 * identifierだけを手がかりに並び順を決めるしかない場面(下記
 * computeBracketLayoutの「基準ラウンド」)向けの比較関数。A〜Z・AA〜AZ...
 * のような純粋な英字の識別子はスプレッドシート式の順位で比較し、そうで
 * ない識別子(自前生成の"R1-1"形式など)は従来通り文字列比較にフォール
 * バックする。
 */
function compareIdentifiers(a: string, b: string): number {
  if (SPREADSHEET_IDENTIFIER.test(a) && SPREADSHEET_IDENTIFIER.test(b)) {
    return spreadsheetRank(a) - spreadsheetRank(b);
  }
  return a.localeCompare(b);
}

export interface BracketMatchLayout {
  card: MatchCard;
  round: number;
  /**
   * ラウンド内での縦位置。同じ側のラウンドをまたいで比較可能な相対値
   * (対戦相手の出場元カードの位置の平均から算出するため、小数になりうる)。
   */
  slot: number;
}

export interface BracketConnector {
  fromMatchId: string;
  fromRoundIndex: number;
  fromSlot: number;
  toMatchId: string;
  toRoundIndex: number;
  toSlot: number;
}

/** 別の側(勝者側→敗者側への"落ち"等)から出場者が来ていることを示す注記。 */
export interface BracketCrossSideOrigin {
  toMatchId: string;
  fromMatchId: string;
  fromIdentifier: string;
  fromSide: BracketSide;
}

export interface BracketSideLayout {
  side: BracketSide;
  rounds: number[];
  matchesByRound: Map<number, BracketMatchLayout[]>;
  connectors: BracketConnector[];
  crossSideOrigins: BracketCrossSideOrigin[];
}

/**
 * FR-023: startggのブラケット表示に合わせ、対戦カードを勝者側/敗者側の
 * トーナメント木(ラウンド列 × 縦位置)として配置する。
 *
 * ■ 格納されている生データの形(このファイルへの入力)
 * IndexedDB(ひいてはこの関数への引数matchCards)には、対戦カードは
 * ツリー構造を持たない「フラットな配列」として保存されている
 * (domain/schemas/matchCard.ts)。並び順に意味はなく、1件ごとに
 * 持っているのは以下だけ:
 *   - round / bracketSide: 自分がどのラウンド・どちらの側(勝者側/
 *     敗者側)の対戦か
 *   - identifier: startggが割り振る対戦識別子。A, B, ..., Z, AA, AB, ...
 *     というスプレッドシートの列名と同じ通し文字(実データはround順とは
 *     限らない順序で振られている)
 *   - entrant1SourceMatchId / entrant2SourceMatchId: 自分のentrant1/
 *     entrant2が「どの対戦カード(MatchCard.id)の勝者か」への参照。
 *     start.gg同期時にSetSlot.prereqType==="set"の場合のprereqIdから
 *     設定される(infra/startgg/operations.tsのfetchPoolDetail参照)。
 *     seed/bye由来などで前の対戦が存在しない場合はnull。
 *
 * ■ なぜ「ラウンド1をidentifier順に並べる」だけでは崩れるか
 * シード/BYEにより、ある側の最初のラウンド(出場元カードを一切持たない、
 * 文字通りの最下段=leaf)は、本来あるはずの対戦の一部が「実在しない」
 * ことがある(例: 8人本来必要な区画に7人しかおらず、1人が不戦勝で
 * ラウンド2に直接進む場合、その区画に対応するラウンド1の対戦カードは
 * そもそも生成されない)。この「歯抜け」はidentifierの並びには反映され
 * ないため、ラウンド1をidentifier順に並べても正しい対戦順にはならない
 * (どの対戦が欠けているか分からない)。
 * 一方、ラウンド2以降は「対戦カードが欠ける」ことがない(ラウンド1で
 * 不戦勝だった選手も、ラウンド2では必ず実際の対戦カードを持つ)。
 * そこで、ラウンド1(の中でも出場元カードを持たないleafなラウンド)は
 * identifier順を信用せず、代わりに「1つ後のラウンド」を基準にして
 * 位置を逆算する。
 *
 * ■ 表示用に詰め直す手順
 * 1. groupBySideAndRound(bracketGrouping.ts)で、フラットな配列を
 *    {WINNERS: Map<round, cards[]>, LOSERS: Map<round, cards[]>}に
 *    分類する(round.abs()をキーにMapへ振り分けるだけで、この時点では
 *    各ラウンド内のカードの並び順はまだ決まっていない)。
 * 2. その側の最初のラウンド(rounds[0])が「出場元カードを一切持たない
 *    leafなラウンド」で、かつ後続ラウンドが存在する場合:
 *    a. 1つ後のラウンド(rounds[1])を先に処理する。この時点ではまだ
 *       rounds[0]の位置が分かっていないため、出場元の平均が計算でき
 *       ず、結果としてidentifier順の連番(0,1,2,...)が仮の位置として
 *       割り当たる(通常ラウンド用のロジックがそのまま使えるため
 *       特別な分岐は不要)。この仮の並び順が「本来の対戦順」の基準になる
 *       (歯抜けが起きないラウンドなので信用できる)。
 *    b. rounds[1]の各対戦は、2つの入力(entrant1/entrant2Source)を
 *       持つ。rounds[1]でp番目(0始まり)の対戦は、rounds[0]側の
 *       「2p番目」「2p+1番目」の区画を予約する。その区画に対応する
 *       実在のラウンド1対戦カードがあれば、そのカードの位置を2p(また
 *       は2p+1)に確定する。対応する対戦カードが存在しない場合
 *       (BYE/シード由来)、その区画には何も配置しない(=歯抜けが
 *       正しく再現される。これが「Yの1人目に対応するRound1の対戦は
 *       存在しない」というケース)。
 *    c. rounds[1]の各対戦の位置を、いま確定した実在のラウンド1子の
 *       位置の平均で計算し直す(通常ラウンド同士の関係と同じ式)。
 *       出場元が2つとも実在しない対戦(両方BYE)は、平均を取る材料が
 *       ないため、予約region(2p, 2p+1)の中央(p+0.5)を使う(実在する
 *       対戦と縮尺を合わせるため)。
 *    d. どの対戦からも参照されていないラウンド1カードが万一残って
 *       いた場合(通常は起きない安全策)は、表示から漏れないよう
 *       identifier順で末尾に追加する。
 *    e. 以降のラウンド(3つ目以降)は、下記3と同じ「出場元の平均」の
 *       通常ロジックで処理する(rounds[1]の位置が確定しているので
 *       問題なく計算できる)。
 * 3. 上記の特別扱いが不要な場合(最初のラウンドが出場元カードを持つ
 *    ―敗者側第1ラウンドが勝者側からの"落ち"を出場元として持つ場合など
 *    ―、またはラウンドが1つしかない場合)は、ラウンドを昇順に処理し、
 *    各ラウンド内で「出場元カードの位置の平均」(出場元が解決できない
 *    場合はidentifier順の連番)によって位置を決める、という素直な
 *    ロジックを使う。
 * 4. 出場元カードが「同じ側」であれば、その2カードを結ぶ線(connectors)
 *    を1本作る。「別の側」(勝者側の敗者が敗者側に落ちる等)の場合は、
 *    Winners/Losersを別パネルとして表示するため線は引けない。代わりに
 *    文字での注記(crossSideOrigins)として返す(BracketBoard.tsx側で
 *    カード内にテキスト表示する)。
 *
 * ■ この先(呼び出し側)でやっていること
 * ここで計算するslot(ラウンド内での相対的な縦位置。平均値なので小数に
 * なりうる)とrounds(ラウンド番号の配列。何番目の列かを表す)は、あくまで
 * 「相対的な並び」であってpx座標ではない。実際の画面上のpx位置への変換
 * (列幅・行の高さを掛けて絶対配置のtop/leftにする)はBracketBoard.tsx側の
 * 役割。
 */
export function computeBracketLayout(
  matchCards: MatchCard[],
): BracketSideLayout[] {
  const grouped = groupBySideAndRound(matchCards);
  const cardById = new Map(matchCards.map((card) => [card.id, card]));
  const positionByMatchId = new Map<string, number>();
  const layouts: BracketSideLayout[] = [];

  for (const side of ["WINNERS", "LOSERS"] as const) {
    const roundsMap = grouped[side];
    const rounds = [...roundsMap.keys()].sort((a, b) => a - b);
    if (rounds.length === 0) continue;

    const matchesByRound = new Map<number, BracketMatchLayout[]>();
    const connectors: BracketConnector[] = [];
    const crossSideOrigins: BracketCrossSideOrigin[] = [];

    /** 通常ラウンドの処理: 出場元カードの位置の平均、解決できなければidentifier順の連番。 */
    function processRound(roundIndex: number): void {
      const round = rounds[roundIndex];
      const cardsInRound = [...(roundsMap.get(round) ?? [])].sort((a, b) =>
        compareIdentifiers(a.identifier, b.identifier),
      );
      const layoutForRound: BracketMatchLayout[] = [];
      let fallbackIndex = 0;

      for (const card of cardsInRound) {
        const sourceIds = [
          card.entrant1SourceMatchId,
          card.entrant2SourceMatchId,
        ].filter((id): id is string => id !== null);
        const resolvedPositions = sourceIds
          .map((id) => positionByMatchId.get(id))
          .filter((position): position is number => position !== undefined);

        const slot =
          resolvedPositions.length === 0
            ? fallbackIndex++
            : resolvedPositions.reduce((sum, p) => sum + p, 0) /
              resolvedPositions.length;

        positionByMatchId.set(card.id, slot);
        layoutForRound.push({ card, round, slot });

        for (const sourceId of sourceIds) {
          const sourceCard = cardById.get(sourceId);
          const sourcePosition = positionByMatchId.get(sourceId);
          if (!sourceCard || sourcePosition === undefined) continue;
          const sourceSide: BracketSide =
            sourceCard.bracketSide === "LOSERS" ? "LOSERS" : "WINNERS";
          if (sourceSide === side) {
            connectors.push({
              fromMatchId: sourceCard.id,
              fromRoundIndex: rounds.indexOf(Math.abs(sourceCard.round)),
              fromSlot: sourcePosition,
              toMatchId: card.id,
              toRoundIndex: roundIndex,
              toSlot: slot,
            });
          } else {
            crossSideOrigins.push({
              toMatchId: card.id,
              fromMatchId: sourceCard.id,
              fromIdentifier: sourceCard.identifier,
              fromSide: sourceSide,
            });
          }
        }
      }

      matchesByRound.set(round, layoutForRound);
    }

    /**
     * 最下段(rounds[0]、出場元カードを持たないleafなラウンド)の処理。
     * 1つ後のラウンド(rounds[nextRoundIndex]。呼び出し前にprocessRound
     * 済みで、identifier順の仮の連番が入っている)を基準に、その対戦が
     * 予約する2区画(2p, 2p+1)へ実在する対戦カードを割り当て、その後
     * 1つ後のラウンド自身の位置を実子の平均で計算し直す。
     */
    function processLeafRound(nextRoundIndex: number): void {
      const round = rounds[0];
      const nextRound = rounds[nextRoundIndex];
      const leafCards = roundsMap.get(round) ?? [];
      const leafCardsById = new Map(leafCards.map((card) => [card.id, card]));
      const nextRoundLayout = matchesByRound.get(nextRound) ?? [];
      const nextRoundLayoutById = new Map(
        nextRoundLayout.map((entry) => [entry.card.id, entry]),
      );
      const nextRoundCardsInOrder = [...nextRoundLayout]
        .sort((a, b) => a.slot - b.slot)
        .map((entry) => entry.card);

      const visited = new Set<string>();
      const layoutForLeaf: BracketMatchLayout[] = [];

      for (const [p, nextCard] of nextRoundCardsInOrder.entries()) {
        const reservations: Array<[string | null, number]> = [
          [nextCard.entrant1SourceMatchId, 2 * p],
          [nextCard.entrant2SourceMatchId, 2 * p + 1],
        ];
        for (const [sourceId, reservedSlot] of reservations) {
          if (!sourceId) continue;
          const sourceCard = leafCardsById.get(sourceId);
          if (!sourceCard) continue; // BYE/シード等、対応する対戦カードが存在しない区画
          visited.add(sourceCard.id);
          positionByMatchId.set(sourceCard.id, reservedSlot);
          layoutForLeaf.push({ card: sourceCard, round, slot: reservedSlot });
        }
      }

      // 想定外に、後続ラウンドのどのカードからも参照されていないカードが
      // 残っていた場合、表示から漏れないようフォールバックで追加する
      // (通常は発生しない安全策)。
      let fallbackIndex =
        layoutForLeaf.length > 0
          ? Math.max(...layoutForLeaf.map((entry) => entry.slot)) + 1
          : 0;
      const unreferenced = leafCards
        .filter((card) => !visited.has(card.id))
        .sort((a, b) => compareIdentifiers(a.identifier, b.identifier));
      for (const card of unreferenced) {
        const slot = fallbackIndex++;
        positionByMatchId.set(card.id, slot);
        layoutForLeaf.push({ card, round, slot });
      }

      layoutForLeaf.sort((a, b) => a.slot - b.slot);
      matchesByRound.set(round, layoutForLeaf);

      // 1つ後のラウンドの位置を、いま確定した実際のleaf側の位置を使って
      // 計算し直す(processRoundで入れた仮のidentifier順の連番を上書き)。
      for (const [p, nextCard] of nextRoundCardsInOrder.entries()) {
        const sourceIds = [
          nextCard.entrant1SourceMatchId,
          nextCard.entrant2SourceMatchId,
        ].filter((id): id is string => id !== null);
        const resolvedPositions = sourceIds
          .map((id) => positionByMatchId.get(id))
          .filter((position): position is number => position !== undefined);
        const recomputedSlot =
          resolvedPositions.length > 0
            ? resolvedPositions.reduce((sum, v) => sum + v, 0) /
              resolvedPositions.length
            : 2 * p + 0.5; // 出場元が両方BYE等で実在しない場合、予約区画[2p, 2p+1]の中央を使う
        positionByMatchId.set(nextCard.id, recomputedSlot);
        const layoutEntry = nextRoundLayoutById.get(nextCard.id);
        if (layoutEntry) layoutEntry.slot = recomputedSlot;
      }

      // leaf→1つ後のラウンドをつなぐ線を、確定した最終位置で作る。
      for (const leafEntry of layoutForLeaf) {
        const feedingNextCard = nextRoundCardsInOrder.find(
          (nextCard) =>
            nextCard.entrant1SourceMatchId === leafEntry.card.id ||
            nextCard.entrant2SourceMatchId === leafEntry.card.id,
        );
        if (!feedingNextCard) continue;
        const toSlot = positionByMatchId.get(feedingNextCard.id);
        if (toSlot === undefined) continue;
        connectors.push({
          fromMatchId: leafEntry.card.id,
          fromRoundIndex: 0,
          fromSlot: leafEntry.slot,
          toMatchId: feedingNextCard.id,
          toRoundIndex: nextRoundIndex,
          toSlot,
        });
      }
    }

    const firstRoundCards = roundsMap.get(rounds[0]) ?? [];
    const firstRoundIsLeaf =
      firstRoundCards.length > 0 &&
      firstRoundCards.every(
        (card) =>
          card.entrant1SourceMatchId === null &&
          card.entrant2SourceMatchId === null,
      );
    const deferFirstRound = firstRoundIsLeaf && rounds.length > 1;

    if (deferFirstRound) {
      processRound(1);
      processLeafRound(1);
      for (let roundIndex = 2; roundIndex < rounds.length; roundIndex++) {
        processRound(roundIndex);
      }
    } else {
      for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
        processRound(roundIndex);
      }
    }

    layouts.push({
      side,
      rounds,
      matchesByRound,
      connectors,
      crossSideOrigins,
    });
  }

  return layouts;
}
