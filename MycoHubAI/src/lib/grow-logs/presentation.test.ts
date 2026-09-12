import { describe, expect, it } from "vitest";
import { createGrowLogPreview, formatGrowLogStage } from "./presentation";

describe("createGrowLogPreview", () => {
  it("returns short grow-log content unchanged", () => {
    expect(createGrowLogPreview("Healthy white growth around the inoculation point.")).toBe(
      "Healthy white growth around the inoculation point.",
    );
  });

  it("truncates long content to 160 characters including the ellipsis", () => {
    const preview = createGrowLogPreview("a".repeat(161));

    expect(preview).toBe(`${"a".repeat(157)}...`);
    expect(preview).toHaveLength(160);
  });

  it("does not split Unicode characters while truncating", () => {
    const preview = createGrowLogPreview("🍄".repeat(161));

    expect(Array.from(preview)).toHaveLength(160);
    expect(preview).toBe(`${"🍄".repeat(157)}...`);
  });
});

describe("formatGrowLogStage", () => {
  it.each([
    ["agar", "Agar"],
    ["grain", "Grain"],
  ] as const)("formats the %s stage label", (stage, expected) => {
    expect(formatGrowLogStage(stage)).toBe(expected);
  });
});
