import type { WorkflowDefinition } from "../core/workflow.ts";
export const crossAgentDeliveryWorkflow: WorkflowDefinition = { id: "cross-functional-feature", name: "Cross-Functional Feature Planning", description: "Create one implementation contract coordinating frontend, backend, iOS, design, and QA.", requiredInputs: ["Product feature request", "Target workspace"], stages: [
  { id: "product-brief", role: "coordinator", goal: "Define users, outcome, scope, non-goals, acceptance criteria, and success metrics." },
  { id: "evidence-and-risks", role: "researcher", goal: "Inspect current behavior, dependencies, evidence, assumptions, and unknowns." },
  { id: "solution-contract", role: "strategist", goal: "Write PRD, user stories, and FE/BE/iOS/Design/QA task briefs; define API schemas, authorization, validation, errors, ownership, and versioning.", requiresApproval: true },
  { id: "delivery-plan", role: "delivery", goal: "Map FE/BE dependency order, API readiness gate, test environments, analytics, release checklist, and rollback plan." },
  { id: "cross-functional-review", role: "reviewer", goal: "Challenge API compatibility, security, ambiguity, test coverage, and unresolved handoff risks." },
], successCriteria: ["One shared feature contract defines outcome, scope, and acceptance criteria", "FE and BE receive compatible task briefs and API contract", "Authorization, validation, errors, loading, empty, and migration behavior are explicit", "Dependencies prevent FE and BE from blocking each other", "QA gets traceable acceptance criteria and release checklist"] };
