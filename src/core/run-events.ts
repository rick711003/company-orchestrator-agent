import { appendFileSync } from "node:fs";
import { join } from "node:path";

export interface RunEvent {
  type: string;
  runId: string;
  nodeId?: string;
  executionId?: string;
  details?: Record<string, unknown>;
}

export function appendRunEvent(directory: string, event: RunEvent): void {
  appendFileSync(join(directory, "events.jsonl"), JSON.stringify({ schemaVersion: 1, at: new Date().toISOString(), ...event }) + "\n");
}

