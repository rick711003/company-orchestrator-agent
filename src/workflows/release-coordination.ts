import type { WorkflowDefinition } from "../core/workflow.ts";
export const releaseCoordinationWorkflow: WorkflowDefinition = {
  id: "release-coordination", name: "Cross-Role Release Coordination", description: "Coordinate current Product, Design, Engineering, QA, Release, and Growth evidence to the manual release boundary.", requiredInputs: ["Product run and release candidate", "Current cross-functional handoffs"], stages: [
    { id: "release-scope", role: "coordinator", goal: "Resolve candidate identity, included requirements/platforms, owners, environments, dates, and manual approval authority." },
    { id: "evidence-audit", role: "researcher", goal: "Verify current Product/Design/QA acceptance, engineering runtime evidence, artifact identity, privacy, signing, migrations, rollout, and rollback." },
    { id: "dependency-gates", role: "strategist", goal: "Map release order, stale or missing gates, compatibility windows, failure paths, notification fan-out, and stop conditions." },
    { id: "coordination", role: "delivery", goal: "Route corrective verification and prepare Release/Growth drafts without deploying, publishing, contacting, or spending." },
    { id: "manual-gate-review", role: "reviewer", goal: "Independently verify readiness and clearly separate validated candidate status from human release authorization." },
  ], successCriteria: ["The exact candidate and all upstream versions are traceable", "Missing/stale gates block advancement", "Rollout, rollback, observability, and ownership are explicit", "Growth uses only approved evidence and remains draft-only", "Release remains awaiting explicit human approval"] };
