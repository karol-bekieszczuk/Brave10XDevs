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
  it("converges every stale result-label combination to exactly one target", () => {
    const resultLabels = ["ai-cr:passed", "ai-cr:failed", "ai-cr:error"] as const;
    const resultLabelSet = new Set<string>(resultLabels);
    for (const target of resultLabels) {
      for (let mask = 0; mask < 1 << resultLabels.length; mask += 1) {
        const existing = ["bug", ...resultLabels.filter((_, index) => (mask & (1 << index)) !== 0)];
        const changes = reconcileLabels(existing, target, false);
        const removed = new Set<string>(changes.remove);
        const reconciled = existing.filter((label) => !removed.has(label)).concat(changes.add);

        expect(reconciled.filter((label) => resultLabelSet.has(label))).toEqual([target]);
        expect(reconciled).toContain("bug");
      }
    }
  });
});
