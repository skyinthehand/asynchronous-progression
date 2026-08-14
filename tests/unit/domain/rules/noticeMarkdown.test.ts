import { describe, expect, it } from "vitest";
import { parseNoticeMarkdown } from "../../../../src/domain/rules/noticeMarkdown.js";

describe("parseNoticeMarkdown", () => {
  it("parses the real-world sample (H1 heading + bullet list) reported by the user (2026-08-15)", () => {
    const markdown = [
      "# プール進行注意事項",
      "- プール進行は基本的にプール内第一シードの選手が行います",
      "- 第一シードの選手が海外選手だった場合は第二シードの選手が進行する場合があります",
      "- シードの高い選手が海外選手だった場合は同様です",
      "- DQ（失格）タイミングは運営からのアナウンスをお待ちください",
      "- プールを離れる場合は離席記録に登録してください",
      "- プールに戻った場合は離席記録を更新してください",
    ].join("\n");

    expect(parseNoticeMarkdown(markdown)).toEqual([
      { type: "heading", level: 1, text: "プール進行注意事項" },
      {
        type: "list",
        items: [
          "プール進行は基本的にプール内第一シードの選手が行います",
          "第一シードの選手が海外選手だった場合は第二シードの選手が進行する場合があります",
          "シードの高い選手が海外選手だった場合は同様です",
          "DQ（失格）タイミングは運営からのアナウンスをお待ちください",
          "プールを離れる場合は離席記録に登録してください",
          "プールに戻った場合は離席記録を更新してください",
        ],
      },
    ]);
  });

  it("supports heading levels 1-6", () => {
    const markdown = "# H1\n## H2\n###### H6";
    expect(parseNoticeMarkdown(markdown)).toEqual([
      { type: "heading", level: 1, text: "H1" },
      { type: "heading", level: 2, text: "H2" },
      { type: "heading", level: 6, text: "H6" },
    ]);
  });

  it("supports '*' as a bullet marker in addition to '-'", () => {
    expect(parseNoticeMarkdown("* item")).toEqual([
      { type: "list", items: ["item"] },
    ]);
  });

  it("joins consecutive plain-text lines into a single paragraph, separated by blank lines", () => {
    const markdown = "line one\nline two\n\nsecond paragraph";
    expect(parseNoticeMarkdown(markdown)).toEqual([
      { type: "paragraph", text: "line one line two" },
      { type: "paragraph", text: "second paragraph" },
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseNoticeMarkdown("")).toEqual([]);
  });

  it("starts a new list when a paragraph interrupts two bullet groups", () => {
    const markdown = "- a\n- b\nsome text\n- c";
    expect(parseNoticeMarkdown(markdown)).toEqual([
      { type: "list", items: ["a", "b"] },
      { type: "paragraph", text: "some text" },
      { type: "list", items: ["c"] },
    ]);
  });
});
