import type { WorkflowDefinition } from "../core/workflow.ts";

export const crossAgentDeliveryWorkflow: WorkflowDefinition = {
  id: "cross-functional-feature",
  name: "Cross-Functional Feature Planning",
  description: "Create one traceable delivery contract across PM, Design, FE, BE, iOS, Android, QA, Release, and Growth.",
  requiredInputs: ["Product feature request", "Target workspace"],
  stages: [
    { id: "product-brief", role: "coordinator", goal: "Define users, outcome, scope, non-goals, acceptance criteria, success metrics, and declared platforms." },
    { id: "evidence-and-risks", role: "researcher", goal: "Inspect current behavior, dependencies, evidence, assumptions, and unknowns." },
    { id: "solution-contract", role: "strategist", goal: "Create the complete Surface Inventory plus Design, FE, BE, iOS, Android, QA, Release, and Growth briefs; define design tokens, asset manifest, API schemas, ownership, and versioning." },
    { id: "delivery-plan", role: "delivery", goal: "Map dependency order, automatic notifications and routing, Design and QA gates, analytics, release checklist, rollback, and manual production approval." },
    { id: "cross-functional-review", role: "reviewer", goal: "Reject missing surfaces, owners, variants, artifacts, API behavior, evidence cells, or unresolved handoff risk." },
  ],
  successCriteria: [
    "One versioned Surface Inventory traces every surface and state through Design, engineering, QA, and Release",
    "Every applicable company role receives an explicit task brief or is marked not applicable with rationale",
    "Typography, components, assets, API behavior, dependencies, and notification recipients are explicit",
    "Missing or stale evidence blocks automatic downstream dispatch",
    "Production release remains manual",
  ],
};
