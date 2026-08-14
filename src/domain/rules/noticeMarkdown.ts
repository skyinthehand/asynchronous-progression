export type NoticeBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM_PATTERN = /^[-*]\s+(.*)$/;

/**
 * ユーザーフィードバック(2026-08-15): start.gg側のEvent.rulesMarkdownは
 * 単純な文字列(Markdown記法)として返ってくるため、見出し(`#`〜`######`)
 * ・箇条書き(`-`/`*`)・段落を持つ簡易的な構造に分解する。リンク画像等の
 * 複雑なMarkdown構文までは対応せず、実際に運営が書く注意事項(見出し+
 * 箇条書き)で必要十分な範囲に絞る(HTMLへ変換して`dangerouslySetInnerHTML`
 * するのではなく、構造化したブロックをReact側でエスケープ付きでそのまま
 * 描画できるようにするのが目的)。
 */
export function parseNoticeMarkdown(markdown: string): NoticeBlock[] {
  const blocks: NoticeBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
      paragraphLines = [];
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({ type: "list", items: listItems });
      listItems = [];
    }
  }

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    const headingMatch = HEADING_PATTERN.exec(line);
    const listMatch = LIST_ITEM_PATTERN.exec(line);

    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: headingMatch[2].trim(),
      });
    } else if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1].trim());
    } else if (line === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
