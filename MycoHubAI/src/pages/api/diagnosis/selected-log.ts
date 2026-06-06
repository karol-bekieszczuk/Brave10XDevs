import type { APIRoute } from "astro";
import { createDiagnosisProvider } from "@/lib/diagnosis/provider";
import { diagnoseSelectedLog } from "@/lib/diagnosis/service";
import { diagnosisRequestSchema, type DiagnosisApiResponse } from "@/lib/diagnosis/schema";
import { getOpenAiApiKey } from "@/lib/runtime-env";
import { createClient } from "@/lib/supabase";

function json(response: DiagnosisApiResponse, status: number) {
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function statusFor(response: DiagnosisApiResponse) {
  if (response.ok) {
    return 200;
  }

  switch (response.error.code) {
    case "invalid_request":
    case "unsupported_stage":
      return 400;
    case "unauthorized":
      return 401;
    case "grow_log_not_found":
      return 404;
    case "retrieval_failed":
    case "provider_failed":
    case "provider_timeout":
    case "invalid_model_output":
      return 502;
    default:
      return 500;
  }
}

export const POST: APIRoute = async (context) => {
  try {
    const user = context.locals.user;
    const supabase = createClient(context.request.headers, context.cookies);

    if (!user || !supabase) {
      return json(
        {
          ok: false,
          error: {
            code: "unauthorized",
            message: "Sign in to diagnose a grow log.",
            retryable: false,
          },
        },
        401,
      );
    }

    const body: unknown = await context.request.json();
    const request = diagnosisRequestSchema.safeParse(body);

    if (!request.success) {
      return json(
        {
          ok: false,
          error: {
            code: "invalid_request",
            message: "Invalid diagnosis request.",
            retryable: false,
          },
        },
        400,
      );
    }

    const response = await diagnoseSelectedLog(supabase, user.id, request.data, {
      provider: createDiagnosisProvider(getOpenAiApiKey()),
    });
    return json(response, statusFor(response));
  } catch {
    return json(
      {
        ok: false,
        error: {
          code: "provider_failed",
          message: "Diagnosis request failed.",
          retryable: true,
        },
      },
      502,
    );
  }
};
