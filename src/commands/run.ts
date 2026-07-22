import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  listTeamRuns,
  loadTeamRun,
  resumeTeamRun,
  runDirectory,
  startTeamRun,
  type TeamRunState,
} from "../core/team-runner.ts";
import type { AgentRole } from "../core/workflow.ts";
import type { AccessMode, ProviderName } from "../providers/provider.ts";
import { getWorkflow } from "../workflows/index.ts";
import {
  apiRateCards,
  estimateApiUsd,
  estimateTeamTokens,
  formatTokenRange,
  formatUsdRange,
  estimateRoi,
} from "../core/usage-estimate.ts";

interface RunOptions {
  cwd: string;
  provider: ProviderName;
  workflowId: string;
  accessMode: AccessMode;
  roleProviders: Partial<Record<AgentRole, ProviderName>>;
  autoApprove: boolean;
  approve: boolean;
  approvalStage?: string;
  cancel: boolean;
  dryRun: boolean;
  task: string;
  billing: "subscription" | "api";
  productManagerRate?: number;
  hoursSaved?: number;
  runsPerMonth: number;
}

const roles: AgentRole[] = ["coordinator", "researcher", "strategist", "delivery", "reviewer"];

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${option} requires a value.`);
  return value;
}

function providerName(value: string): ProviderName {
  if (value !== "codex" && value !== "claude") throw new Error(`Unknown provider "${value}".`);
  return value;
}

function parseRoleProvider(value: string): [AgentRole, ProviderName] {
  const [role, provider] = value.split("=");
  if (!roles.includes(role as AgentRole) || !provider) {
    throw new Error("--role-provider must use <role>=codex|claude.");
  }
  return [role as AgentRole, providerName(provider)];
}

function parseRunOptions(args: string[]): RunOptions {
  const options: RunOptions = {
    cwd: process.cwd(),
    provider: "codex",
    workflowId: "portfolio-status",
    accessMode: "plan",
    roleProviders: {},
    autoApprove: false,
    approve: false,
    cancel: false,
    dryRun: false,
    task: "",
    billing: "subscription",
    runsPerMonth: 1,
  };
  const taskParts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--cwd" || argument === "-C") {
      options.cwd = resolve(requireValue(args, index, argument));
      index += 1;
    } else if (argument === "--provider" || argument === "-p") {
      options.provider = providerName(requireValue(args, index, argument));
      index += 1;
    } else if (argument === "--workflow" || argument === "-w") {
      options.workflowId = requireValue(args, index, argument);
      index += 1;
    } else if (argument === "--role-provider") {
      const [role, provider] = parseRoleProvider(requireValue(args, index, argument));
      options.roleProviders[role] = provider;
      index += 1;
    } else if (argument === "--write") {
      options.accessMode = "write";
    } else if (argument === "--auto-approve") {
      options.autoApprove = true;
    } else if (argument === "--approve") {
      options.approve = true;
    } else if (argument === "--approve-stage") {
      options.approvalStage = requireValue(args, index, argument);
      options.approve = true;
      index += 1;
    } else if (argument === "--cancel") {
      options.cancel = true;
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--billing") {
      const billing = requireValue(args, index, argument);
      if (billing !== "subscription" && billing !== "api") {
        throw new Error("--billing must be subscription or api.");
      }
      options.billing = billing;
      index += 1;
    } else if (argument === "--product-manager-rate" || argument === "--hours-saved" || argument === "--runs-per-month") {
      const parsed = Number(requireValue(args, index, argument));
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${argument} must be a positive number.`);
      if (argument === "--product-manager-rate") options.productManagerRate = parsed;
      if (argument === "--hours-saved") options.hoursSaved = parsed;
      if (argument === "--runs-per-month") options.runsPerMonth = parsed;
      index += 1;
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown run option "${argument}".`);
    } else {
      taskParts.push(argument);
    }
  }
  options.task = taskParts.join(" ").trim();
  return options;
}

function validateWorkspace(cwd: string, write: boolean): void {
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new Error(`Workspace directory not found: ${cwd}`);
  }
  if (write) {
    const result = spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
    if (result.status !== 0) throw new Error("Write mode requires a Git repository.");
  }
}

function printState(state: TeamRunState): void {
  console.log(`Run: ${state.id}`);
  console.log(`Status: ${state.status}`);
  console.log(`Workflow: ${state.workflowId}`);
  console.log(`Access: ${state.accessMode}`);
  console.log(`Artifacts: ${runDirectory(state.workspace, state.id)}`);
  console.log("Stages:");
  for (const stage of state.stages) {
    console.log(`- ${stage.id.padEnd(14)} ${stage.status.padEnd(18)} ${stage.role} (${stage.provider})`);
  }
  if (state.status === "awaiting_approval") {
    console.log(`\nResume with: company-orchestrator run resume ${state.id} --cwd ${JSON.stringify(state.workspace)} --approve`);
  }
}

function printEstimate(options: RunOptions): void {
  const workflow = getWorkflow(options.workflowId);
  if (!workflow) throw new Error(`Unknown workflow "${options.workflowId}".`);
  const estimate = estimateTeamTokens(options.task, workflow, options.provider, options.roleProviders);
  console.log("Estimated token activity (low / typical / high)");
  console.log(`Model calls: ${estimate.calls}`);
  for (const stage of estimate.stages) {
    console.log(`- ${stage.id.padEnd(14)} ${stage.provider.padEnd(7)} ${formatTokenRange(stage)}`);
  }
  console.log(`Total: ${formatTokenRange(estimate.total)}`);
  for (const [provider, range] of Object.entries(estimate.byProvider)) {
    console.log(`${provider}: ${formatTokenRange(range)}`);
  }
  if (options.billing === "subscription") {
    console.log("USD: included-plan usage; incremental API charge is $0 while subscription allowance remains.");
    console.log("Credits, overages, and the subscription fee itself are not included.");
  } else {
    console.log("Estimated API cost (low / typical / high; assumes 85% input, 15% output, no cache discount)");
    let total = { low: 0, typical: 0, high: 0 };
    for (const [provider, range] of Object.entries(estimate.byProvider)) {
      const rate = apiRateCards[provider as ProviderName];
      const usd = estimateApiUsd(range, rate);
      total = { low: total.low + usd.low, typical: total.typical + usd.typical, high: total.high + usd.high };
      console.log(`- ${provider} (${rate.model}): ${formatUsdRange(usd)}`);
    }
    console.log(`API total: ${formatUsdRange(total)}`);
    console.log(`Rate cards checked: ${Object.values(apiRateCards).map((rate) => rate.checkedAt).sort().at(-1)}`);
    if ((options.productManagerRate === undefined) !== (options.hoursSaved === undefined)) {
      throw new Error("ROI requires both --product-manager-rate and --hours-saved.");
    }
    if (options.productManagerRate !== undefined && options.hoursSaved !== undefined) {
      const roi = estimateRoi(total.typical, options.productManagerRate, options.hoursSaved, options.runsPerMonth);
      const money = (value: number) => `$${value.toFixed(2)}`;
      console.log("Investment estimate (typical API cost)");
      console.log(`- Human value per run: ${money(roi.valuePerRun)}`);
      console.log(`- AI cost per run: ${money(total.typical)}`);
      console.log(`- Break-even time saved: ${(roi.breakEvenHours * 60).toFixed(1)} minutes`);
      console.log(`- Net value per run: ${money(roi.netPerRun)}`);
      console.log(`- ROI: ${Number.isFinite(roi.roiPercent) ? `${roi.roiPercent.toFixed(0)}%` : "unbounded at zero marginal cost"}`);
      console.log(`- Monthly (${options.runsPerMonth} runs): AI ${money(roi.monthlyAiCost)}, value ${money(roi.monthlyValue)}, net ${money(roi.monthlyNet)}`);
    }
  }
  console.log("Planning estimate only: repository size, actual model, caching, retries, tool fees, taxes, and task complexity change cost.\n");
}

export async function runTeamRunCommand(args: string[]): Promise<number> {
  const [action, identifier, ...rest] = args;
  if (!action || action === "help" || action === "--help" || action === "-h") {
    console.log(`Team run commands

