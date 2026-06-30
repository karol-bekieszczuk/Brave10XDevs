import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DiagnosisPanelError,
  DiagnosisResult,
  requestSelectedLogDiagnosis,
  SelectedLogDiagnosisPanelView,
  sourceLabel,
  validateDiagnosisQuestion,
  type DiagnosisFetch,
} from "@/components/diagnosis/SelectedLogDiagnosisPanel";
import type { DiagnosisResponse } from "@/lib/diagnosis/schema";

const diagnosis: DiagnosisResponse = {
  scopeStatus: "mixed_scope",
  possibleCauses: ["Condensation may be limiting visibility on the selected agar plate."],
  suggestedActions: ["Add a dated visual observation to this log before changing conditions."],
  confidenceBand: "low",
  uncertainty: "The selected log has limited recent detail, so the result stays tentative.",
  followUpQuestion: "What visible edge change appeared since the last transfer?",
  sources: [
    {
      sourcePath: "lib/diagnosis/knowledge/agar-contamination.md",
      sourceHeading: "Agar surface observations",
    },
  ],
};

function renderView(overrides: Partial<Parameters<typeof SelectedLogDiagnosisPanelView>[0]> = {}) {
  return renderToStaticMarkup(
    <SelectedLogDiagnosisPanelView
      growLogId="log-1"
      logTitle="Agar transfer A"
      logStage="agar"
      textareaId="diagnosis-question"
      question="Why is growth slow?"
      status="idle"
      diagnosis={null}
      error={null}
      onQuestionChange={() => undefined}
      onSubmit={() => undefined}
      onRetry={() => undefined}
      {...overrides}
    />,
  );
}

describe("SelectedLogDiagnosisPanel", () => {
  it("validates empty questions before a request is sent", () => {
    expect(validateDiagnosisQuestion("   ")).toBe("Enter a troubleshooting question for this selected grow log.");
    expect(validateDiagnosisQuestion("What changed?")).toBeNull();
  });

  it("submits one JSON request to the selected-log diagnosis endpoint", async () => {
    const fetcher = vi.fn<DiagnosisFetch>(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            diagnosis,
          }),
      }),
    );

    await expect(requestSelectedLogDiagnosis("log-1", " Why is growth slow? ", fetcher)).resolves.toEqual(diagnosis);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/diagnosis/selected-log",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          growLogId: "log-1",
          question: "Why is growth slow?",
        }),
      }),
    );
  });

  it("surfaces retryable API errors without raw JSON", async () => {
    const fetcher: DiagnosisFetch = () =>
      Promise.resolve({
        ok: false,
        json: () =>
          Promise.resolve({
            ok: false,
            error: {
              code: "provider_failed",
              message: "Diagnosis provider failed.",
              retryable: true,
            },
          }),
      });

    await expect(requestSelectedLogDiagnosis("log-1", "Why is growth slow?", fetcher)).rejects.toMatchObject({
      message: "Diagnosis provider failed.",
      retryable: true,
    } satisfies Partial<DiagnosisPanelError>);
  });

  it("rejects malformed success payloads with the generic unexpected-response error", async () => {
    const fetcher: DiagnosisFetch = () =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            diagnosis: {
              scopeStatus: "in_scope",
              possibleCauses: [],
            },
          }),
      });

    await expect(requestSelectedLogDiagnosis("log-1", "Why is growth slow?", fetcher)).rejects.toMatchObject({
      message: "Diagnosis returned an unexpected response.",
      retryable: true,
    } satisfies Partial<DiagnosisPanelError>);
  });

  it("renders loading and retry controls", () => {
    const loadingMarkup = renderView({ status: "loading" });
    expect(loadingMarkup).toContain("Diagnosing...");
    expect(loadingMarkup).toContain("Loading diagnosis for this selected log");

    const errorMarkup = renderView({
      status: "error",
      error: {
        message: "Diagnosis provider failed.",
        retryable: true,
      },
    });
    expect(errorMarkup).toContain("Retry");
    expect(errorMarkup).toContain("Diagnosis provider failed.");
  });

  it("renders structured diagnosis fields and concise source labels", () => {
    const markup = renderToStaticMarkup(<DiagnosisResult diagnosis={diagnosis} />);

    expect(markup).toContain("Mixed scope");
    expect(markup).toContain("Low confidence");
    expect(markup).toContain("Possible causes");
    expect(markup).toContain("Suggested actions");
    expect(markup).toContain("Uncertainty");
    expect(markup).toContain("Follow-up question");
    expect(markup).toContain("Agar surface observations (agar-contamination)");
    expect(markup).not.toContain("scopeStatus");
    expect(markup).not.toContain("possibleCauses");
  });

  it("omits the sources section when the diagnosis has no cited sources", () => {
    const markup = renderToStaticMarkup(<DiagnosisResult diagnosis={{ ...diagnosis, sources: [] }} />);

    expect(markup).not.toContain("Sources");
    expect(markup).toContain("Possible causes");
    expect(markup).toContain("Suggested actions");
  });

  it("formats source labels from headings or file names", () => {
    expect(sourceLabel(diagnosis.sources[0])).toBe("Agar surface observations (agar-contamination)");
    expect(sourceLabel({ sourcePath: "lib/diagnosis/knowledge/grain-moisture.md", sourceHeading: null })).toBe(
      "grain-moisture",
    );
  });
});
