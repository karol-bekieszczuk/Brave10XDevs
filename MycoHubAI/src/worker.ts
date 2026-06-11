import { handle } from "@astrojs/cloudflare/handler";
import { createClient } from "@supabase/supabase-js";
import { purgeDueAccountDeletionRequests } from "@/lib/account-deletion/purge";

interface WorkerEnv {
  SUPABASE_URL?: string;
  SUPABASE_ADMIN_KEY?: string;
}

type CloudflareFetchHandler = (request: Request, env: WorkerEnv, ctx: ExecutionContext) => Promise<Response>;

const handleRequest = handle as CloudflareFetchHandler;

function createWorkerAdminClient(env: WorkerEnv) {
  const url = typeof env.SUPABASE_URL === "string" ? env.SUPABASE_URL.trim() : "";
  const adminKey = typeof env.SUPABASE_ADMIN_KEY === "string" ? env.SUPABASE_ADMIN_KEY.trim() : "";

  if (!url || !adminKey) {
    return null;
  }

  return createClient(url, adminKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const worker: ExportedHandler<WorkerEnv> = {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    return handleRequest(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: WorkerEnv, _ctx: ExecutionContext) {
    const summary = await purgeDueAccountDeletionRequests({
      adminClient: createWorkerAdminClient(env),
    });

    // eslint-disable-next-line no-console
    console.log(
      `account deletion purge configured=${summary.configured} processed=${summary.processed} deleted=${summary.deleted} failed=${summary.failed}`,
    );
  },
};

export default worker;
