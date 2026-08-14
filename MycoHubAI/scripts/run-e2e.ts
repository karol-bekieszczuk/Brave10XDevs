import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { parseEnv, promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  E2E_AUTH_STATE_PATH,
  E2E_BASE_URL,
  E2E_FIXTURE_EMAIL_PREFIX,
  E2E_FORCED_FAILURE_MARKER_PATH,
} from "../tests/e2e/fixtures";
import { smokeWorkerRuntime } from "./smoke-worker-runtime";

const DEV_VARS_PATH = ".dev.vars";
const E2E_FIXTURE_DIRECTORY = "playwright/.fixture";
const E2E_DEV_VARS_PATH = `${E2E_FIXTURE_DIRECTORY}/.dev.vars`;
const E2E_WRANGLER_CONFIG_PATH = `${E2E_FIXTURE_DIRECTORY}/wrangler.jsonc`;
const FORCE_CLEANUP_CHECK_ARGUMENT = "--verify-cleanup-on-failure";
const RUNTIME_ONLY_ARGUMENT = "--runtime-only";
const execFileAsync = promisify(execFile);

interface HarnessArguments {
  forceCleanupCheck: boolean;
  playwrightArguments: string[];
  runtimeOnly: boolean;
}

function parseArguments(): HarnessArguments {
  const rawArguments = process.argv.slice(2);

  return {
    forceCleanupCheck: rawArguments.includes(FORCE_CLEANUP_CHECK_ARGUMENT),
    playwrightArguments: rawArguments.filter(
      (argument) => argument !== FORCE_CLEANUP_CHECK_ARGUMENT && argument !== RUNTIME_ONLY_ARGUMENT,
    ),
    runtimeOnly: rawArguments.includes(RUNTIME_ONLY_ARGUMENT),
  };
}

