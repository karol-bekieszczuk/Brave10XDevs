import { AlertCircle, RotateCcw, Send, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { diagnosisApiResponseSchema, type DiagnosisResponse } from "@/lib/diagnosis/schema";

type DiagnosisStage = "agar" | "grain";

export type DiagnosisFetch = (
  input: string,
  init: RequestInit,
) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

export type DiagnosisPanelStatus = "idle" | "loading" | "success" | "error";

export interface SelectedLogDiagnosisPanelProps {
  growLogId: string;
  logTitle: string;
  logStage: DiagnosisStage;
}

export interface DiagnosisPanelErrorState {
  message: string;
  retryable: boolean;
}

interface SelectedLogDiagnosisPanelViewProps extends SelectedLogDiagnosisPanelProps {
  textareaId: string;
  question: string;
  status: DiagnosisPanelStatus;
  diagnosis: DiagnosisResponse | null;
  error: DiagnosisPanelErrorState | null;
  onQuestionChange: (question: string) => void;
  onSubmit: () => void;
  onRetry: () => void;
}

export class DiagnosisPanelError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "DiagnosisPanelError";
    this.retryable = retryable;
  }
}

const scopeLabels: Record<DiagnosisResponse["scopeStatus"], string> = {
  in_scope: "In scope",
  missing_context: "Missing context",
  mixed_scope: "Mixed scope",
  out_of_scope: "Out of scope",
};

const confidenceLabels: Record<NonNullable<DiagnosisResponse["confidenceBand"]>, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export function validateDiagnosisQuestion(question: string) {
  return question.trim().length > 0 ? null : "Enter a troubleshooting question for this selected grow log.";
}

export function sourceLabel(source: DiagnosisResponse["sources"][number]) {
  const filename = source.sourcePath.split(/[\\/]/).pop()?.replace(/\.md$/u, "") ?? source.sourcePath;
  return source.sourceHeading ? `${source.sourceHeading} (${filename})` : filename;
}

export async function requestSelectedLogDiagnosis(
  growLogId: string,
  question: string,
  fetcher: DiagnosisFetch = (input, init) => fetch(input, init),
) {
  const response = await fetcher("/api/diagnosis/selected-log", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      growLogId,
      question: question.trim(),
    }),
  });

  const payload = await response.json();
  const parsed = diagnosisApiResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new DiagnosisPanelError("Diagnosis returned an unexpected response.", true);
  }

  if (!parsed.data.ok) {
    throw new DiagnosisPanelError(parsed.data.error.message, parsed.data.error.retryable);
  }

  return parsed.data.diagnosis;
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-blue-100/85">
          {items.map((item) => (
            <li key={item} className="rounded-md border border-white/10 bg-white/6 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-blue-100/65">No specific items were returned.</p>
      )}
    </section>
  );
}

