import { describe, expect, it } from "vitest";
import { validateGrowLogInput } from "./validation";

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
});
