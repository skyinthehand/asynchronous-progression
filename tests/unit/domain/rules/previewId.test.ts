import { describe, expect, it } from "vitest";
import { isPreviewSetId } from "../../../../src/domain/rules/previewId.js";

describe("isPreviewSetId", () => {
  it("recognizes start.gg's synthetic preview_{phaseGroupId}_{round}_{index} ids", () => {
    expect(isPreviewSetId("preview_3068263_1_0")).toBe(true);
    expect(isPreviewSetId("preview_3068263_-2_3")).toBe(true);
  });

  it("does not treat a real numeric-string set id as a preview id", () => {
    expect(isPreviewSetId("5000")).toBe(false);
  });

  it("does not treat an arbitrary local id (no trailing _round_index) as a preview id", () => {
    expect(isPreviewSetId("card-1")).toBe(false);
    expect(isPreviewSetId("R1-1")).toBe(false);
  });
});
