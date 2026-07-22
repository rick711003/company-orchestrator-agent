import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createProvider } from "../providers/index.ts";
import type { AccessMode, AgentProvider, ProviderName } from "../providers/provider.ts";
import { getWorkflow } from "../workflows/index.ts";
import { getTeamMember } from "./team.ts";
import type { AgentRole, WorkflowDefinition, WorkflowStage } from "./workflow.ts";
import { acquireRunLock, cancellationRequested, clearCancellationRequest, requestRunCancellation } from "./run-lock.ts";
import { appendRunEvent } from "./run-events.ts";
import { professionalCapabilityPrompt } from "./professional-capabilities.ts";

export type TeamRunStatus = "running" | "awaiting_approval" | "failed" | "cancelled" | "completed";
export type StageRunStatus = "pending" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled" | "blocked";

export interface StageRunRecord {
  id: string;
  role: AgentRole;
  provider: ProviderName;
  status: StageRunStatus;
  outputFile?: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  dependsOn: string[];
  concurrencyKey: string;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  inputFingerprint?: string;
  outputFingerprint?: string;
  invalidatedAt?: string;
  executionId?: string;
  semanticOutcome?: "pass" | "blocked" | "failed";
}

export interface ApprovalRecord {
  nodeId: string;
  inputFingerprint: string;
  executionId?: string;
  approver: string;
  decision: "approved";
  approvedAt: string;
}

export interface TeamRunState {
  schemaVersion: 3;
  revision: number;
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
  approvals: ApprovalRecord[];
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
  approvalStage?: string;
  autoApprove?: boolean;
  dryRun?: boolean;
  cancel?: boolean;
}

type ProviderFactory = (name: ProviderName) => AgentProvider;

const ARTIFACT_DIRECTORY = ".company-orchestrator/runs";
const HANDOFF_LIMIT = 6_000;

function semanticOutcome(output: string): "pass" | "blocked" | "failed" {
  const explicit = [...output.matchAll(/^STAGE_OUTCOME:\s*(PASS|BLOCKED|FAILED)\s*$/gim)].at(-1)?.[1]?.toLowerCase();
  if (explicit === "blocked" || explicit === "failed" || explicit === "pass") return explicit;
  const tail = output.slice(-12_000);
  if (/(?:結論|conclusion)\s*[:：][^\n]{0,80}(?:REJECTED|BLOCKED|拒絕|阻擋)/i.test(tail)) return "blocked";
  if (/(?:結論|conclusion)\s*[:：][^\n]{0,80}(?:FAILED|FAILURE|失敗)/i.test(tail)) return "failed";
  return "pass";
}

