import type { MouseEvent } from "react";
import type { HelpBlock, HelpInline } from "../domain/rules/helpMarkdown.js";
import { parseHelpMarkdown } from "../domain/rules/helpMarkdown.js";

interface HelpMarkdownProps {
  text: string;
}

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/** 見出しレベルを1段深くする(モーダルのタイトル(h2)と衝突させないため)。 */
function shiftedHeadingTag(level: number) {
  const clamped = Math.min(6, level + 1);
  return HEADING_TAGS[clamped - 1];
}

function scrollToAnchor(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderInline(inline: HelpInline[]) {
  return inline.map((node, index) => {
    if (node.type === "bold")
      // biome-ignore lint/suspicious/noArrayIndexKey: インライン要素はテキストからの再構築ごとに再生成され、一意なIDも順序変化もないため。
      return <strong key={index}>{node.text}</strong>;
    // biome-ignore lint/suspicious/noArrayIndexKey: インライン要素はテキストからの再構築ごとに再生成され、一意なIDも順序変化もないため。
    if (node.type === "code") return <code key={index}>{node.text}</code>;
    if (node.type === "link") {
      const isInternal = node.href.startsWith("#");
      return (
        <a
          // biome-ignore lint/suspicious/noArrayIndexKey: インライン要素はテキストからの再構築ごとに再生成され、一意なIDも順序変化もないため。
          key={index}
          href={node.href}
          target={isInternal ? undefined : "_blank"}
          rel={isInternal ? undefined : "noreferrer"}
          onClick={
            isInternal
              ? (event) => scrollToAnchor(event, node.href.slice(1))
              : undefined
          }
        >
          {node.text}
        </a>
      );
    }
    return node.text;
  });
}

function renderBlock(block: HelpBlock, index: number) {
  if (block.type === "heading") {
    const Tag = shiftedHeadingTag(block.level);
    return (
      <Tag key={index} id={block.id}>
        {renderInline(block.inline)}
      </Tag>
    );
  }
  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag key={index}>
        {block.items.map((item, itemIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 項目自体に一意なIDがなく、順序も変わらないため。
          <li key={itemIndex}>{renderInline(item)}</li>
        ))}
      </ListTag>
    );
  }
  if (block.type === "table") {
    return (
      <table key={index} className="app-table">
        <thead>
          <tr>
            {block.header.map((cell, cellIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 列自体に一意なIDがなく、順序も変わらないため。
              <th key={cellIndex}>{renderInline(cell)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 行自体に一意なIDがなく、順序も変わらないため。
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 列自体に一意なIDがなく、順序も変わらないため。
                <td key={cellIndex}>{renderInline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <p key={index}>{renderInline(block.inline)}</p>;
}

/**
 * ヘルプ本文(docs/usage.md)をMarkdownとして解釈して表示する。
 * parseHelpMarkdown()が構造化したブロックをそのままJSXへ渡すだけなので
 * (`dangerouslySetInnerHTML`を使わない)、Reactの既定のエスケープにより
 * XSSのリスクを増やさない(NoticeMarkdownと同じ方針)。
 */
export function HelpMarkdown({ text }: HelpMarkdownProps) {
  // レベル1見出し(文書全体のタイトル)は、呼び出し側のモーダルタイトルと
  // 重複するため表示しない。
  const blocks = parseHelpMarkdown(text).filter(
    (block) => !(block.type === "heading" && block.level === 1),
  );
  return (
    <div className="help-markdown">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}
