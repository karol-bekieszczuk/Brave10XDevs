import { handle } from "@astrojs/cloudflare/handler";
import { createClient } from "@supabase/supabase-js";
import { purgeDueAccountDeletionRequests } from "@/lib/account-deletion/purge";
import { reconcileUnfinalizedAccountDeletions } from "@/lib/account-deletion/reconciliation";

const handleRequest = handle;

function createWorkerAdminClient(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_ADMIN_KEY">) {
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

const worker: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handleRequest(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const adminClient = createWorkerAdminClient(env);
    const reconciliation = await reconcileUnfinalizedAccountDeletions(adminClient);
    const purge = await purgeDueAccountDeletionRequests({ adminClient });

    // eslint-disable-next-line no-console
    console.log(
      `account deletion reconciliation configured=${reconciliation.configured} processed=${reconciliation.processed} repaired=${reconciliation.repaired} deferred=${reconciliation.deferred} failed=${reconciliation.failed} purge_configured=${purge.configured} purge_processed=${purge.processed} purge_deleted=${purge.deleted} purge_failed=${purge.failed}`,
    );
  },
};

export default worker;
