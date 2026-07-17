import type { AgentProvider, ProviderRunOptions } from "./provider.ts";
import { commandExists, runCommand } from "./process.ts";

export class ClaudeProvider implements AgentProvider {
  readonly name = "claude" as const;

  assertAvailable(): void {
    if (!commandExists("claude")) {
      throw new Error(
        "Claude CLI is not installed or is not available in PATH. Install it before using --provider claude.",
      );
    }
  }

  run(options: ProviderRunOptions): { exitCode: number; output: string } {
    return runCommand(
      "claude",
      createClaudeArgs(options),
      options.cwd,
      options.dryRun,
    );
  }
}

export function createClaudeArgs(options: ProviderRunOptions): string[] {
  return [
    "--print",
    "--permission-mode",
    options.accessMode === "write" ? "acceptEdits" : "plan",
    options.task,
  ];
}
