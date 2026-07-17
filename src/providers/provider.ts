export type ProviderName = "codex" | "claude";
export type AccessMode = "plan" | "write";

export interface ProviderRunOptions {
  cwd: string;
  task: string;
  dryRun: boolean;
  accessMode: AccessMode;
}

export interface ProviderRunResult {
  exitCode: number;
  output: string;
}

export interface AgentProvider {
  name: ProviderName;
  assertAvailable(): void;
  run(options: ProviderRunOptions): ProviderRunResult;
}
