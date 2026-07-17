import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ARTIFACT_ROOTS = [".ios-agent/runs", ".design-agent/runs", ".qa-agent/runs", ".product-manager-agent/runs", ".growth-agent/runs", ".backend-agent/runs", ".frontend-agent/runs", ".android-agent/runs", ".release-agent/runs", ".company-orchestrator/runs"];
const SKIPPED = new Set([".git", "node_modules", "dist", ".next", "Pods"]);

interface DiscoveredRun { repository: string; artifactRoot: string; id: string; workflow?: string; status?: string; task?: string; updatedAt?: string; report: boolean; }

function collect(root: string, directory: string, depth: number, runs: DiscoveredRun[]): void {
  for (const artifactRoot of ARTIFACT_ROOTS) {
    const runsDirectory = join(directory, artifactRoot);
    if (!existsSync(runsDirectory)) continue;
    for (const entry of readdirSync(runsDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const runPath = join(runsDirectory, entry.name); const statePath = join(runPath, "run.json");
      try {
        const state = JSON.parse(readFileSync(statePath, "utf8")) as { workflowId?: string; status?: string; task?: string; updatedAt?: string };
        runs.push({ repository: relative(root, directory) || ".", artifactRoot, id: entry.name, workflow: state.workflowId, status: state.status, task: state.task, updatedAt: state.updatedAt, report: existsSync(join(runPath, "REPORT.md")) });
      } catch { /* Ignore incomplete or foreign artifacts. */ }
    }
  }
  if (depth === 0) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || SKIPPED.has(entry.name)) continue;
    const child = join(directory, entry.name);
    try { if (statSync(child).isDirectory()) collect(root, child, depth - 1, runs); } catch { /* Ignore unreadable directories. */ }
  }
}

export function runDiscoverCommand(args: string[]): number {
  let root = process.cwd(); let json = false; let depth = 3;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root") { const value = args[++index]; if (!value) throw new Error("--root requires a path."); root = resolve(value); }
    else if (argument === "--json") json = true;
    else if (argument === "--depth") { const value = Number(args[++index]); if (!Number.isInteger(value) || value < 0 || value > 8) throw new Error("--depth must be an integer from 0 to 8."); depth = value; }
    else if (argument === "--help" || argument === "-h") { console.log("Usage: company-orchestrator discover [--root <path>] [--depth <0-8>] [--json]"); return 0; }
    else throw new Error(`Unknown discover option \"${argument}\".`);
  }
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Discovery root not found: ${root}`);
  const runs: DiscoveredRun[] = []; collect(root, root, depth, runs); runs.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  if (json) { console.log(JSON.stringify({ root, runs }, null, 2)); return 0; }
  console.log(`Discovered ${runs.length} agent run(s) under ${root}`);
  for (const run of runs) console.log(`- ${run.repository} | ${run.artifactRoot} | ${run.id} | ${run.status ?? "unknown"} | ${run.workflow ?? "unknown"} | report: ${run.report ? "yes" : "no"}`);
  return 0;
}
