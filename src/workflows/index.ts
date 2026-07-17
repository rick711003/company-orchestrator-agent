import { validateWorkflow, type WorkflowDefinition } from "../core/workflow.ts";
import { portfolioStatusWorkflow } from "./portfolio-status.ts";
import { crossAgentDeliveryWorkflow } from "./cross-agent-delivery.ts";
import { releaseCoordinationWorkflow } from "./release-coordination.ts";

const workflows = [portfolioStatusWorkflow, crossAgentDeliveryWorkflow, releaseCoordinationWorkflow];
for (const workflow of workflows) validateWorkflow(workflow);
export function listWorkflows(): WorkflowDefinition[] { return [...workflows]; }
export function getWorkflow(id: string): WorkflowDefinition | undefined { return workflows.find((workflow) => workflow.id === id); }
