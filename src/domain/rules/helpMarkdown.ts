export type HelpInline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type HelpBlock =
  | {
      type: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      id: string;
      inline: HelpInline[];
    }
  | { type: "paragraph"; inline: HelpInline[] }
  | { type: "list"; ordered: boolean; items: HelpInline[][] }
  | { type: "table"; header: HelpInline[][]; rows: HelpInline[][][] };

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const UNORDERED_ITEM_PATTERN = /^[-*]\s+(.*)$/;
const ORDERED_ITEM_PATTERN = /^\d+\.\s+(.*)$/;
const TABLE_ROW_PATTERN = /^\|(.+)\|$/;
const TABLE_SEPARATOR_PATTERN = /^[-:|\s]+$/;
// ユーザーフィードバック(2026-11-09): URLがクリックできなかったため、
// [テキスト](url)に加えて、自動リンク(<https://...>)と地の文に書いた
// URL(https://...)もリンクにする。地の文のURLは、日本語の文に続けて
// 書かれても区切れるよう、URLに使えるASCII文字だけを対象にする。
const INLINE_PATTERN =
  /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|<(https?:\/\/[^\s<>]+)>|(https?:\/\/[A-Za-z0-9\-._~:/?#@!$&'*+,;=%]+)/g;
/** 地の文のURLの末尾に付いた句読点は、URLに含めず文の一部として残す。 */
const URL_TRAILING_PUNCTUATION = /[.,;:!?']+$/;

/**
 * GitHubのMarkdownビューアが見出しから目次アンカーを生成する規則を
 * 簡易的に再現する(小文字化・約物の除去・空白のハイフン化)。
 * docs/usage.mdの「## 目次」セクションは、このアンカー生成規則を前提に
 * 手書きされているため、この関数の出力とdocs/usage.md側のリンクは
 * 一致させる必要がある(ズレるとヘルプ内リンクが機能しなくなる)。
 */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[():,.!?"'`]/g, "")
    .replace(/\s+/g, "-");
}

function parseInline(text: string): HelpInline[] {
  const inline: HelpInline[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) {
      inline.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      inline.push({ type: "bold", text: match[1] });
    } else if (match[2] !== undefined) {
      inline.push({ type: "code", text: match[2] });
    } else if (match[3] !== undefined && match[4] !== undefined) {
      inline.push({ type: "link", text: match[3], href: match[4] });
    } else if (match[5] !== undefined) {
      inline.push({ type: "link", text: match[5], href: match[5] });
    } else if (match[6] !== undefined) {
      const url = match[6].replace(URL_TRAILING_PUNCTUATION, "");
      inline.push({ type: "link", text: url, href: url });
      lastIndex = match.index + url.length;
      continue;
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    inline.push({ type: "text", text: text.slice(lastIndex) });
  }
  return inline;
}

/**
 * 折り返した行同士をつなぐ。ユーザーフィードバック(2026-11-09): 常に
 * 半角スペースでつないでいたため、日本語の文の途中に不自然な空白が
 * 入っていた。つなぎ目の両側が日本語(全角文字)のときは空白を入れない。
 */
function joinWrappedLine(previous: string, next: string): string {
  const isWide = (char: string | undefined) =>
    char !== undefined && char.charCodeAt(0) > 0x7f;
  const separator = isWide(previous.at(-1)) && isWide(next.at(0)) ? "" : " ";
  return previous + separator + next;
}

/** 継続行(前の項目の折り返し)としてマージする際、先頭のリスト記号を取り除く。 */
function stripLeadingMarker(line: string): string {
  return line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
}

function splitTableRow(line: string): HelpInline[][] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => parseInline(cell.trim()));
}

function isTableStart(lines: string[], index: number): boolean {
  if (!TABLE_ROW_PATTERN.test(lines[index])) return false;
  const next = lines[index + 1];
  return next !== undefined && TABLE_SEPARATOR_PATTERN.test(next.trim());
}

/**
 * docs/usage.md(アプリ内ヘルプ)向けの簡易Markdownパーサー。
 * 見出し・段落・箇条書き(順序あり/なし)・テーブルと、インライン装飾
 * (**太字**・`コード`・[リンク](url)・<url>・地の文のURL)に対応する。CommonMark全体には
 * 対応せず、実際にdocs/usage.mdで使う範囲に絞る(HTMLへ変換して
 * `dangerouslySetInnerHTML`するのではなく、構造化したブロックをReact側で
 * エスケープ付きでそのまま描画できるようにするのが目的。noticeMarkdown.ts
 * と同じ方針)。
 */
export function parseHelpMarkdown(markdown: string): HelpBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: HelpBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    const headingMatch = HEADING_PATTERN.exec(trimmed);
    if (headingMatch) {
      const headingText = headingMatch[2].trim();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        id: slugifyHeading(headingText),
        inline: parseInline(headingText),
      });
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitTableRow(trimmed);
      i += 2;
      const rows: HelpInline[][][] = [];
      while (i < lines.length && TABLE_ROW_PATTERN.test(lines[i].trim())) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const isOrdered = ORDERED_ITEM_PATTERN.test(trimmed);
    const isUnordered = UNORDERED_ITEM_PATTERN.test(trimmed);
    if (isOrdered || isUnordered) {
      const ordered = isOrdered;
      const pattern = ordered ? ORDERED_ITEM_PATTERN : UNORDERED_ITEM_PATTERN;
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i].trim();
        if (current === "") break;
        const itemMatch = pattern.exec(current);
        if (itemMatch) {
          items.push(itemMatch[1]);
          i++;
        } else if (HEADING_PATTERN.test(current) || isTableStart(lines, i)) {
          break;
        } else if (items.length > 0) {
          // 折り返し行、またはネストした別種の箇条書き(この簡易パーサーは
          // 真のネストに対応しないため、前の項目へ地の文として統合する)。
          items[items.length - 1] = joinWrappedLine(
            items[items.length - 1],
            stripLeadingMarker(current),
          );
          i++;
        } else {
          break;
        }
      }
      blocks.push({
        type: "list",
        ordered,
        items: items.map((item) => parseInline(item)),
      });
      continue;
    }

    const paragraphLines = [trimmed];
    i++;
    while (i < lines.length) {
      const current = lines[i].trim();
      if (current === "") break;
      if (HEADING_PATTERN.test(current)) break;
      if (
        UNORDERED_ITEM_PATTERN.test(current) ||
        ORDERED_ITEM_PATTERN.test(current)
      )
        break;
      if (isTableStart(lines, i)) break;
      paragraphLines.push(current);
      i++;
    }
    blocks.push({
      type: "paragraph",
      inline: parseInline(paragraphLines.reduce(joinWrappedLine)),
    });
  }

  return blocks;
}
