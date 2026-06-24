import type { APIRoute } from "astro";
import { createDiagnosisProvider } from "@/lib/diagnosis/provider";
import { diagnoseSelectedLog } from "@/lib/diagnosis/service";
import { diagnosisRequestSchema, type DiagnosisApiResponse } from "@/lib/diagnosis/schema";
import { getOpenRouterApiKey } from "@/lib/runtime-env";
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

function errorMessageForEnvironment(error: unknown) {
  if (import.meta.env.DEV && error instanceof Error) {
    return `Diagnosis request failed. ${error.name}: ${error.message}`;
  }

  return "Diagnosis request failed.";
}

export const POST: APIRoute = async (context) => {
  try {
    console.log("[selected-log] start");

    const user = context.locals.user;
    const supabase = createClient(context.request.headers, context.cookies);

    console.log("[selected-log] auth checked", !!user, !!supabase);

    if (!user || !supabase) {
      console.log("[selected-log] unauthorized");

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

    console.log("[selected-log] before request json");

    const body: unknown = await context.request.json();

    console.log("[selected-log] after request json");

    const request = diagnosisRequestSchema.safeParse(body);

    if (!request.success) {
      console.log("[selected-log] invalid request");

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

    console.log("[selected-log] request parsed");

    const apiKey = getOpenRouterApiKey();

    console.log("[selected-log] api key exists", !!apiKey);
    console.log("[selected-log] before diagnoseSelectedLog");

    const response = await diagnoseSelectedLog(supabase, user.id, request.data, {
      createProvider: () => createDiagnosisProvider(apiKey, { debugErrors: import.meta.env.DEV }),
    });

    console.log("[selected-log] after diagnoseSelectedLog", response.ok);

    if (!response.ok) {
      console.log("[selected-log] diagnosis error code", response.error.code);
      console.log("[selected-log] diagnosis error message", response.error.message);
    }

    const status = statusFor(response);

    console.error("[selected-log] returning status", status);

    return json(response, status);
  } catch (error) {
    console.error("[selected-log] caught error");

    if (error instanceof Error) {
      console.error("[selected-log] error name", error.name);
      console.error("[selected-log] error message", error.message);
    } else {
      console.error("[selected-log] non-error thrown", String(error));
    }

    return json(
      {
        ok: false,
        error: {
          code: "provider_failed",
          message: errorMessageForEnvironment(error),
          retryable: true,
        },
      },
      502,
    );
  }
};
