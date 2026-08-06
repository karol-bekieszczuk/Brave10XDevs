import type { SupabaseClient } from "@supabase/supabase-js";

export const DIAGNOSIS_RATE_LIMIT_MESSAGE = "Diagnosis requests are temporarily limited. Try again later.";

export type DiagnosisAdmissionClient = Pick<SupabaseClient, "rpc">;

export type DiagnosisAdmission = { admitted: true; claimId: string } | { admitted: false; retryAfterSeconds: number };

interface AdmissionRow {
  admitted: boolean;
  retry_after_seconds: number;
}

interface AdmissionRpcResult {
  data: unknown;
  error: unknown;
}

export function normalizeDiagnosisQuestion(question: string) {
  return question.trim().replace(/\s+/gu, " ");
}

function encodeFingerprintPart(value: string) {
  return `${new TextEncoder().encode(value).byteLength}:${value}`;
}

export async function createDiagnosisFingerprint(ownerId: string, growLogId: string, question: string) {
  const material = [ownerId, growLogId, normalizeDiagnosisQuestion(question)].map(encodeFingerprintPart).join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function acquireDiagnosisAdmission(
  client: DiagnosisAdmissionClient,
  ownerId: string,
  growLogId: string,
  question: string,
): Promise<DiagnosisAdmission> {
  const claimId = crypto.randomUUID();
  const fingerprint = await createDiagnosisFingerprint(ownerId, growLogId, question);
  const { data, error } = (await client.rpc("claim_diagnosis_admission", {
    p_claim_id: claimId,
    p_fingerprint: fingerprint,
  })) as unknown as AdmissionRpcResult;

  if (error) {
    throw new Error("Diagnosis admission RPC failed.", { cause: error });
  }

  const row = (Array.isArray(data) ? data[0] : data) as AdmissionRow | null;

  if (!row || typeof row.admitted !== "boolean" || !Number.isInteger(row.retry_after_seconds)) {
    throw new Error("Invalid diagnosis admission response.");
  }

  return row.admitted
    ? { admitted: true, claimId }
    : { admitted: false, retryAfterSeconds: Math.max(1, row.retry_after_seconds) };
}

export async function releaseDiagnosisAdmission(client: DiagnosisAdmissionClient, claimId: string) {
  const { error } = await client.rpc("release_diagnosis_admission", { p_claim_id: claimId });

  if (error) {
    throw error;
  }
}