function requireValue(value: string | undefined, name: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${name} is required in the invoking environment or local .dev.vars.`);
  }

  return normalized;
}

function isLoopbackAddress(address: string) {
  return address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");
}

async function assertLoopbackUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses =
    isIP(hostname) === 0 ? await lookup(hostname, { all: true, verbatim: true }) : [{ address: hostname }];

  if (addresses.length === 0 || addresses.some(({ address }) => !isLoopbackAddress(address))) {
    throw new Error("SUPABASE_URL must resolve only to loopback; refusing to run E2E against a remote project.");
  }
}

async function loadLocalBindings() {
  const processEnvironment = process.env as Record<string, string | undefined>;
  const processUrl = processEnvironment.SUPABASE_URL;
  const processAnonKey = processEnvironment.SUPABASE_ANON_KEY ?? processEnvironment.SUPABASE_KEY;
  const processServiceRoleKey = processEnvironment.SUPABASE_SERVICE_ROLE_KEY ?? processEnvironment.SUPABASE_ADMIN_KEY;

  if (processUrl?.trim() && processAnonKey?.trim() && processServiceRoleKey?.trim()) {
    return {
      anonKey: processAnonKey.trim(),
      serviceRoleKey: processServiceRoleKey.trim(),
      url: processUrl.trim(),
    };
  }

  const { stdout } = await execFileAsync(
    process.execPath,
    ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"],
    { encoding: "utf8", windowsHide: true },
  );
  const status = JSON.parse(stdout) as Record<string, unknown>;

  function readStatusValue(...names: string[]) {
    const name = names.find((candidate) => typeof status[candidate] === "string");
    return name ? (status[name] as string) : undefined;
  }

  return {
    anonKey: requireValue(
      readStatusValue("ANON_KEY", "PUBLISHABLE_KEY", "anon_key", "publishable_key"),
      "local Supabase anon key",
    ),
    serviceRoleKey: requireValue(
      readStatusValue("SERVICE_ROLE_KEY", "SECRET_KEY", "service_role_key", "secret_key"),
      "local Supabase service-role key",
    ),
    url: requireValue(readStatusValue("API_URL", "api_url"), "local Supabase API URL"),
  };
}

async function writeFixtureDevVars(ownerId: string, local: { anonKey: string; serviceRoleKey: string; url: string }) {
  await mkdir(E2E_FIXTURE_DIRECTORY, { recursive: true });

  try {
    await copyFile(DEV_VARS_PATH, E2E_DEV_VARS_PATH);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }

    await writeFile(
      E2E_DEV_VARS_PATH,
      [
        `SUPABASE_URL='${local.url}'`,
        `SUPABASE_KEY='${local.anonKey}'`,
        `SUPABASE_ADMIN_KEY='${local.serviceRoleKey}'`,
        "OPENROUTER_API_KEY='e2e-unused-provider-key'",
        "",
      ].join("\n"),
    );
  }

  const fixtureDevVars = await readFile(E2E_DEV_VARS_PATH, "utf8");
  const fixtureBindings = parseEnv(fixtureDevVars);
  await assertLoopbackUrl(requireValue(fixtureBindings.SUPABASE_URL, "fixture SUPABASE_URL"));
  requireValue(fixtureBindings.SUPABASE_KEY, "fixture SUPABASE_KEY");
  const authorizedUserPattern = /^(\s*(?:export\s+)?AUTHORIZED_USER_ID\s*=).*$/gm;
  const authorizedUserBinding = `AUTHORIZED_USER_ID='${ownerId}'`;
  const updatedDevVars = authorizedUserPattern.test(fixtureDevVars)
    ? fixtureDevVars.replace(authorizedUserPattern, authorizedUserBinding)
    : `${fixtureDevVars.trimEnd()}\n${authorizedUserBinding}\n`;
  await writeFile(E2E_DEV_VARS_PATH, updatedDevVars);
  await writeFile(
    E2E_WRANGLER_CONFIG_PATH,
    `${JSON.stringify(
      {
        name: "myco-hub-ai-local-e2e-harness",
        main: "../../src/worker.ts",
        compatibility_date: "2026-05-08",
        compatibility_flags: ["nodejs_compat"],
        assets: {
          binding: "ASSETS",
          directory: "../../dist",
          not_found_handling: "404-page",
        },
        secrets: {
          required: ["SUPABASE_URL", "SUPABASE_KEY", "AUTHORIZED_USER_ID", "SUPABASE_ADMIN_KEY", "OPENROUTER_API_KEY"],
        },
      },
      null,
      2,
    )}\n`,
  );
}

function runCommand(command: string, arguments_: string[], environment: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, arguments_, { env: environment, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with ${code ?? signal ?? "unknown status"}.`));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${E2E_BASE_URL}/auth/signin`);

      if (response.ok) {
        return;
      }
    } catch {
      // The state-based readiness probe continues until the server accepts requests.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("Timed out waiting for the built local Worker runtime.");
}

async function stopServer(server: ChildProcess | undefined) {
  if (server?.exitCode !== null || server.signalCode !== null) {
    return;
  }

  const exited = new Promise<"exited">((resolve) =>
    server.once("exit", () => {
      resolve("exited");
    }),
  );
  server.kill("SIGTERM");
  const result = await Promise.race([
    exited,
    new Promise<"timeout">((resolve) =>
      setTimeout(() => {
        resolve("timeout");
      }, 5_000),
    ),
  ]);

  if (result === "timeout") {
    server.kill("SIGKILL");
    await exited;
  }
}

async function main() {
  const { forceCleanupCheck, playwrightArguments, runtimeOnly } = parseArguments();
  const local = await loadLocalBindings();
  await assertLoopbackUrl(local.url);

  const admin = createClient(local.url, local.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const runId = randomUUID();
  const email = `${E2E_FIXTURE_EMAIL_PREFIX}${runId}@example.test`;
  const password = `E2e-${randomUUID()}-Aa1!`;
  let ownerId: string | undefined;
  let server: ChildProcess | undefined;
  let runError: unknown;
  const cleanupErrors: string[] = [];

  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(created.error, null, `create E2E owner: ${created.error?.message ?? "unknown Supabase error"}`);
    assert(created.data.user, "create E2E owner: missing user");
    assert(created.data.user.email?.startsWith(E2E_FIXTURE_EMAIL_PREFIX), "refusing to track a non-E2E user");
    ownerId = created.data.user.id;

    await writeFixtureDevVars(ownerId, local);
    await mkdir("playwright/.auth", { recursive: true });
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      AUTHORIZED_USER_ID: ownerId,
      E2E_BASE_URL,
      E2E_OWNER_EMAIL: email,
      E2E_OWNER_ID: ownerId,
      E2E_OWNER_PASSWORD: password,
      E2E_SERVER_MANAGED: "1",
      E2E_SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
      E2E_SUPABASE_URL: local.url,
      MYCOHUB_E2E_WRANGLER_CONFIG_PATH: E2E_WRANGLER_CONFIG_PATH,
      SUPABASE_ADMIN_KEY: local.serviceRoleKey,
      SUPABASE_KEY: local.anonKey,
      SUPABASE_URL: local.url,
    };

    await runCommand(process.execPath, ["node_modules/astro/bin/astro.mjs", "build"], environment);
    server = spawn(
      process.execPath,
      ["node_modules/astro/bin/astro.mjs", "preview", "--host", "127.0.0.1", "--port", "4321"],
      { env: environment, stdio: "inherit", windowsHide: true },
    );
    await waitForServer();
    await smokeWorkerRuntime(E2E_BASE_URL);

    if (!runtimeOnly) {
      const testArguments = ["node_modules/@playwright/test/cli.js", "test", ...playwrightArguments];

      if (forceCleanupCheck) {
        environment.E2E_FORCE_SETUP_FAILURE = "1";
      }

      try {
        await runCommand(process.execPath, testArguments, environment);

        if (forceCleanupCheck) {
          throw new Error("Forced setup failure unexpectedly passed.");
        }
      } catch (error) {
        if (!forceCleanupCheck) {
          throw error;
        }

        await access(E2E_FORCED_FAILURE_MARKER_PATH);
        process.stdout.write("Observed the expected forced setup failure; validating harness cleanup.\n");
      }
    }
  } catch (error) {
    runError = error;
  } finally {
    await stopServer(server).catch((error: unknown) => {
      cleanupErrors.push(`server: ${error instanceof Error ? error.message : "unknown stop failure"}`);
    });
    await rm(E2E_AUTH_STATE_PATH, { force: true }).catch((error: unknown) => {
      cleanupErrors.push(`auth state: ${error instanceof Error ? error.message : "unknown removal failure"}`);
    });
    await rm(E2E_FIXTURE_DIRECTORY, { force: true, recursive: true }).catch((error: unknown) => {
      cleanupErrors.push(
        `E2E fixture directory: ${error instanceof Error ? error.message : "unknown removal failure"}`,
      );
    });

    if (ownerId) {
      const deleted = await admin.auth.admin.deleteUser(ownerId, false);

      if (deleted.error) {
        cleanupErrors.push(`fixture user ${ownerId}: ${deleted.error.message}`);
      } else {
        const deletedUserOracle = await admin.auth.admin.getUserById(ownerId);

        if (!deletedUserOracle.error) {
          cleanupErrors.push(`fixture user ${ownerId}: still present after hard delete`);
        }
      }
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(`E2E cleanup failed: ${cleanupErrors.join("; ")}`, { cause: runError });
  }

  process.stdout.write(
    "E2E cleanup complete: exact generated owner, auth state, and temporary binding override removed.\n",
  );

  if (runError instanceof Error) {
    throw runError;
  }

  if (runError !== undefined) {
    throw new Error("E2E harness failed with a non-Error value.", { cause: runError });
  }
}

await main();