function createCrossFunctionalArtifacts(workspace: string, runId: string, task: string): void {
  const directory = runDirectory(workspace, runId);
  const files: Record<string, string> = {
    "CAPABILITY_LEDGER.md": "# Professional Capability Ledger\\n\\nEach applicable capability must be accepted with current evidence and an independent verifier before product closure. Use not-applicable only with rationale and reviewer.\\n\\n| Role | Capability IDs | Status | Evidence | Verifier | Updated |\\n| --- | --- | --- | --- | --- | --- |\\n| Orchestrator | GOV-01, PORT-01, EVID-01, OPS-01, AI-01 | pending | | | |\\n| Product | PROD-01, PROD-02, PROD-03, PROD-04, PROD-05 | pending | | | |\\n| Design | DES-01, DES-02, DES-03, DES-04, DES-05 | pending | | | |\\n| Frontend | WEB-01, WEB-02, WEB-03, WEB-04, WEB-05 | pending | | | |\\n| Backend | BE-01, BE-02, BE-03, BE-04, BE-05 | pending | | | |\\n| iOS | IOS-01, IOS-02, IOS-03, IOS-04, IOS-05 | pending | | | |\\n| Android | AND-01, AND-02, AND-03, AND-04, AND-05 | pending | | | |\\n| QA | QA-01, QA-02, QA-03, QA-04, QA-05 | pending | | | |\\n| Release | REL-01, REL-02, REL-03, REL-04, REL-05 | pending | | | |\\n| Growth | GRW-01, GRW-02, GRW-03, GRW-04, GRW-05 | pending | | | |\\n",
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
    "SECURITY_DATA_CONTRACT.md": "# Security, Privacy, and Data Contract\n\nstatus: draft\nversion: 1\naccountable-owner: Product\nresponsible-owner: Backend\nverifier: QA\n\n## Purpose, classification, and consent\n\n## Threat and abuse model\n\n## Authorization, secrets, dependencies, and client controls\n\n## Retention, deletion, export, backup, and restore\n\n## Incident, recovery, rollout, and rollback\n",
    "ANALYTICS_CONTRACT.md": "# Analytics Contract\n\nstatus: draft\nversion: 1\nmetric-owner: Growth\nproduct-approver: Product\nimplementation-owner: Engineering\nverifier: QA\n\n## Events, properties, identity, PII, and consent\n\n## Delivery, ordering, duplication, omission, and offline retry\n\n## Dashboard mapping, baseline, thresholds, guardrails, and kill criteria\n\n## Production verification owner\n",
    "SUPPORT_VOC_LOG.md": "# Support and Voice-of-Customer Log\n\nstatus: active\naccountable-owner: Product\ntriage-owner: QA\nroute-owner: Orchestrator\n\n## Intake, consent/classification, severity, impact, owner, and SLA\n\n## Reproduction, workaround, linked requirement/incident, next action, and closure\n",
    "MANUAL_APPROVALS.md": "# Manual Approvals\n\nEach section is independent. Set approved only with approver, scope, artifact-version, target, approved-at, expires-at, and revoked.\n\n## production-deploy\napproved: false\n\n## store-submission\napproved: false\n\n## external-content\napproved: false\n\n## customer-contact\napproved: false\n\n## campaign-spend\napproved: false\n\n## production-data-change\napproved: false\n",
    "DEPENDENCY_MAP.md": "# Dependency Map\n\nProduct scope + security/data + analytics + support contracts → Design inventory/tokens/assets + Backend contract → FE/iOS/Android implementation → runtime Design acceptance → QA → Release validation → scoped manual approval and external deployment evidence → production verification → stabilization → PM outcome close/reopen\n",
    "RELEASE_CHECKLIST.md": "# Release Checklist\n\n- [ ] Surface Inventory complete\n- [ ] Security/data, analytics, and support responsibilities approved\n- [ ] Design tokens and asset manifest approved\n- [ ] Applicable FE, BE, iOS, and Android handoffs accepted\n- [ ] Runtime Design acceptance recorded\n- [ ] QA passed\n- [ ] Final artifacts, analytics, rollback, and store metadata validated\n- [ ] Required human authority recorded separately\n- [ ] External deployment evidence recorded\n- [ ] Production verification and stabilization complete\n- [ ] PM outcome review recorded close/reopen decision\n",
  };
  for (const [name, content] of Object.entries(files)) { const path = join(directory, name); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, name === "CAPABILITY_LEDGER.md" ? content.replaceAll("\\n", "\n") : content); }
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
  state.revision = (state.revision ?? 0) + 1;
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
  const raw = JSON.parse(readFileSync(path, "utf8")) as { schemaVersion?: number };
  const loadedSchemaVersion = raw.schemaVersion;
  const state = raw as unknown as TeamRunState;
  if ((loadedSchemaVersion !== 1 && loadedSchemaVersion !== 2 && loadedSchemaVersion !== 3) || state.id !== runId || resolve(state.workspace) !== expectedWorkspace) {
    throw new Error(`Unsupported or corrupt team run state: ${path}`);
  }
  const workflow = getWorkflow(state.workflowId);
  if (workflow && loadedSchemaVersion !== 3) {
    if (loadedSchemaVersion === 1) state.stages.forEach((record, index) => {
      const definition = workflow.stages[index];
      record.dependsOn = definition.dependsOn ?? (index === 0 ? [] : [workflow.stages[index - 1].id]);
      record.concurrencyKey = definition.concurrencyKey ?? (stageAccessMode(state, definition) === "write" ? "workspace-write" : "stage:" + definition.id);
      record.attempts = record.startedAt ? 1 : 0;
      record.maxAttempts = definition.maxAttempts ?? 3;
      record.timeoutMs = definition.timeoutMs ?? 30 * 60 * 1000;
    });
    state.schemaVersion = 3;
    state.revision = 0;
    state.approvals = (state.approvedStages ?? []).map((nodeId) => ({ nodeId, inputFingerprint: "legacy-unscoped", approver: "legacy-migration", decision: "approved", approvedAt: state.updatedAt }));
    saveState(state);
  }
  const validStatus: TeamRunStatus[] = ["running", "awaiting_approval", "failed", "cancelled", "completed"];
  const validStageStatus: StageRunStatus[] = ["pending", "running", "awaiting_approval", "completed", "failed", "cancelled", "blocked"];
  const validProviders: ProviderName[] = ["codex", "claude"];
  if (
    !workflow ||
    typeof state.task !== "string" ||
    (state.accessMode !== "plan" && state.accessMode !== "write") ||
    !validProviders.includes(state.defaultProvider) ||
    !validStatus.includes(state.status) ||
    !Number.isInteger(state.revision) || state.revision < 0 ||
    !Array.isArray(state.approvals) ||
    !Number.isInteger(state.currentStageIndex) ||
    state.currentStageIndex < 0 ||
    state.currentStageIndex > workflow.stages.length ||
    state.stages.length !== workflow.stages.length
  ) {
    throw new Error(`Unsupported or corrupt team run state: ${path}`);
  }
  for (const approval of state.approvals) {
    if (typeof approval.nodeId !== "string" || typeof approval.inputFingerprint !== "string" || typeof approval.approver !== "string" || approval.decision !== "approved" || Number.isNaN(Date.parse(approval.approvedAt))) {
      throw new Error(`Unsupported or corrupt team run state: ${path}`);
    }
  }
  let fingerprintsChanged = false;
  let verdictChanged = false;
  for (let index = 0; index < state.stages.length; index += 1) {
    const record = state.stages[index];
    const definition = workflow.stages[index];
    if (
      record.id !== definition.id ||
      record.role !== definition.role ||
      !validProviders.includes(record.provider) ||
      !validStageStatus.includes(record.status) ||
      !Array.isArray(record.dependsOn) ||
      !Number.isInteger(record.attempts) || record.attempts < 0 ||
      !Number.isInteger(record.maxAttempts) || record.maxAttempts < 1 ||
      !Number.isInteger(record.timeoutMs) || record.timeoutMs < 100
    ) {
      throw new Error(`Unsupported or corrupt team run state: ${path}`);
    }
    if (record.outputFile && (basename(record.outputFile) !== record.outputFile || !/^\d{2}-[A-Za-z0-9_-]+\.md$/.test(record.outputFile))) {
      throw new Error(`Unsafe output path in team run state: ${path}`);
    }
    if (record.outputFile) {
      const outputPath = join(runDirectory(state.workspace, state.id), record.outputFile);
      if (!existsSync(outputPath)) throw new Error(`Missing stage output in team run state: ${outputPath}`);
      const fingerprint = createHash("sha256").update(readFileSync(outputPath, "utf8")).digest("hex");
      if (record.outputFingerprint !== fingerprint) {
        record.outputFingerprint = fingerprint;
        fingerprintsChanged = true;
      }
      const outcome = semanticOutcome(readFileSync(outputPath, "utf8"));
      record.semanticOutcome = outcome;
      if (record.status === "completed" && outcome !== "pass") {
        record.status = "failed";
        record.exitCode = outcome === "blocked" ? 2 : 1;
        verdictChanged = true;
      }
    }
  }
  for (const [role, provider] of Object.entries(state.roleProviders)) {
    if (!(["coordinator", "researcher", "strategist", "delivery", "reviewer"] as string[]).includes(role) || !validProviders.includes(provider)) {
      throw new Error(`Unsupported or corrupt team run state: ${path}`);
    }
  }
  state.workspace = expectedWorkspace;
  if (verdictChanged) {
    state.status = "failed";
    state.currentStageIndex = Math.max(0, state.stages.findIndex((record) => record.status !== "completed"));
  }
  if (fingerprintsChanged || verdictChanged) saveState(state);
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
  const completed = state.stages.filter((stage) => stage.status === "completed" && stage.outputFile);
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
  const criteria = [...workflow.successCriteria, professionalCapabilityPrompt()].map((item) => `- ${item}`).join("\n");
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

