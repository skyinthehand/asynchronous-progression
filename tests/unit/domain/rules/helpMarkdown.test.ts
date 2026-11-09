import { describe, expect, it } from "vitest";
import usageGuide from "../../../../docs/usage.md?raw";
import {
  parseHelpMarkdown,
  slugifyHeading,
} from "../../../../src/domain/rules/helpMarkdown.js";

describe("slugifyHeading", () => {
  it("follows GitHub's anchor rules (lowercase, drop punctuation, spaces to hyphens)", () => {
    expect(slugifyHeading("注意事項の確認(起動時)")).toBe(
      "注意事項の確認起動時",
    );
    expect(slugifyHeading("事前準備: 管理画面での初期化")).toBe(
      "事前準備-管理画面での初期化",
    );
    expect(slugifyHeading("start.gg同期について")).toBe("startgg同期について");
  });

  it("resolves every in-page link in docs/usage.md to a heading (table of contents)", () => {
    const blocks = parseHelpMarkdown(usageGuide);
    const headingIds = new Set(
      blocks.flatMap((block) => (block.type === "heading" ? [block.id] : [])),
    );
    const anchors = blocks.flatMap((block) => {
      const inlines =
        block.type === "list"
          ? block.items.flat()
          : block.type === "paragraph"
            ? block.inline
            : [];
      return inlines.flatMap((node) =>
        node.type === "link" && node.href.startsWith("#")
          ? [node.href.slice(1)]
          : [],
      );
    });
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(headingIds).toContain(anchor);
    }
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

  it("turns <https://...> autolinks and bare URLs into links (2026-11-09: URLs were not clickable)", () => {
    expect(
      parseHelpMarkdown(
        "対象URL: <https://example.com/app/> と https://example.com/a?b=1。",
      ),
    ).toEqual([
      {
        type: "paragraph",
        inline: [
          { type: "text", text: "対象URL: " },
          {
            type: "link",
            text: "https://example.com/app/",
            href: "https://example.com/app/",
          },
          { type: "text", text: " と " },
          {
            type: "link",
            text: "https://example.com/a?b=1",
            href: "https://example.com/a?b=1",
          },
          { type: "text", text: "。" },
        ],
      },
    ]);
  });

  it("leaves trailing ASCII punctuation outside a bare URL", () => {
    expect(parseHelpMarkdown("See https://example.com.")).toEqual([
      {
        type: "paragraph",
        inline: [
          { type: "text", text: "See " },
          {
            type: "link",
            text: "https://example.com",
            href: "https://example.com",
          },
          { type: "text", text: "." },
        ],
      },
    ]);
  });

  it("joins wrapped Japanese lines without inserting a space (2026-11-09)", () => {
    expect(parseHelpMarkdown("日本語の文が\n途中で折り返す")).toEqual([
      {
        type: "paragraph",
        inline: [{ type: "text", text: "日本語の文が途中で折り返す" }],
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
