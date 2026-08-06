import { describe, expect, it, vi } from "vitest";
import {
  acquireDiagnosisAdmission,
  createDiagnosisFingerprint,
  normalizeDiagnosisQuestion,
  releaseDiagnosisAdmission,
} from "./admission";

describe("diagnosis admission boundary", () => {
  it("normalizes whitespace and hashes only opaque, length-delimited input", async () => {
    expect(normalizeDiagnosisQuestion("  Is\n this   okay?  ")).toBe("Is this okay?");
    const normalized = await createDiagnosisFingerprint("owner-1", "log-1", "  Is\n this   okay?  ");
    const canonical = await createDiagnosisFingerprint("owner-1", "log-1", "Is this okay?");

    expect(normalized).toBe(canonical);
    expect(normalized).toMatch(/^[0-9a-f]{64}$/);
    expect(normalized).not.toContain("owner-1");
    expect(normalized).not.toContain("okay");
  });

  it("maps an admitted RPC row to an opaque local claim", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ admitted: true, retry_after_seconds: 0 }], error: null });
    const result = await acquireDiagnosisAdmission(
      { rpc },
      "owner-1",
      "550e8400-e29b-41d4-a716-446655440000",
      "Is this okay?",
    );

    expect(result.admitted).toBe(true);
    const rpcArgs = rpc.mock.calls[0] as [string, { p_claim_id: string; p_fingerprint: string }];
    expect(rpcArgs[0]).toBe("claim_diagnosis_admission");
    expect(rpcArgs[1].p_claim_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rpcArgs[1].p_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns one controlled retry duration for any rejected policy reason", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ admitted: false, retry_after_seconds: 42 }], error: null });
    const result = await acquireDiagnosisAdmission(
      { rpc },
      "owner-1",
      "550e8400-e29b-41d4-a716-446655440000",
      "Is this okay?",
    );

    expect(result).toEqual({ admitted: false, retryAfterSeconds: 42 });
  });

  it("releases only the opaque claim through the dedicated RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await releaseDiagnosisAdmission({ rpc }, "claim-1");
    expect(rpc).toHaveBeenCalledWith("release_diagnosis_admission", { p_claim_id: "claim-1" });
  });

  it("fails closed when the RPC response is malformed", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await expect(
      acquireDiagnosisAdmission({ rpc }, "owner-1", "550e8400-e29b-41d4-a716-446655440000", "Is this okay?"),
    ).rejects.toThrow("Invalid diagnosis admission response");
  });
});
