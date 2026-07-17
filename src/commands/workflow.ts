import { getWorkflow, listWorkflows } from "../workflows/index.ts";

export function runWorkflowCommand(args: string[]): number {
  const [action, workflowId] = args;

  if (!action || action === "list") {
    for (const workflow of listWorkflows()) {
      console.log(`${workflow.id.padEnd(20)} ${workflow.description}`);
    }
    return 0;
  }

  if (action !== "show" || !workflowId) {
    throw new Error("Usage: company-orchestrator workflow list | workflow show <id>");
  }

  const workflow = getWorkflow(workflowId);
  if (!workflow) throw new Error(`Unknown workflow "${workflowId}".`);

  console.log(`${workflow.name} (${workflow.id})`);
  console.log(workflow.description);
  console.log("\nRequired inputs:");
  for (const input of workflow.requiredInputs) console.log(`- ${input}`);
  console.log("\nStages:");
  workflow.stages.forEach((stage, index) => {
    const approval = stage.requiresApproval ? " [approval required]" : "";
    console.log(`${index + 1}. ${stage.id} — ${stage.role}${approval}: ${stage.goal}`);
  });
  console.log("\nSuccess criteria:");
  for (const criterion of workflow.successCriteria) console.log(`- ${criterion}`);
  return 0;
}
