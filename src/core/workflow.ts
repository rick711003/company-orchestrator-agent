export type AgentRole =
  | "coordinator"
  | "researcher"
  | "strategist"
  | "delivery"
  | "reviewer";

export interface WorkflowStage {
  id: string;
  role: AgentRole;
  goal: string;
  requiresApproval?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  requiredInputs: string[];
  stages: WorkflowStage[];
  successCriteria: string[];
}

export function validateWorkflow(workflow: WorkflowDefinition): void {
  if (!workflow.id || !workflow.name || workflow.stages.length === 0) {
    throw new Error(`Workflow "${workflow.id || "unknown"}" is incomplete.`);
  }

  const stageIds = new Set<string>();
  for (const stage of workflow.stages) {
    if (stageIds.has(stage.id)) {
      throw new Error(`Workflow "${workflow.id}" has duplicate stage "${stage.id}".`);
    }
    stageIds.add(stage.id);
  }
}
