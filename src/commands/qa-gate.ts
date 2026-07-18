import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function value(args: string[], index: number, option: string): string { const result = args[index + 1]; if (!result || result.startsWith("-")) throw new Error(`${option} requires a value.`); return result; }

export function runQaGateCommand(args: string[]): number {
  let workspace = process.cwd(); let runId: string | undefined; let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--workspace") { workspace = resolve(value(args, index, "--workspace")); index += 1; }
    else if (args[index] === "--run") { runId = value(args, index, "--run"); index += 1; }
    else if (args[index] === "--apply") apply = true;
    else if (args[index] === "--help" || args[index] === "-h") { console.log("Usage: company-orchestrator qa-gate --workspace <path> --run <id> [--apply]"); return 0; }
    else throw new Error(`Unknown qa-gate option \"${args[index]}\".`);
  }
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) throw new Error("qa-gate requires a valid --run ID.");
  const directory = join(workspace, ".product-manager-agent", "runs", runId);
  const boardPath = join(directory, "DELIVERY_BOARD.md");
  if (!existsSync(boardPath)) throw new Error(`Delivery board not found: ${boardPath}`);
  const board = readFileSync(boardPath, "utf8");
  const development = board.split("## QA")[0] ?? board;
  const blockers = development.split("\n").filter((line) => /^- \[ \] (Backend|Frontend|iOS|Android)/.test(line));
  if (blockers.length > 0) { console.log("QA blocked by incomplete development work:"); for (const blocker of blockers) console.log(blocker); return 2; }
  const requiredTeams = development.split("\n").flatMap((line) => { const match = line.match(/^- \[x\] (Backend|Frontend|iOS|Android) — owner: (?!Not applicable)/); return match ? [match[1].toLowerCase()] : []; });
  const missingEvidence = requiredTeams.filter((team) => { const handoff = join(directory, `PRODUCT_HANDOFF.${team}.md`); return !existsSync(handoff) || !/ready-for-qa:\s*true/i.test(readFileSync(handoff, "utf8")); });
  if (missingEvidence.length > 0) { console.log(`QA blocked by missing or not-ready handoffs: ${missingEvidence.join(", ")}`); return 2; }
  const requestPath = join(directory, "QA_REQUEST.md");
  const request = `# QA Request\n\nStatus: ready-for-qa\n\n## Required evidence\n\n- [ ] FEATURE_CONTRACT.md\n- [ ] API_CONTRACT.yaml\n- [ ] tasks/frontend.md, tasks/backend.md, tasks/ios.md, tasks/qa.md as applicable\n- [ ] PRODUCT_HANDOFF from each applicable development team\n- [ ] DELIVERY_BOARD.md\n- [ ] RELEASE_CHECKLIST.md\n\nRun QA with: \`qa-agent run start --workflow full-stack-integration\` and attach results before changing this feature to qa-passed.\n`;
  if (!apply) { console.log(`QA is ready. Preview only; re-run with --apply to create ${requestPath}`); return 0; }
  writeFileSync(requestPath, request); console.log(`Created QA request: ${requestPath}`); return 0;
}
