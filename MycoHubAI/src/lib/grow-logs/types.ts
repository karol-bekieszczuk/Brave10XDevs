export const GROW_LOG_STAGES = ["agar", "grain"] as const;

export type GrowLogStage = (typeof GROW_LOG_STAGES)[number];

export interface GrowLogRow {
  id: string;
  ownerId: string;
  stage: GrowLogStage;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGrowLogInput {
  stage: GrowLogStage;
  title: string;
  body: string;
}

export type UpdateGrowLogInput = Partial<CreateGrowLogInput>;

export function isGrowLogStage(value: unknown): value is GrowLogStage {
  return typeof value === "string" && GROW_LOG_STAGES.includes(value as GrowLogStage);
}
