import { describe, expect, it } from "vitest";
import { validateBulkSelectedGrowLogIds, validateGrowLogInput } from "./validation";

describe("validateGrowLogInput", () => {
  it("accepts the supported stages and trims text fields", () => {
    const result = validateGrowLogInput({
      stage: "agar",
      title: "  First plate  ",
      body: "  Dense growth  ",
    });

    expect(result).toEqual({
      success: true,
      data: {
        stage: "agar",
        title: "First plate",
        body: "Dense growth",
      },
    });
  });

  it("accepts grain as a supported stage", () => {
    const result = validateGrowLogInput({
      stage: "grain",
      title: "Jar 1",
      body: "Colonizing well",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported stages", () => {
    const result = validateGrowLogInput({
      stage: "fruiting",
      title: "Tray",
      body: "Too early for this scope",
    });

    expect(result).toEqual({
      success: false,
      errors: [{ field: "stage", message: "Stage must be agar or grain." }],
    });
  });

  it("rejects blank title and body after trimming", () => {
    const result = validateGrowLogInput({
      stage: "agar",
      title: "   ",
      body: "\n\t",
    });

    expect(result).toEqual({
      success: false,
      errors: [
        { field: "title", message: "Title is required." },
        { field: "body", message: "Body is required." },
      ],
    });
  });

  it("accepts title and body values at their Unicode code-point limits", () => {
    const result = validateGrowLogInput({
      stage: "agar",
      title: "🍄".repeat(160),
      body: "🍄".repeat(8_000),
    });

    expect(result.success).toBe(true);
  });

  it("rejects title and body values one Unicode code point over their limits", () => {
    const result = validateGrowLogInput({
      stage: "grain",
      title: "🍄".repeat(161),
      body: "🍄".repeat(8_001),
    });

    expect(result).toEqual({
      success: false,
      errors: [
        { field: "title", message: "Title must be 160 characters or fewer." },
        { field: "body", message: "Body must be 8000 characters or fewer." },
      ],
    });
  });
});

describe("validateBulkSelectedGrowLogIds", () => {
  it("returns unique valid ids in insertion order", () => {
    const result = validateBulkSelectedGrowLogIds([
      "550e8400-e29b-41d4-a716-446655440000",
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440000",
    ]);

    expect(result).toEqual({
      success: true,
      data: ["550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001"],
    });
  });

  it("ignores empty and malformed values", () => {
    const result = validateBulkSelectedGrowLogIds(["", "not-a-uuid", " 550e8400-e29b-41d4-a716-446655440002 ", null]);

    expect(result).toEqual({
      success: true,
      data: ["550e8400-e29b-41d4-a716-446655440002"],
    });
  });

  it("fails when no valid ids remain", () => {
    const result = validateBulkSelectedGrowLogIds(["", "still-not-a-uuid", undefined]);

    expect(result).toEqual({
      success: false,
    });
  });

  it("rejects more than 100 valid ids after malformed values and duplicates are removed", () => {
    const validIds = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    );

    expect(validateBulkSelectedGrowLogIds(["bad-id", ...validIds.slice(0, 100), validIds[0]])).toEqual({
      success: true,
      data: validIds.slice(0, 100),
    });
    expect(validateBulkSelectedGrowLogIds(["bad-id", ...validIds, validIds[0]])).toEqual({ success: false });
  });
});
