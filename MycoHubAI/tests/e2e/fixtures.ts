export const E2E_BASE_URL = "http://127.0.0.1:4321";
export const E2E_AUTH_STATE_PATH = "playwright/.auth/owner.json";
export const E2E_FORCED_FAILURE_MARKER_PATH = "playwright/.fixture/forced-failure-reached";
export const E2E_FIXTURE_EMAIL_PREFIX = "mycohub-e2e-";

export interface E2EFixtureEnvironment {
  email: string;
  ownerId: string;
  password: string;
}

function requireHarnessEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Start E2E through npm run test:e2e.`);
  }

  return value;
}

export function getE2EFixtureEnvironment(): E2EFixtureEnvironment {
  return {
    email: requireHarnessEnv("E2E_OWNER_EMAIL"),
    ownerId: requireHarnessEnv("E2E_OWNER_ID"),
    password: requireHarnessEnv("E2E_OWNER_PASSWORD"),
  };
}
