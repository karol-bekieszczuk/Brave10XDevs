import { spawnSync } from "node:child_process";
import path from "node:path";

const diagnosisRiskArea = "src/lib/diagnosis/";
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

function emitBlock(reason) {
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

function readStdin() {
  return new Promise((resolve) => {
    let input = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      resolve(input);
    });
  });
}

function toRepoRelative(filePath) {
  if (!filePath) {
    return null;
  }

  const resolved = path.resolve(process.cwd(), filePath);
  const relative = path.relative(process.cwd(), resolved).replaceAll(path.sep, "/");

  if (relative.startsWith("../") || path.isAbsolute(relative)) {
    return null;
  }

  return relative;
}

function collectStringValues(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (!value || typeof value !== "object") {
    return output;
  }

  for (const child of Object.values(value)) {
    collectStringValues(child, output);
  }

  return output;
}

function collectEditedFiles(event) {
  const candidates = [
    event?.tool_input?.file_path,
    event?.tool_input?.path,
    event?.tool_input?.filePath,
    event?.tool_input?.target_file,
  ].filter(Boolean);

  const patchFilePattern = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;

  for (const value of collectStringValues(event?.tool_input ?? {})) {
    for (const match of String(value).matchAll(patchFilePattern)) {
      candidates.push(match[1]);
    }
  }

  return [...new Set(candidates.map(toRepoRelative).filter(Boolean))];
}

const input = await readStdin();
let event = {};

try {
  event = input.trim() ? JSON.parse(input) : {};
} catch {
  process.exit(0);
}

const diagnosisEditedFile = collectEditedFiles(event).find((filePath) =>
  filePath.startsWith(diagnosisRiskArea),
);

if (!diagnosisEditedFile) {
  process.exit(0);
}

const command = "npx.cmd";
const args = ["vitest", "related", "--run", diagnosisEditedFile];
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: "utf8",
  env: {
    ...process.env,
    AI_AGENT: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  },
  maxBuffer: 10 * 1024 * 1024,
  shell: isWindows,
});

const output = normalizeOutput([result.stdout, result.stderr].filter(Boolean).join("\n"));
const status = typeof result.status === "number" ? result.status : 1;
const summary = [
  "PostToolUse hook: diagnosis related tests.",
  `Command: ${command} ${args.join(" ")}`,
  result.error ? "Start failed" : `Exit code: ${status}`,
  "",
  result.error?.message,
  output || "(no output captured)",
]
  .filter(Boolean)
  .join("\n");

if (result.error || status !== 0) {
  emitBlock(tail(summary, maxContextChars));
  process.exit(0);
}

process.stdout.write(`${tail(summary, maxContextChars)}\n`);
process.exit(0);