function stageInputFingerprint(state: TeamRunState, workflow: WorkflowDefinition, index: number): string {
  const stage = workflow.stages[index];
  const record = state.stages[index];
  const dependencyOutputs = record.dependsOn.map((id) => {
    const dependency = state.stages.find((candidate) => candidate.id === id);
    return [id, dependency?.outputFingerprint ?? "missing"];
  });
  return createHash("sha256").update(JSON.stringify({
    task: state.task,
    workflow: { id: workflow.id, stages: workflow.stages, successCriteria: workflow.successCriteria },
    stage: stage.id,
    goal: stage.goal,
    accessMode: state.accessMode,
    provider: selectedProvider(state, stage.role),
    roleProviders: state.roleProviders,
    dependencyOutputs,
  })).digest("hex");
}

function invalidateDescendants(state: TeamRunState, rootIds: string[]): void {
  const queue = [...rootIds];
  const invalidated = new Set(rootIds);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const candidate of state.stages) {
      if (candidate.dependsOn.includes(id) && !invalidated.has(candidate.id)) {
        invalidated.add(candidate.id);
        queue.push(candidate.id);
      }
    }
  }
  for (const record of state.stages) {
    if (!invalidated.has(record.id)) continue;
    record.status = "pending";
    record.inputFingerprint = undefined;
    record.outputFingerprint = undefined;
    record.exitCode = undefined;
    record.invalidatedAt = now();
    record.executionId = undefined;
  }
  state.approvals = state.approvals.filter((approval) => !invalidated.has(approval.nodeId));
  state.approvedStages = state.approvedStages.filter((id) => !invalidated.has(id));
}

