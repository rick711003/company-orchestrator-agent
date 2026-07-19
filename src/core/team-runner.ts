import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createProvider } from "../providers/index.ts";
import type { AccessMode, AgentProvider, ProviderName } from "../providers/provider.ts";
import { getWorkflow } from "../workflows/index.ts";
import { getTeamMember } from "./team.ts";
import type { AgentRole, WorkflowDefinition, WorkflowStage } from "./workflow.ts";

export type TeamRunStatus = "running" | "awaiting_approval" | "failed" | "completed";
export type StageRunStatus = "pending" | "running" | "awaiting_approval" | "completed" | "failed";

export interface StageRunRecord {
  id: string;
  role: AgentRole;
  provider: ProviderName;
  status: StageRunStatus;
  outputFile?: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
}

export interface TeamRunState {
  schemaVersion: 1;
  id: string;
  task: string;
  workspace: string;
  workflowId: string;
  accessMode: AccessMode;
  defaultProvider: ProviderName;
  roleProviders: Partial<Record<AgentRole, ProviderName>>;
  status: TeamRunStatus;
  currentStageIndex: number;
  approvedStages: string[];
  stages: StageRunRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface StartTeamRunOptions {
  task: string;
  workspace: string;
  workflow: WorkflowDefinition;
  accessMode: AccessMode;
  defaultProvider: ProviderName;
  roleProviders?: Partial<Record<AgentRole, ProviderName>>;
  autoApprove?: boolean;
  dryRun?: boolean;
}

export interface ResumeTeamRunOptions {
  workspace: string;
  runId: string;
  approve?: boolean;
  autoApprove?: boolean;
  dryRun?: boolean;
}

type ProviderFactory = (name: ProviderName) => AgentProvider;

const ARTIFACT_DIRECTORY = ".company-orchestrator/runs";
const HANDOFF_LIMIT = 24_000;

function createCrossFunctionalArtifacts(workspace: string, runId: string, task: string): void {
  const directory = runDirectory(workspace, runId);
  const files: Record<string, string> = {
    "PRD.md": `# Product Requirements Document\n\nStatus: draft\n\nTask: ${task}\n\n## Problem, users, outcome, scope, rules, platforms, metrics, and decisions\n`,
    "USER_STORIES.md": "# User Stories and Acceptance Criteria\n\nStatus: draft\n\n- Requirement ID:\n- Story:\n- Acceptance criteria:\n- Surface/state IDs:\n",
    "FEATURE_CONTRACT.md": `# Feature Contract\n\nTask: ${task}\n\n## Outcome\n\n## Scope and non-goals\n\n## User stories and acceptance criteria\n\n## Shared states\n\n## Owners and decisions\n`,
    "tasks/frontend.md": "# Frontend Task Brief\n\n## UI scope\n\n## API integration\n\n## States and acceptance criteria\n",
    "tasks/backend.md": "# Backend Task Brief\n\n## Domain and API scope\n\n## Validation, authorization, errors\n\n## Data and migration considerations\n",
    "tasks/ios.md": "# iOS Task Brief\n\n## Screen and flow scope\n\n## API integration\n\n## States and acceptance criteria\n",
    "tasks/android.md": "# Android Task Brief\n\n## Screen and flow scope\n\n## API integration\n\n## States and acceptance criteria\n",
    "tasks/design.md": "# Design Task Brief\n\n## Surface and state inventory\n\n## Typography and component tokens\n\n## Asset manifest and runtime acceptance\n",
    "tasks/qa.md": "# QA Task Brief\n\n## Acceptance tests\n\n## Regression and edge cases\n\n## Release gates\n",
    "tasks/release.md": "# Release Task Brief\n\n## Artifact and store validation\n\n## Rollback and observability\n\n## Manual release gate\n",
    "tasks/growth.md": "# Growth Task Brief\n\n## Approved claims and assets\n\n## Measurement and consent\n\n## Launch dependencies\n",
    "SURFACE_INVENTORY.md": "# Surface Inventory\n\n| Surface/state | Platform | Owner | Design | Tokens/assets | Runtime ID | Screenshot | Test | Design acceptance | QA | Release |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n",
    "DESIGN_FLOW.md": "# Design Flow\n\nStatus: awaiting-design\n\n## Requirement/surface traceability and all flow branches\n\n## Onboarding and contextual learnability\n\nCover clean install, activation, empty/sample data, permissions, skip/back/resume, recovery, help re-entry, localization, accessibility, and device/viewport variants.\n",
    "DESIGN_SPEC.md": "# Design Specification\n\nStatus: awaiting-design\n\n## Mockups, tokens, assets, variants, and behavior\n",
    "QA_TEST_SPEC.md": "# QA Test Specification\n\nStatus: awaiting-qa\n\n## Requirement/flow/surface traceability and test cases\n\n## Clean-install and no-prior-knowledge validation\n",
    "API_CONTRACT.yaml": "version: 1\nendpoints: []\nevents: []\nauthentication: {}\nerrors: []\n",
    "DEPENDENCY_MAP.md": "# Dependency Map\n\nProduct scope → Design inventory/tokens/assets + Backend contract → FE/iOS/Android implementation → runtime Design acceptance → QA → Release validation → manual production release\n",
    "RELEASE_CHECKLIST.md": "# Release Checklist\n\n- [ ] Surface Inventory complete\n- [ ] Design tokens and asset manifest approved\n- [ ] Applicable FE, BE, iOS, and Android handoffs accepted\n- [ ] Runtime Design acceptance recorded\n- [ ] QA passed\n- [ ] Final artifacts, analytics, rollback, and store metadata validated\n- [ ] Human approved production release\n",
  };
  for (const [name, content] of Object.entries(files)) { const path = join(directory, name); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, content); }
}

