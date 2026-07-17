#!/usr/bin/env node

import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { runDoctorCommand } from "./commands/doctor.ts";
import { runTeamRunCommand } from "./commands/run.ts";
import { runTeamCommand } from "./commands/team.ts";
import { runWorkflowCommand } from "./commands/workflow.ts";
import { runDiscoverCommand } from "./commands/discover.ts";
import { runQaGateCommand } from "./commands/qa-gate.ts";
import { createTeamTask } from "./core/team.ts";
import { createProvider, type ProviderName } from "./providers/index.ts";
import type { AccessMode } from "./providers/provider.ts";
import { getWorkflow } from "./workflows/index.ts";

const VERSION = "0.1.0";

interface CliOptions { provider: ProviderName; cwd: string; dryRun: boolean; workflow: string; accessMode: AccessMode; task: string; }

function printHelp(): void {
  console.log(`Company Orchestrator Agent

Usage:
  company-orchestrator [options] <brief>
  company-orchestrator workflow list
  company-orchestrator workflow show <id>
  company-orchestrator team show
  company-orchestrator run start [options] <brief>
  company-orchestrator run estimate [options] <brief>
  company-orchestrator run resume <id> --approve
  company-orchestrator run status <id>
  company-orchestrator run list
  company-orchestrator doctor
  company-orchestrator discover [--root <path>] [--depth <0-8>] [--json]
  company-orchestrator qa-gate --workspace <path> --run <id> [--apply]

Options:
  -p, --provider <name>  Provider: codex or claude (default: codex)
  -C, --cwd <path>       Product workspace (default: current directory)
      --dry-run          Preview provider commands without model calls
      --write            Allow scoped growth deliverable or product edits in a Git workspace
  -w, --workflow <id>    Workflow (default: portfolio-status)
  -h, --help             Show help
  -v, --version          Show version

Examples:
  company-orchestrator --provider claude "Find the strongest launch audience for our iOS app"
  company-orchestrator run start --cwd ../product --workflow feature-planning "Design a referral experiment"
  company-orchestrator run start --write --workflow release-coordination "Draft the approved app launch campaign"`);
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${option} requires a value.`);
  return value;
}

function parseArgs(args: string[]): CliOptions | null {
  if (args.includes("--help") || args.includes("-h")) { printHelp(); return null; }
  if (args.includes("--version") || args.includes("-v")) { console.log(VERSION); return null; }
  let provider: ProviderName = "codex"; let cwd = process.cwd(); let dryRun = false; let workflow = "portfolio-status"; let accessMode: AccessMode = "plan";
  const taskParts: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--provider" || argument === "-p") { const value = requireValue(args, index, argument); if (value !== "codex" && value !== "claude") throw new Error(`Unknown provider "${value}". Use codex or claude.`); provider = value; index += 1; }
    else if (argument === "--cwd" || argument === "-C") { cwd = resolve(requireValue(args, index, argument)); index += 1; }
    else if (argument === "--dry-run") dryRun = true;
    else if (argument === "--write") accessMode = "write";
    else if (argument === "--workflow" || argument === "-w") { workflow = requireValue(args, index, argument); index += 1; }
    else if (argument.startsWith("-")) throw new Error(`Unknown option "${argument}".`);
    else taskParts.push(argument);
  }
  const task = taskParts.join(" ").trim();
  if (!task) throw new Error("A orchestration task is required.");
  return { provider, cwd, dryRun, workflow, accessMode, task };
}

function validateWorkspace(cwd: string, accessMode: AccessMode): void {
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error(`Workspace directory not found: ${cwd}`);
  if (accessMode === "write" && spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], { stdio: "ignore" }).status !== 0) throw new Error("Write mode requires a Git repository.");
}

function main(args: string[]): void {
  try {
    if (args[0] === "workflow") { process.exitCode = runWorkflowCommand(args.slice(1)); return; }
    if (args[0] === "team") { process.exitCode = runTeamCommand(args.slice(1)); return; }
    if (args[0] === "run") { process.exitCode = runTeamRunCommand(args.slice(1)); return; }
    if (args[0] === "doctor") { process.exitCode = runDoctorCommand(); return; }
    if (args[0] === "discover") { process.exitCode = runDiscoverCommand(args.slice(1)); return; }
    if (args[0] === "qa-gate") { process.exitCode = runQaGateCommand(args.slice(1)); return; }
    const options = parseArgs(args); if (!options) return;
    validateWorkspace(options.cwd, options.accessMode);
    const provider = createProvider(options.provider); const workflow = getWorkflow(options.workflow);
    if (!workflow) throw new Error(`Unknown workflow "${options.workflow}".`);
    if (!options.dryRun) provider.assertAvailable();
    console.log(`Company Orchestrator Agent\nProvider: ${provider.name}\nWorkspace: ${options.cwd}\nWorkflow: ${workflow.name}\nAccess: ${options.accessMode}\nBrief: ${options.task}\n`);
    const result = provider.run({ cwd: options.cwd, task: createTeamTask(options.task, workflow, options.accessMode), dryRun: options.dryRun, accessMode: options.accessMode });
    process.exitCode = result.exitCode;
  } catch (error) { console.error(`Error: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}

main(process.argv.slice(2));
