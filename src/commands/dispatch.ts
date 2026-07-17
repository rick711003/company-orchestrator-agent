import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { runQaGateCommand } from "./qa-gate.ts";

const agents = [
  { board: "Backend", repo: "backend-engineer-agent", bin: "backend-agent.js", workflow: "api-feature-development", brief: "tasks/backend.md" },
  { board: "Frontend", repo: "frontend-engineer-agent", bin: "frontend-agent.js", workflow: "web-feature-development", brief: "tasks/frontend.md" },
  { board: "iOS", repo: "ios-engineer-agent", bin: "ios-agent.js", workflow: "feature-development", brief: "tasks/ios.md" },
  { board: "Android", repo: "android-engineer-agent", bin: "android-agent.js", workflow: "android-feature-development", brief: "tasks/android.md" },
];

export function runDispatchCommand(args: string[]): number {
  let workspace = process.cwd(); let root = resolve(process.cwd(), ".."); let runId = ""; let execute = false;
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i]; const next = () => { const value = args[++i]; if (!value) throw new Error(`${option} requires a value.`); return value; };
    if (option === "--workspace") workspace = resolve(next()); else if (option === "--agents-root") root = resolve(next()); else if (option === "--run") runId = next(); else if (option === "--execute") execute = true;
    else if (option === "--help" || option === "-h") { console.log("Usage: company-orchestrator dispatch --workspace <path> --run <id> [--agents-root <path>] [--execute]"); return 0; }
    else throw new Error(`Unknown dispatch option \"${option}\".`);
  }
  if (!runId) throw new Error("dispatch requires --run.");
  const run = join(workspace, ".product-manager-agent", "runs", runId); const board = readFileSync(join(run, "DELIVERY_BOARD.md"), "utf8");
  let started = 0;
  for (const agent of agents) {
    const line = board.split("\n").find((value) => value.includes(`] ${agent.board} —`)) ?? "";
    if (!line || /\[x\]|not applicable/i.test(line)) continue;
    const bin = join(root, agent.repo, "bin", agent.bin); const briefPath = join(run, agent.brief);
    if (!existsSync(bin)) { console.log(`Blocked: ${agent.board} agent CLI not found at ${bin}`); continue; }
    const brief = existsSync(briefPath) ? readFileSync(briefPath, "utf8") : `Implement the ${agent.board} scope in ${join(run, "FEATURE_CONTRACT.md")}.`;
    const task = `${brief}\n\nCompletion protocol: when implementation and tests are complete, write ${join(run, `PRODUCT_HANDOFF.${agent.board.toLowerCase()}.md`)} containing changed files, test evidence, API-contract changes, blockers, and ready-for-qa status. Then change this exact Delivery Board line to [x]: ${line}`;
    const command = [bin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", agent.workflow, task];
    console.log(`${execute ? "Starting" : "Preview"}: node ${command.map((part) => JSON.stringify(part)).join(" ")}`);
    if (execute) { const result = spawnSync("node", command, { stdio: "inherit" }); if (result.status !== 0) process.exitCode = 1; }
    started += 1;
  }
  console.log(`${execute ? "Started" : "Would start"} ${started} development agent(s).`);
  if (execute && started > 0 && !process.exitCode) {
    const gate = runQaGateCommand(["--workspace", workspace, "--run", runId, "--apply"]);
    if (gate === 2) console.log("QA remains blocked until required PRODUCT_HANDOFFs update the Delivery Board.");
    else if (gate !== 0) process.exitCode = gate;
  }
  return typeof process.exitCode === "number" ? process.exitCode : 0;
}
