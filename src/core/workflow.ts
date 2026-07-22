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
  dependsOn?: string[];
  concurrencyKey?: string;
  timeoutMs?: number;
  maxAttempts?: number;
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
  for (let index = 0; index < workflow.stages.length; index += 1) {
    const stage = workflow.stages[index];
    const dependencies = stage.dependsOn ?? (index === 0 ? [] : [workflow.stages[index - 1].id]);
    for (const dependency of dependencies) {
      if (!stageIds.has(dependency) || dependency === stage.id) {
        throw new Error(`Workflow "${workflow.id}" stage "${stage.id}" has invalid dependency "${dependency}".`);
      }
    }
    if (stage.timeoutMs !== undefined && (!Number.isInteger(stage.timeoutMs) || stage.timeoutMs < 100)) {
      throw new Error(`Workflow "${workflow.id}" stage "${stage.id}" has invalid timeout.`);
    }
    if (stage.maxAttempts !== undefined && (!Number.isInteger(stage.maxAttempts) || stage.maxAttempts < 1)) {
      throw new Error(`Workflow "${workflow.id}" stage "${stage.id}" has invalid maxAttempts.`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`Workflow "${workflow.id}" contains a dependency cycle at "${id}".`);
    if (visited.has(id)) return;
    visiting.add(id);
    const index = workflow.stages.findIndex((stage) => stage.id === id);
    const stage = workflow.stages[index];
    for (const dependency of stage.dependsOn ?? (index === 0 ? [] : [workflow.stages[index - 1].id])) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const stage of workflow.stages) visit(stage.id);
}