export function DiagnosisResult({ diagnosis }: { diagnosis: DiagnosisResponse }) {
  return (
    <div className="mt-5 space-y-5 rounded-lg border border-cyan-300/25 bg-cyan-300/8 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-cyan-200/25 bg-cyan-200/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
          {scopeLabels[diagnosis.scopeStatus]}
        </span>
        {diagnosis.confidenceBand ? (
          <span className="rounded-md border border-white/15 bg-white/8 px-2.5 py-1 text-xs font-medium text-blue-100">
            {confidenceLabels[diagnosis.confidenceBand]}
          </span>
        ) : null}
      </div>

      <ResultList title="Possible causes" items={diagnosis.possibleCauses} />
      <ResultList title="Suggested actions" items={diagnosis.suggestedActions} />

      <section>
        <h3 className="text-sm font-semibold text-white">Uncertainty</h3>
        <p className="mt-2 text-sm leading-6 text-blue-100/85">{diagnosis.uncertainty}</p>
      </section>

      {diagnosis.followUpQuestion ? (
        <section>
          <h3 className="text-sm font-semibold text-white">Follow-up question</h3>
          <p className="mt-2 rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm leading-6 text-amber-100">
            {diagnosis.followUpQuestion}
          </p>
        </section>
      ) : null}

      {diagnosis.sources.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold text-white">Sources</h3>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs text-blue-100/80">
            {diagnosis.sources.map((source) => (
              <li
                key={`${source.sourcePath}:${source.sourceHeading ?? ""}`}
                className="rounded-md border border-white/15 bg-white/8 px-2.5 py-1"
              >
                {sourceLabel(source)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function SelectedLogDiagnosisPanelView({
  logTitle,
  logStage,
  textareaId,
  question,
  status,
  diagnosis,
  error,
  onQuestionChange,
  onSubmit,
  onRetry,
}: SelectedLogDiagnosisPanelViewProps) {
  const isLoading = status === "loading";

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/8 p-5">
      <div className="flex items-start gap-3">
        <Sparkles aria-hidden="true" className="mt-1 size-5 shrink-0 text-cyan-200" />
        <div>
          <h2 className="text-lg font-semibold text-white">Selected-log diagnosis</h2>
          <p className="mt-1 text-sm leading-6 text-blue-100/75">
            Ask about this {logStage} log: <span className="font-medium text-blue-50">{logTitle}</span>
          </p>
        </div>
      </div>

      <form
        className="mt-5 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor={textareaId} className="text-sm font-medium text-white">
          Troubleshooting question
        </label>
        <textarea
          id={textareaId}
          value={question}
          disabled={isLoading}
          onChange={(event) => {
            onQuestionChange(event.target.value);
          }}
          rows={4}
          className="min-h-28 w-full resize-y rounded-lg border border-white/15 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white placeholder:text-blue-100/35 focus:border-cyan-200 focus:ring-2 focus:ring-cyan-200/25 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
          placeholder="What changed in this log, and what should I check next?"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Send aria-hidden="true" className="size-4" />
            {isLoading ? "Diagnosing..." : "Ask diagnosis"}
          </button>
          {error?.retryable ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={onRetry}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-4 py-2.5 text-sm font-medium text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Retry
            </button>
          ) : null}
        </div>
      </form>

      {isLoading ? (
        <p role="status" className="mt-4 text-sm text-cyan-100">
          Loading diagnosis for this selected log...
        </p>
      ) : null}

      {error ? (
        <div className="mt-4 flex gap-3 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{error.message}</p>
        </div>
      ) : null}

      {status === "success" && diagnosis ? <DiagnosisResult diagnosis={diagnosis} /> : null}
    </section>
  );
}

export default function SelectedLogDiagnosisPanel({ growLogId, logTitle, logStage }: SelectedLogDiagnosisPanelProps) {
  const textareaId = useId();
  const [question, setQuestion] = useState("");
  const [lastSubmittedQuestion, setLastSubmittedQuestion] = useState("");
  const [status, setStatus] = useState<DiagnosisPanelStatus>("idle");
  const [diagnosis, setDiagnosis] = useState<DiagnosisResponse | null>(null);
  const [error, setError] = useState<DiagnosisPanelErrorState | null>(null);

  async function submitQuestion(questionToSubmit: string) {
    const validationError = validateDiagnosisQuestion(questionToSubmit);

    if (validationError) {
      setStatus("error");
      setError({ message: validationError, retryable: false });
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const result = await requestSelectedLogDiagnosis(growLogId, questionToSubmit);
      setDiagnosis(result);
      setLastSubmittedQuestion(questionToSubmit.trim());
      setStatus("success");
    } catch (requestError) {
      const panelError =
        requestError instanceof DiagnosisPanelError
          ? requestError
          : new DiagnosisPanelError("Diagnosis failed. Try again.", true);

      setError({ message: panelError.message, retryable: panelError.retryable });
      setStatus("error");
    }
  }

  return (
    <SelectedLogDiagnosisPanelView
      growLogId={growLogId}
      logTitle={logTitle}
      logStage={logStage}
      textareaId={textareaId}
      question={question}
      status={status}
      diagnosis={diagnosis}
      error={error}
      onQuestionChange={setQuestion}
      onSubmit={() => void submitQuestion(question)}
      onRetry={() => void submitQuestion(lastSubmittedQuestion || question)}
    />
  );
}
