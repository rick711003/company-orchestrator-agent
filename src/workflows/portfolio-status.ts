import type { WorkflowDefinition } from "../core/workflow.ts";
export const portfolioStatusWorkflow: WorkflowDefinition = { id: "market-discovery", name: "Product Discovery", description: "Turn a growth question into evidence-based customer, market, and positioning insight.", requiredInputs: ["Product or market question", "Target product workspace"], stages: [
  { id: "growth-brief", role: "coordinator", goal: "Define the decision, target outcome, constraints, and success measures." },
  { id: "market-research", role: "researcher", goal: "Inspect product evidence, segments, competitors, jobs, and unmet needs; propose a direction for approval.", requiresApproval: true },
  { id: "positioning", role: "strategist", goal: "Create truthful positioning, message hierarchy, channel hypotheses, and draft assets." },
  { id: "measurement", role: "delivery", goal: "Define the funnel, events, cohorts, baselines, and decision thresholds." },
  { id: "growth-review", role: "reviewer", goal: "Challenge evidence, claims, privacy, brand risk, and next-step priority." },
], successCriteria: ["Target segments and assumptions are explicit", "Positioning is differentiated and truthful", "Channel choices are testable", "Measurement separates baselines, forecasts, and observed results", "Risks and next decision are clear"] };
