export const RESULT_LABELS = ["ai-cr:passed", "ai-cr:failed", "ai-cr:error"] as const;
export type ResultLabel = (typeof RESULT_LABELS)[number];
export const LABEL_DETAILS: Record<ResultLabel | "ai-cr:review", { color: string; description: string }> = {
  "ai-cr:passed": { color: "0E8A16", description: "AI PR review passed its advisory policy." },
  "ai-cr:failed": { color: "D93F0B", description: "AI PR review found advisory issues." },
  "ai-cr:error": { color: "B60205", description: "AI PR review automation failed." },
  "ai-cr:review": { color: "1D76DB", description: "Request an AI PR review retry." },
};
export function labelForStatus(status: "passed" | "failed" | "error"): ResultLabel {
  return `ai-cr:${status}`;
}
export function reconcileLabels(current: readonly string[], target: ResultLabel, retry: boolean) {
  const remove = current.filter((label) => (RESULT_LABELS as readonly string[]).includes(label) && label !== target);
  if (retry && current.includes("ai-cr:review")) remove.push("ai-cr:review");
  return { remove, add: current.includes(target) ? [] : [target] };
}
