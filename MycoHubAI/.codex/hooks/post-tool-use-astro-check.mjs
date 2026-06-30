import { spawnSync } from "node:child_process";

const checks = [
  {
    label: "ESLint fix",
    command: "npx.cmd",
    args: ["eslint", "--fix", ".", "--quiet"],
  },
  {
    label: "Astro check",
    command: "npm.cmd",
    args: ["run", "astro", "--", "check"],
  },
];
const maxContextChars = 9000;
const isWindows = process.platform === "win32";

function stripAnsi(value) {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function normalizeOutput(value) {
  return stripAnsi(String(value ?? ""))
    .replace(/\r\n/g, "\n")
    .trim();
}

function tail(value, maxChars) {
  if (value.length <= maxChars) {
    return value;
  }

  return `[output truncated to last ${maxChars} chars]\n${value.slice(-maxChars)}`;
}

function emitFeedback(reason) {
  const payload = {
    decision: "block",
    reason,
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: reason,
    },
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const failures = [];

for (const check of checks) {
  const result = spawnSync(check.command, check.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    maxBuffer: 10 * 1024 * 1024,
    shell: isWindows,
  });

  const output = normalizeOutput([result.stdout, result.stderr].filter(Boolean).join("\n"));
  const status = typeof result.status === "number" ? result.status : 1;

  if (result.error || status !== 0) {
    failures.push(
      [
        `## ${check.label}`,
        `Command: ${check.command} ${check.args.join(" ")}`,
        result.error ? "Start failed" : `Exit code: ${status}`,
        "",
        result.error?.message,
        output || "(no output captured)",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

if (failures.length === 0) {
  process.exit(0);
}

emitFeedback(["PostToolUse hook: quality checks failed.", "", tail(failures.join("\n\n"), maxContextChars)].join("\n"));
process.exit(0);
