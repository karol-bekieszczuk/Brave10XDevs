import type { CreateGrowLogInput } from "@/lib/grow-logs/types";
import { isGrowLogStage } from "@/lib/grow-logs/types";

type GrowLogValidationField = keyof CreateGrowLogInput;

export interface GrowLogValidationError {
  field: GrowLogValidationField;
  message: string;
}

export type GrowLogValidationResult =
  | {
      success: true;
      data: CreateGrowLogInput;
    }
  | {
      success: false;
      errors: GrowLogValidationError[];
    };

export interface RawGrowLogInput {
  stage: unknown;
  title: unknown;
  body: unknown;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateGrowLogInput(input: RawGrowLogInput): GrowLogValidationResult {
  const title = normalizeText(input.title);
  const body = normalizeText(input.body);
  const errors: GrowLogValidationError[] = [];

  if (!isGrowLogStage(input.stage)) {
    errors.push({
      field: "stage",
      message: "Stage must be agar or grain.",
    });
  }

  if (title.length === 0) {
    errors.push({
      field: "title",
      message: "Title is required.",
    });
  }

  if (body.length === 0) {
    errors.push({
      field: "body",
      message: "Body is required.",
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    data: {
      stage: input.stage,
      title,
      body,
    },
  };
}
