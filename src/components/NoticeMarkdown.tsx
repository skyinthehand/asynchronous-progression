import { parseNoticeMarkdown } from "../domain/rules/noticeMarkdown.js";

interface NoticeMarkdownProps {
  text: string;
}

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/**
 * 注意事項(start.gg Event.rulesMarkdown)をMarkdownとして解釈して表示する。
 * parseNoticeMarkdown()が構造化したブロックをそのままJSXへ渡すだけなので
 * (`dangerouslySetInnerHTML`を使わない)、Reactの既定のエスケープにより
 * XSSのリスクを増やさない。
 */
export function NoticeMarkdown({ text }: NoticeMarkdownProps) {
  const blocks = parseNoticeMarkdown(text);
  return (
    <div className="notice-body">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Tag = HEADING_TAGS[block.level - 1];
          // biome-ignore lint/suspicious/noArrayIndexKey: ブロックはtextからの再構築ごとに再生成され、一意なIDも順序変化もないため。
          return <Tag key={index}>{block.text}</Tag>;
        }
        if (block.type === "list") {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: ブロックはtextからの再構築ごとに再生成され、一意なIDも順序変化もないため。
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 項目自体に一意なIDがなく、順序も変わらないため。
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        // biome-ignore lint/suspicious/noArrayIndexKey: ブロックはtextからの再構築ごとに再生成され、一意なIDも順序変化もないため。
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}
