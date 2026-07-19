import type { AccessMode } from "../providers/provider.ts";
import type { AgentRole, WorkflowDefinition, WorkflowStage } from "./workflow.ts";

export interface TeamMember {
  role: AgentRole;
  title: string;
  mission: string;
  responsibilities: string[];
}

export const productTeam: TeamMember[] = [
  { role: "coordinator", title: "Company Program Director", mission: "Own cross-company routing, state, accountability, and escalation.", responsibilities: ["Resolve the authoritative workflow", "Assign every owner and dependency", "Block advancement when evidence is incomplete"] },
  { role: "researcher", title: "Evidence and Artifact Auditor", mission: "Discover repository artifacts and verify claims against actual evidence.", responsibilities: ["Inspect multi-repo state and run history", "Detect missing, stale, or contradictory artifacts", "Separate facts from self-reported status"] },
  { role: "strategist", title: "Dependency and Contract Coordinator", mission: "Turn PM scope into a complete cross-functional dependency, learnability, and notification graph.", responsibilities: ["Validate Surface Inventory, onboarding/learnability evidence, and role briefs", "Map PM, Design, API, engineering, QA, Release, and Growth contracts", "Route contract changes to every affected owner"] },
  { role: "delivery", title: "Automation Operations Manager", mission: "Advance dependency-ready work automatically and preserve manual production release.", responsibilities: ["Dispatch agents with auto-approval", "Run machine-verifiable gates", "Route rejection and rework without routine user intervention"] },
  { role: "reviewer", title: "Company Governance Reviewer", mission: "Independently audit role boundaries, skipped steps, evidence quality, and release governance.", responsibilities: ["Trace work across roles and repositories", "Find systemic gaps before the user does", "Recommend advance, rework, or block"] },
];

export function getTeamMember(role: AgentRole): TeamMember {
  const member = productTeam.find((candidate) => candidate.role === role);
  if (!member) throw new Error(`No team member is assigned to role "${role}".`);
  return member;
}

function describeStage(stage: WorkflowStage, index: number, accessMode: AccessMode): string {
  const member = getTeamMember(stage.role);
  const approval = stage.requiresApproval && accessMode === "write"
    ? " Record the decision artifact; continue automatically when auto-approve is enabled."
    : "";
  return `${index + 1}. ${stage.id} — ${member.title}: ${stage.goal}${approval}`;
}

export function createTeamTask(
  task: string,
  workflow: WorkflowDefinition,
  accessMode: AccessMode = "plan",
): string {
  const roster = productTeam.map((member) => `- ${member.title}: ${member.mission}`).join("\n");
  const stages = workflow.stages.map((stage, index) => describeStage(stage, index, accessMode)).join("\n");
  const criteria = workflow.successCriteria.map((criterion) => `- ${criterion}`).join("\n");
  return `You are operating as the company orchestration team.\n\nUser task:\n${task}\n\nAccess mode: ${accessMode}\n\nTeam roster:\n${roster}\n\nWorkflow: ${workflow.name}\n${stages}\n\nOperating contract:\n- Execute stages and dependency-ready tasks step by step; record an artifact and evidence before advancing.\n- Treat repository files, run history, runtime screenshots, build logs, and test output as evidence; never trust status labels alone.\n- Do not replace PM, Design, Engineering, QA, Release, or Growth judgment; validate their required inputs and route work to the accountable specialist.\n- Maintain a versioned Surface Inventory for every route, tab, screen, sheet, modal, menu, alert, dialog, toast, system integration, and meaningful state across devices, viewports, locales, themes, and accessibility variants.\n- Every row requires owner, PM acceptance criterion, approved Design, tokens/assets, implementation/runtime evidence, tests, Design acceptance, QA result, and release status. A missing or stale cell blocks advancement.\n- Auto-notify every affected upstream and downstream owner when scope, contracts, dependencies, risk, rejection, or readiness changes; route rework automatically.\n- Continue safe in-scope work automatically. Keep only irreversible external publication, spend, contact, and production release behind explicit human authorization.\n- Independently audit role prompts, workflow stages, generated artifacts, machine gates, CLI entry points, tests, and runtime behavior; fix systemic weaknesses instead of relying on the user to notice them.\n- Finish with decisions, artifacts, exact evidence, unresolved risks, routed next actions, and governance status.\n\nSuccess criteria:\n${criteria}`;
}