Usage:
  company-orchestrator run start [options] <task>
  company-orchestrator run estimate [options] <task>
  company-orchestrator run resume <id> --cwd <path> [--approve|--approve-stage <id>|--cancel]
  company-orchestrator run status <id> --cwd <path>
  company-orchestrator run list --cwd <path>

Start options:
  -C, --cwd <path>             Target Git workspace
  -p, --provider <name>        Default provider: codex or claude
  -w, --workflow <id>          Workflow (default: portfolio-status)
      --role-provider <r>=<p>  Override a role provider; repeatable
      --write                  Permit scoped orchestration artifacts or product edits
      --auto-approve           Continue reversible internal graph nodes without pausing
      --dry-run                Persist a run using provider command previews
      --billing <mode>         subscription (default) or api cost estimate
      --product-manager-rate <usd>    Fully loaded product management cost per hour
      --hours-saved <hours>    Expected product management hours saved per run
      --runs-per-month <count> Monthly volume for ROI projection

Roles: coordinator, researcher, strategist, delivery, reviewer`);
    return 0;
  }

  if (action === "list") {
    const options = parseRunOptions([identifier, ...rest].filter((item): item is string => Boolean(item)));
    validateWorkspace(options.cwd, false);
    const runs = listTeamRuns(options.cwd);
    if (runs.length === 0) console.log("No team runs found.");
    for (const run of runs) console.log(`${run.id}  ${run.status.padEnd(18)} ${run.workflowId} — ${run.task}`);
    return 0;
  }

  if (action === "status") {
    if (!identifier) throw new Error("run status requires a run ID.");
    const options = parseRunOptions(rest);
    printState(loadTeamRun(options.cwd, identifier));
    return 0;
  }

  if (action === "resume") {
    if (!identifier) throw new Error("run resume requires a run ID.");
    const options = parseRunOptions(rest);
    const saved = loadTeamRun(options.cwd, identifier);
    validateWorkspace(options.cwd, saved.accessMode === "write");
    const state = await resumeTeamRun({
      workspace: options.cwd,
      runId: identifier,
      approve: options.approve,
      approvalStage: options.approvalStage,
      autoApprove: options.autoApprove,
      dryRun: options.dryRun,
      cancel: options.cancel,
    });
    printState(state);
    return state.status === "failed" ? 1 : 0;
  }

  if (action === "estimate") {
    const options = parseRunOptions([identifier, ...rest].filter((item): item is string => Boolean(item)));
    if (!options.task) throw new Error("run estimate requires a task.");
    printEstimate(options);
    return 0;
  }

  if (action !== "start") throw new Error(`Unknown run action "${action}".`);
  const options = parseRunOptions([identifier, ...rest].filter((item): item is string => Boolean(item)));
  if (!options.task) throw new Error("run start requires a task.");
  validateWorkspace(options.cwd, options.accessMode === "write");
  const workflow = getWorkflow(options.workflowId);
  if (!workflow) throw new Error(`Unknown workflow "${options.workflowId}".`);
  printEstimate(options);
  const state = await startTeamRun({
    task: options.task,
    workspace: options.cwd,
    workflow,
    accessMode: options.accessMode,
    defaultProvider: options.provider,
    roleProviders: options.roleProviders,
    autoApprove: options.autoApprove,
    dryRun: options.dryRun,
  });
  printState(state);
  return state.status === "failed" ? 1 : 0;
}
