import { describe, expect, it } from "vitest";
import {
  parseHelpMarkdown,
  slugifyHeading,
} from "../../../../src/domain/rules/helpMarkdown.js";

describe("slugifyHeading", () => {
  it("matches the hand-written anchors in docs/usage.md's table of contents", () => {
    expect(slugifyHeading("全体の流れ")).toBe("全体の流れ");
    expect(slugifyHeading("注意事項の確認(起動時)")).toBe(
      "注意事項の確認起動時",
    );
    expect(slugifyHeading("事前準備: 管理画面での初期化")).toBe(
      "事前準備-管理画面での初期化",
    );
    expect(slugifyHeading("start.gg同期について")).toBe("startgg同期について");
    expect(slugifyHeading("プレビューモード(ブラケット未開始)")).toBe(
      "プレビューモードブラケット未開始",
    );
  });
});

describe("parseHelpMarkdown", () => {
  it("parses a heading with an id derived from its text", () => {
    expect(parseHelpMarkdown("## 次戦候補")).toEqual([
      {
        type: "heading",
        level: 2,
        id: "次戦候補",
        inline: [{ type: "text", text: "次戦候補" }],
      },
    ]);
  });

  it("parses bold, code, and link inline markup within a paragraph", () => {
    expect(
      parseHelpMarkdown(
        "**太字** と `コード` と [リンク](https://example.com) です",
      ),
    ).toEqual([
      {
        type: "paragraph",
        inline: [
          { type: "bold", text: "太字" },
          { type: "text", text: " と " },
          { type: "code", text: "コード" },
          { type: "text", text: " と " },
          { type: "link", text: "リンク", href: "https://example.com" },
          { type: "text", text: " です" },
        ],
      },
    ]);
  });

  it("parses an unordered list", () => {
    expect(parseHelpMarkdown("- one\n- two")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", text: "one" }],
          [{ type: "text", text: "two" }],
        ],
      },
    ]);
  });

  it("parses an ordered list", () => {
    expect(parseHelpMarkdown("1. one\n2. two")).toEqual([
      {
        type: "list",
        ordered: true,
        items: [
          [{ type: "text", text: "one" }],
          [{ type: "text", text: "two" }],
        ],
      },
    ]);
  });

  it("merges a wrapped continuation line into the previous list item", () => {
    expect(parseHelpMarkdown("- one\n  more text")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [[{ type: "text", text: "one more text" }]],
      },
    ]);
  });

  it("merges a nested bullet under an ordered item, stripping its marker", () => {
    expect(parseHelpMarkdown("1. one\n   - nested\n2. two")).toEqual([
      {
        type: "list",
        ordered: true,
        items: [
          [{ type: "text", text: "one nested" }],
          [{ type: "text", text: "two" }],
        ],
      },
    ]);
  });

  it("parses a table with a header, separator, and rows", () => {
    expect(
      parseHelpMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |"),
    ).toEqual([
      {
        type: "table",
        header: [[{ type: "text", text: "A" }], [{ type: "text", text: "B" }]],
        rows: [
          [[{ type: "text", text: "1" }], [{ type: "text", text: "2" }]],
          [[{ type: "text", text: "3" }], [{ type: "text", text: "4" }]],
        ],
      },
    ]);
  });

  it("joins wrapped paragraph lines with a space", () => {
    expect(parseHelpMarkdown("line one\nline two\n\nsecond paragraph")).toEqual(
      [
        {
          type: "paragraph",
          inline: [{ type: "text", text: "line one line two" }],
        },
        {
          type: "paragraph",
          inline: [{ type: "text", text: "second paragraph" }],
        },
      ],
    );
  });

  it("returns an empty array for an empty string", () => {
    expect(parseHelpMarkdown("")).toEqual([]);
  });
});
