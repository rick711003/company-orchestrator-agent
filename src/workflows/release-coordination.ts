import type { WorkflowDefinition } from "../core/workflow.ts";
export const releaseCoordinationWorkflow: WorkflowDefinition = { id: "launch-campaign", name: "Roadmap Planning", description: "Prepare an approval-ready launch plan, assets, measurement, and risk review.", requiredInputs: ["Launch scope", "Target product workspace"], stages: [
  { id: "launch-brief", role: "coordinator", goal: "Define launch goal, audience, constraints, ownership, and approval gates." },
  { id: "audience-and-market", role: "researcher", goal: "Confirm audience, competitive context, objections, and launch opportunity." },
  { id: "launch-assets", role: "strategist", goal: "Draft ASO, content, lifecycle, partnership, and campaign assets for human approval." },
  { id: "launch-measurement", role: "delivery", goal: "Define attribution, funnel, dashboards, guardrails, and post-launch review cadence." },
  { id: "launch-review", role: "reviewer", goal: "Audit claims, consent, privacy, reputation, measurement, and unresolved risks." },
], successCriteria: ["No external communication or spend occurs without human approval", "Assets use truthful, audience-appropriate claims", "Measurement and ownership are explicit", "User privacy and consent are protected", "Launch risks and decision gates are auditable"] };
