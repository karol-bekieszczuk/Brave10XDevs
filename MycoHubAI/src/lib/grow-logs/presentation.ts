import type { GrowLogStage } from "./types";

const PREVIEW_MAX_LENGTH = 160;
const PREVIEW_ELLIPSIS = "...";

export function createGrowLogPreview(body: string): string {
  const characters = Array.from(body);

  if (characters.length <= PREVIEW_MAX_LENGTH) {
    return body;
  }

  return `${characters.slice(0, PREVIEW_MAX_LENGTH - PREVIEW_ELLIPSIS.length).join("")}${PREVIEW_ELLIPSIS}`;
}

export function formatGrowLogStage(stage: GrowLogStage): string {
  switch (stage) {
    case "agar":
      return "Agar";
    case "grain":
      return "Grain";
  }
}