function now(): string {
  return new Date().toISOString();
}

function assertRunId(runId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) {
    throw new Error(`Invalid team run ID "${runId}".`);
  }
}

export function runsDirectory(workspace: string): string {
  return join(workspace, ARTIFACT_DIRECTORY);
}

export function runDirectory(workspace: string, runId: string): string {
  assertRunId(runId);
  return join(runsDirectory(workspace), runId);
}

function statePath(workspace: string, runId: string): string {
  return join(runDirectory(workspace, runId), "run.json");
}

function saveState(state: TeamRunState): void {
  state.updatedAt = now();
  const path = statePath(state.workspace, state.id);
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

export function loadTeamRun(workspace: string, runId: string): TeamRunState {
  assertRunId(runId);
  const expectedWorkspace = resolve(workspace);
  const path = statePath(workspace, runId);
  if (!existsSync(path)) throw new Error(`Unknown team run "${runId}" in ${workspace}.`);
  const state = JSON.parse(readFileSync(path, "utf8")) as TeamRunState;
  if (state.schemaVersion !== 1 || state.id !== runId || resolve(state.workspace) !== expectedWorkspace) {
    throw new Error(`Unsupported or corrupt team run state: ${path}`);
  }
  const workflow = getWorkflow(state.workflowId);
  const validStatus: TeamRunStatus[] = ["running", "awaiting_approval", "failed", "completed"];
  const validStageStatus: StageRunStatus[] = ["pending", "running", "awaiting_approval", "completed", "failed"];
  const validProviders: ProviderName[] = ["codex", "claude"];
  if (
    !workflow ||
    typeof state.task !== "string" ||
    (state.accessMode !== "plan" && state.accessMode !== "write") ||
    !validProviders.includes(state.defaultProvider) ||
    !validStatus.includes(state.status) ||
    !Number.isInteger(state.currentStageIndex) ||
    state.currentStageIndex < 0 ||
    state.currentStageIndex > workflow.stages.length ||
    state.stages.length !== workflow.stages.length
  ) {
    throw new Error(`Unsupported or corrupt team run state: ${path}`);
  }
  for (let index = 0; index < state.stages.length; index += 1) {
    const record = state.stages[index];
    const definition = workflow.stages[index];
    if (
      record.id !== definition.id ||
      record.role !== definition.role ||
      !validProviders.includes(record.provider) ||
      !validStageStatus.includes(record.status)
    ) {
      throw new Error(`Unsupported or corrupt team run state: ${path}`);
    }
    if (record.outputFile && (basename(record.outputFile) !== record.outputFile || !/^\d{2}-[A-Za-z0-9_-]+\.md$/.test(record.outputFile))) {
      throw new Error(`Unsafe output path in team run state: ${path}`);
    }
  }
  for (const [role, provider] of Object.entries(state.roleProviders)) {
    if (!(["coordinator", "researcher", "strategist", "delivery", "reviewer"] as string[]).includes(role) || !validProviders.includes(provider)) {
      throw new Error(`Unsupported or corrupt team run state: ${path}`);
    }
  }
  state.workspace = expectedWorkspace;
  return state;
}

export function listTeamRuns(workspace: string): TeamRunState[] {
  const directory = runsDirectory(workspace);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        return [loadTeamRun(workspace, entry.name)];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function selectedProvider(state: TeamRunState, role: AgentRole): ProviderName {
  return state.roleProviders[role] ?? state.defaultProvider;
}

function stageAccessMode(state: TeamRunState, stage: WorkflowStage): AccessMode {
  return state.accessMode === "write" && stage.role === "strategist" ? "write" : "plan";
}

function priorHandoffs(state: TeamRunState): string {
  const completed = state.stages.slice(0, state.currentStageIndex).filter((stage) => stage.outputFile);
  if (completed.length === 0) return "No previous handoff; inspect the repository directly.";

  return completed
    .map((stage) => {
      const path = join(runDirectory(state.workspace, state.id), stage.outputFile!);
      const output = readFileSync(path, "utf8");
      const bounded = output.length > HANDOFF_LIMIT ? `${output.slice(-HANDOFF_LIMIT)}\n[earlier output truncated]` : output;
      return `## ${stage.id} (${getTeamMember(stage.role).title})\n${bounded}`;
    })
    .join("\n\n");
}

export function createStagePrompt(
  state: TeamRunState,
  workflow: WorkflowDefinition,
  stage: WorkflowStage,
): string {
  const member = getTeamMember(stage.role);
  const accessMode = stageAccessMode(state, stage);
  const criteria = workflow.successCriteria.map((item) => `- ${item}`).join("\n");
  return `You are the ${member.title}, operating as an independent member of an company orchestration team.\n\nRun: ${state.id}\nUser task: ${state.task}\nWorkflow: ${workflow.name}\nStage: ${stage.id}\nStage goal: ${stage.goal}\nAccess mode for this stage: ${accessMode}\n\nYour mission:\n${member.mission}\n\nResponsibilities:\n${member.responsibilities.map((item) => `- ${item}`).join("\n")}\n\nPrior team handoffs:\n${priorHandoffs(state)}\n\nRules:\n- Work only on this stage; do not impersonate other roles.\n- Inspect the current repository state and verify inherited claims.\n- Preserve unrelated user changes and never use destructive Git commands.\n- Do not commit, push, change credentials, or write outside the workspace.\n- ${accessMode === "write" ? "Implement the bounded change in the workspace." : "Do not edit workspace files."}\n- End with: findings/actions, evidence, risks, and a concise handoff to the next role.\n\nTeam success criteria:\n${criteria}`;
}

function writeFinalReport(state: TeamRunState, workflow: WorkflowDefinition): void {
  const lines = [
    `# Team Run ${state.id}`,
    "",
    `- Task: ${state.task}`,
    `- Workflow: ${workflow.name}`,
    `- Status: ${state.status}`,
    `- Access: ${state.accessMode}`,
    "",
    "## Stage results",
    "",
    ...state.stages.map(
      (stage) => `- ${stage.id}: ${stage.status} (${getTeamMember(stage.role).title}, ${stage.provider})${stage.outputFile ? ` — ${stage.outputFile}` : ""}`,
    ),
    "",
    "## Success criteria",
    "",
    ...workflow.successCriteria.map((criterion) => `- ${criterion}`),
    "",
  ];
  writeFileSync(join(runDirectory(state.workspace, state.id), "REPORT.md"), lines.join("\n"));
}

function executeRun(
  state: TeamRunState,
  factory: ProviderFactory,
  options: { approve?: boolean; autoApprove?: boolean; dryRun?: boolean },
): TeamRunState {
  const workflow = getWorkflow(state.workflowId);
  if (!workflow) throw new Error(`Workflow "${state.workflowId}" is no longer available.`);

  if (state.status === "awaiting_approval") {
    const awaiting = state.stages[state.currentStageIndex];
    if (!options.approve && !options.autoApprove) return state;
    if (awaiting) {
      awaiting.status = "completed";
      if (!state.approvedStages.includes(awaiting.id)) state.approvedStages.push(awaiting.id);
      state.currentStageIndex += 1;
    }
    state.status = "running";
    saveState(state);
  }

  while (state.currentStageIndex < workflow.stages.length) {
    const stage = workflow.stages[state.currentStageIndex];
    const record = state.stages[state.currentStageIndex];
    const providerName = selectedProvider(state, stage.role);
    const provider = factory(providerName);
    record.provider = providerName;
    record.status = "running";
    record.startedAt = now();
    state.status = "running";
    saveState(state);

    console.log(`\n[${state.id}] ${stage.id} — ${getTeamMember(stage.role).title} (${providerName})`);
    const outputFile = `${String(state.currentStageIndex + 1).padStart(2, "0")}-${stage.id}.md`;
    let result: { exitCode: number; output: string };
    try {
      if (!options.dryRun) provider.assertAvailable();
      result = provider.run({
        cwd: state.workspace,
        task: createStagePrompt(state, workflow, stage),
        dryRun: options.dryRun ?? false,
        accessMode: stageAccessMode(state, stage),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = { exitCode: 1, output: `Provider error: ${message}\n` };
      console.error(result.output.trim());
    }
    writeFileSync(join(runDirectory(state.workspace, state.id), outputFile), result.output || "(No output)\n");
    record.outputFile = outputFile;
    record.exitCode = result.exitCode;
    record.completedAt = now();

    if (result.exitCode !== 0) {
      record.status = "failed";
      state.status = "failed";
      saveState(state);
      writeFinalReport(state, workflow);
      return state;
    }

    if (stage.requiresApproval && state.accessMode === "write" && !options.autoApprove) {
      record.status = "awaiting_approval";
      state.status = "awaiting_approval";
      saveState(state);
      writeFinalReport(state, workflow);
      return state;
    }

    record.status = "completed";
    if (stage.requiresApproval) state.approvedStages.push(stage.id);
    state.currentStageIndex += 1;
    saveState(state);
  }

  state.status = "completed";
  saveState(state);
  writeFinalReport(state, workflow);
  return state;
}

export function startTeamRun(
  options: StartTeamRunOptions,
  factory: ProviderFactory = createProvider,
): TeamRunState {
  const workspace = resolve(options.workspace);
  const id = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}Z-${randomUUID().slice(0, 8)}`;
  mkdirSync(runDirectory(workspace, id), { recursive: true });
  if (options.workflow.id === "cross-agent-delivery") createCrossFunctionalArtifacts(workspace, id, options.task);
  const state: TeamRunState = {
    schemaVersion: 1,
    id,
    task: options.task,
    workspace,
    workflowId: options.workflow.id,
    accessMode: options.accessMode,
    defaultProvider: options.defaultProvider,
    roleProviders: options.roleProviders ?? {},
    status: "running",
    currentStageIndex: 0,
    approvedStages: [],
    stages: options.workflow.stages.map((stage) => ({
      id: stage.id,
      role: stage.role,
      provider: options.roleProviders?.[stage.role] ?? options.defaultProvider,
      status: "pending",
    })),
    createdAt: now(),
    updatedAt: now(),
  };
  saveState(state);
  return executeRun(state, factory, options);
}

export function resumeTeamRun(
  options: ResumeTeamRunOptions,
  factory: ProviderFactory = createProvider,
): TeamRunState {
  const state = loadTeamRun(options.workspace, options.runId);
  if (state.status === "completed") return state;
  if (state.status === "failed") {
    const failed = state.stages[state.currentStageIndex];
    if (failed) {
      failed.status = "pending";
      failed.exitCode = undefined;
    }
    state.status = "running";
    saveState(state);
  }
  return executeRun(state, factory, options);
}
