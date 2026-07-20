import type { WorkflowDefinition } from "../core/workflow.ts";
export const portfolioStatusWorkflow: WorkflowDefinition = {
  id: "portfolio-status", name: "Company Portfolio Status", description: "Audit multi-product delivery state, dependencies, evidence freshness, ownership, capacity, and decisions across all company roles.", requiredInputs: ["Company workspace or repository root", "Active product/run inventory"], stages: [
    { id: "portfolio-scope", role: "coordinator", goal: "Resolve active products, runs, objectives, owners, deadlines, and the authoritative status sources." },
    { id: "artifact-audit", role: "researcher", goal: "Inspect repositories, run state, artifacts, tests, approvals, versions, locks, and contradictions rather than trusting summaries.", requiresApproval: true },
    { id: "dependency-analysis", role: "strategist", goal: "Map cross-product/role dependencies, stale approvals, bottlenecks, capacity conflicts, risks, and decision options." },
    { id: "routing-plan", role: "delivery", goal: "Dispatch only dependency-ready reversible work, assign blocked items and retests, and preserve manual external/production gates." },
    { id: "governance-review", role: "reviewer", goal: "Challenge unsupported status, missing owners, systemic repeated failures, boundary violations, and optimistic forecasts." },
  ], successCriteria: ["Status is evidence-backed and timestamped", "Every blocker and dependency has an owner", "Stale or contradictory approvals are rejected", "Partial successes are preserved during retry", "External and production actions remain human-controlled"] };
