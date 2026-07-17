import { spawnSync } from "node:child_process";

interface Check {
  name: string;
  status: "pass" | "fail" | "optional";
  detail: string;
  fix?: string;
}

function commandVersion(command: string, args = ["--version"]): string | undefined {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) return undefined;
  return `${result.stdout}${result.stderr}`.trim().split("\n")[0];
}

function nodeVersionCheck(): Check {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  const supported = major > 22 || (major === 22 && minor >= 6);
  return {
    name: "Node.js",
    status: supported ? "pass" : "fail",
    detail: `v${process.versions.node}`,
    fix: supported ? undefined : "Install Node.js 22.6 or newer.",
  };
}

export function runDoctorCommand(): number {
  const codex = commandVersion("codex");
  const claude = commandVersion("claude");
  const checks: Check[] = [
    {
      name: "Operating system",
      status: "pass",
      detail: process.platform,
    },
    nodeVersionCheck(),
    {
      name: "Codex CLI",
      status: codex ? "pass" : "optional",
      detail: codex ?? "not installed",
      fix: codex ? undefined : "Install and authenticate Codex, or use Claude CLI instead.",
    },
    {
      name: "Claude CLI",
      status: claude ? "pass" : "optional",
      detail: claude ?? "not installed",
      fix: claude ? undefined : "Install and authenticate Claude, or use Codex CLI instead.",
    },
  ];

  if (!codex && !claude) {
    checks.push({
      name: "AI provider",
      status: "fail",
      detail: "no supported provider available",
      fix: "Install at least one provider: Codex CLI or Claude CLI.",
    });
  }

  console.log("Company Orchestrator Agent — Environment Doctor\n");
  for (const check of checks) {
    const marker = check.status === "pass" ? "PASS" : check.status === "fail" ? "FAIL" : "OPTIONAL";
    console.log(`[${marker.padEnd(8)}] ${check.name}: ${check.detail}`);
    if (check.fix) console.log(`           ${check.fix}`);
  }

  const failures = checks.filter((check) => check.status === "fail");
  console.log(`\nResult: ${failures.length === 0 ? "ready" : `${failures.length} required check(s) failed`}`);
  return failures.length === 0 ? 0 : 1;
}
