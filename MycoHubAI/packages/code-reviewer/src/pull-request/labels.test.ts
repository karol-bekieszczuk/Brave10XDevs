import { describe, expect, it } from "vitest";
import { reconcileLabels } from "./labels.js";
describe("label reconciliation", () => {
  it("converges only result and retry labels while retaining unrelated labels", () => {
    expect(reconcileLabels(["bug", "ai-cr:passed", "ai-cr:review"], "ai-cr:failed", true)).toEqual({
      remove: ["ai-cr:passed", "ai-cr:review"],
      add: ["ai-cr:failed"],
    });
  });
  it("does not churn an already correct result", () => {
    expect(reconcileLabels(["ai-cr:passed", "bug"], "ai-cr:passed", false)).toEqual({ remove: [], add: [] });
  });
});