async function executeDagRun(
  state: TeamRunState,
  factory: ProviderFactory,
  options: { approve?: boolean; approvalStage?: string; autoApprove?: boolean; dryRun?: boolean; cancel?: boolean },
): Promise<TeamRunState> {
  const workflow = getWorkflow(state.workflowId);
  if (!workflow) throw new Error(`Workflow "${state.workflowId}" is no longer available.`);

  const directory = runDirectory(state.workspace, state.id);
  if (options.cancel || cancellationRequested(directory)) {
    for (const record of state.stages) if (record.status === "pending" || record.status === "running" || record.status === "blocked") record.status = "cancelled";
    state.status = "cancelled";
    appendRunEvent(directory, { type: "RUN_CANCELLED", runId: state.id });
    clearCancellationRequest(directory);
    saveState(state);
    writeFinalReport(state, workflow);
    return state;
  }

  const awaiting = state.stages.filter((record) => record.status === "awaiting_approval");
  if (awaiting.length > 0) {
    if (!options.approve && !options.autoApprove) return state;
    const approvedNow = options.autoApprove
      ? awaiting
      : options.approvalStage
        ? awaiting.filter((record) => record.id === options.approvalStage)
        : awaiting.length === 1 ? awaiting : [];
    if (!options.autoApprove && approvedNow.length === 0) {
      throw new Error(options.approvalStage ? `Stage "${options.approvalStage}" is not awaiting approval.` : "Multiple stages await approval; use --approve-stage <id>.");
    }
    for (const record of approvedNow) {
      record.status = "completed";
      if (!state.approvedStages.includes(record.id)) state.approvedStages.push(record.id);
      state.approvals = state.approvals.filter((approval) => approval.nodeId !== record.id);
      state.approvals.push({ nodeId: record.id, inputFingerprint: record.inputFingerprint ?? stageInputFingerprint(state, workflow, state.stages.indexOf(record)), executionId: record.executionId, approver: options.autoApprove ? "system:auto-approve" : "cli:human", decision: "approved", approvedAt: now() });
      appendRunEvent(directory, { type: "APPROVAL_GRANTED", runId: state.id, nodeId: record.id, executionId: record.executionId, details: { approver: options.autoApprove ? "system:auto-approve" : "cli:human" } });
    }
  }

  const staleRoots: string[] = [];
  state.stages.forEach((record, index) => {
    if (record.status === "completed" && record.inputFingerprint && record.inputFingerprint !== stageInputFingerprint(state, workflow, index)) staleRoots.push(record.id);
  });
  if (staleRoots.length > 0) invalidateDescendants(state, staleRoots);
  for (const record of state.stages) {
    if (record.status === "failed" && record.attempts < record.maxAttempts) record.status = "pending";
    if (record.status === "blocked") record.status = "pending";
    if (record.status === "running") {
      appendRunEvent(directory, { type: "NODE_RECOVERED", runId: state.id, nodeId: record.id, executionId: record.executionId, details: { reason: "scheduler-restart" } });
      record.status = "pending";
    }
  }
  state.status = "running";
  saveState(state);

  while (true) {
    if (state.stages.every((record) => record.status === "completed")) {
      state.status = "completed";
      state.currentStageIndex = state.stages.length;
      saveState(state);
      writeFinalReport(state, workflow);
      return state;
    }
    if (state.stages.some((record) => record.status === "awaiting_approval")) {
      state.status = "awaiting_approval";
      saveState(state);
      writeFinalReport(state, workflow);
      return state;
    }

    const completed = new Set(state.stages.filter((record) => record.status === "completed").map((record) => record.id));
    const ready = state.stages
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => record.status === "pending" && record.attempts < record.maxAttempts && record.dependsOn.every((id) => completed.has(id)));
    const keys = new Set<string>();
    const batch = ready.filter(({ record }) => {
      if (keys.has(record.concurrencyKey)) return false;
      keys.add(record.concurrencyKey);
      return true;
    });
    if (batch.length === 0) {
      for (const record of state.stages) {
        if (record.status === "pending" && record.dependsOn.some((id) => state.stages.find((candidate) => candidate.id === id)?.status === "failed")) record.status = "blocked";
      }
      state.status = "failed";
      state.currentStageIndex = Math.max(0, state.stages.findIndex((record) => record.status !== "completed"));
      saveState(state);
      writeFinalReport(state, workflow);
      return state;
    }

    for (const { record } of batch) {
      record.status = "running";
      record.startedAt = now();
      record.attempts += 1;
      record.executionId = randomUUID();
      appendRunEvent(directory, { type: "NODE_STARTED", runId: state.id, nodeId: record.id, executionId: record.executionId, details: { attempt: record.attempts } });
    }
    saveState(state);
    const cancellation = new AbortController();
    const cancellationPoll = setInterval(() => { if (cancellationRequested(directory)) cancellation.abort(); }, 250);
    cancellationPoll.unref();
    const results = await Promise.all(batch.map(async ({ record, index }) => {
      const stage = workflow.stages[index];
      const providerName = selectedProvider(state, stage.role);
      const provider = factory(providerName);
      record.provider = providerName;
      console.log(`\n[${state.id}] ${stage.id} — ${getTeamMember(stage.role).title} (${providerName})`);
      try {
        if (!options.dryRun) provider.assertAvailable();
        const runOptions = { cwd: state.workspace, task: createStagePrompt(state, workflow, stage), dryRun: options.dryRun ?? false, accessMode: stageAccessMode(state, stage) };
        const result = provider.runAsync ? await provider.runAsync(runOptions, record.timeoutMs, cancellation.signal) : provider.run(runOptions);
        return { record, index, stage, result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { record, index, stage, result: { exitCode: 1, output: `Provider error: ${message}\n` } };
      }
    }));
    clearInterval(cancellationPoll);

    if (cancellation.signal.aborted || cancellationRequested(directory)) {
      for (const { record } of results) record.status = "cancelled";
      for (const record of state.stages) if (record.status === "pending" || record.status === "blocked") record.status = "cancelled";
      state.status = "cancelled";
      appendRunEvent(directory, { type: "RUN_CANCELLED", runId: state.id });
      clearCancellationRequest(directory);
      saveState(state);
      writeFinalReport(state, workflow);
      return state;
    }

    let failed = false;
    for (const { record, index, stage, result } of results) {
      const outputFile = `${String(index + 1).padStart(2, "0")}-${stage.id}.md`;
      writeFileSync(join(runDirectory(state.workspace, state.id), outputFile), result.output || "(No output)\n");
      record.outputFile = outputFile;
      record.exitCode = result.exitCode;
      record.completedAt = now();
      record.inputFingerprint = stageInputFingerprint(state, workflow, index);
      record.outputFingerprint = createHash("sha256").update(result.output || "(No output)\n").digest("hex");
      record.semanticOutcome = semanticOutcome(result.output || "");
      if (result.exitCode !== 0 || record.semanticOutcome !== "pass") {
        record.status = "failed";
        record.exitCode = result.exitCode !== 0 ? result.exitCode : record.semanticOutcome === "blocked" ? 2 : 1;
        appendRunEvent(directory, { type: "NODE_FAILED", runId: state.id, nodeId: record.id, executionId: record.executionId, details: { exitCode: record.exitCode, semanticOutcome: record.semanticOutcome, attempt: record.attempts } });
        failed = true;
      } else if (stage.requiresApproval && state.accessMode === "write" && !options.autoApprove) {
        record.status = "awaiting_approval";
        appendRunEvent(directory, { type: "APPROVAL_REQUESTED", runId: state.id, nodeId: record.id, executionId: record.executionId, details: { inputFingerprint: record.inputFingerprint } });
      } else {
        record.status = "completed";
        appendRunEvent(directory, { type: "NODE_COMPLETED", runId: state.id, nodeId: record.id, executionId: record.executionId, details: { outputFingerprint: record.outputFingerprint } });
        if (stage.requiresApproval && !state.approvedStages.includes(stage.id)) state.approvedStages.push(stage.id);
      }
    }
    state.currentStageIndex = Math.max(0, state.stages.findIndex((record) => record.status !== "completed"));
    if (failed) {
      const roots = results.filter(({ record }) => record.status === "failed").map(({ record }) => record.id);
      for (const record of state.stages) if (record.dependsOn.some((id) => roots.includes(id))) record.status = "blocked";
      state.status = "failed";
      saveState(state);
      writeFinalReport(state, workflow);
      return state;
    }
    saveState(state);
  }
}

