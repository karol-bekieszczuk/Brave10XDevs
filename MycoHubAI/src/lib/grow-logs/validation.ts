import type { CreateGrowLogInput } from "@/lib/grow-logs/types";
import { isGrowLogStage } from "@/lib/grow-logs/types";

type GrowLogValidationField = keyof CreateGrowLogInput;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BULK_DELETE_SELECTED_IDS_FIELD = "selectedLogIds";
export const GROW_LOG_TITLE_MAX_LENGTH = 160;
export const GROW_LOG_BODY_MAX_LENGTH = 8_000;
export const BULK_DELETE_MAX_IDS = 100;

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

export type BulkSelectedIdsResult =
  | {
      success: true;
      data: string[];
    }
  | {
      success: false;
    };

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuidLike(value: string) {
  return UUID_PATTERN.test(value);
}

function countCodePoints(value: string) {
  return Array.from(value).length;
}

export function isValidGrowLogId(value: unknown) {
  return isUuidLike(normalizeText(value));
}

export function validateGrowLogInput(input: RawGrowLogInput): GrowLogValidationResult {
  const stage = input.stage;
  const title = normalizeText(input.title);
  const body = normalizeText(input.body);
  const errors: GrowLogValidationError[] = [];

  if (!isGrowLogStage(stage)) {
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
  } else if (countCodePoints(title) > GROW_LOG_TITLE_MAX_LENGTH) {
    errors.push({
      field: "title",
      message: "Title must be 160 characters or fewer.",
    });
  }

  if (body.length === 0) {
    errors.push({
      field: "body",
      message: "Body is required.",
    });
  } else if (countCodePoints(body) > GROW_LOG_BODY_MAX_LENGTH) {
    errors.push({
      field: "body",
      message: "Body must be 8000 characters or fewer.",
    });
  }

  if (errors.length > 0 || !isGrowLogStage(stage)) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    data: {
      stage,
      title,
      body,
    },
  };
}

export function validateBulkSelectedGrowLogIds(values: Iterable<unknown>): BulkSelectedIdsResult {
  const ids = Array.from(
    new Set(
      Array.from(values, (value) => normalizeText(value)).filter((value) => value.length > 0 && isUuidLike(value)),
    ),
  );

  if (ids.length === 0 || ids.length > BULK_DELETE_MAX_IDS) {
    return {
      success: false,
    };
  }

  return {
    success: true,
    data: ids,
  };
}