export async function startTeamRun(
  options: StartTeamRunOptions,
  factory: ProviderFactory = createProvider,
): Promise<TeamRunState> {
  const workspace = resolve(options.workspace);
  const id = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}Z-${randomUUID().slice(0, 8)}`;
  mkdirSync(runDirectory(workspace, id), { recursive: true });
  if (options.workflow.id === "cross-agent-delivery") createCrossFunctionalArtifacts(workspace, id, options.task);
  const state: TeamRunState = {
    schemaVersion: 3,
    revision: 0,
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
    approvals: [],
    stages: options.workflow.stages.map((stage) => ({
      id: stage.id,
      role: stage.role,
      provider: options.roleProviders?.[stage.role] ?? options.defaultProvider,
      status: "pending",
      dependsOn: stage.dependsOn ?? (options.workflow.stages.indexOf(stage) === 0 ? [] : [options.workflow.stages[options.workflow.stages.indexOf(stage) - 1].id]),
      concurrencyKey: stage.concurrencyKey ?? "stage:" + stage.id,
      attempts: 0,
      maxAttempts: stage.maxAttempts ?? 3,
      timeoutMs: stage.timeoutMs ?? 30 * 60 * 1000,
    })),
    createdAt: now(),
    updatedAt: now(),
  };
  state.stages.forEach((record, index) => {
    if (!options.workflow.stages[index].concurrencyKey && stageAccessMode(state, options.workflow.stages[index]) === "write") record.concurrencyKey = "workspace-write";
  });
  saveState(state);
  const lock = acquireRunLock(runDirectory(workspace, id));
  try { return await executeDagRun(state, factory, options); } finally { lock.release(); }
}

export async function resumeTeamRun(
  options: ResumeTeamRunOptions,
  factory: ProviderFactory = createProvider,
): Promise<TeamRunState> {
  const directory = runDirectory(resolve(options.workspace), options.runId);
  if (options.cancel) requestRunCancellation(directory);
  let lock;
  try { lock = acquireRunLock(directory); } catch (error) {
    if (options.cancel) return loadTeamRun(options.workspace, options.runId);
    throw error;
  }
  const state = loadTeamRun(options.workspace, options.runId);
  if (state.status === "cancelled") { lock.release(); return state; }
  try { return await executeDagRun(state, factory, options); } finally { lock.release(); }
}
