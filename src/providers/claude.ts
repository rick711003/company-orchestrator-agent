import type { AgentProvider, ProviderRunOptions } from "./provider.ts";
import { commandExists, runCommand, runCommandAsync } from "./process.ts";

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

  runAsync(options: ProviderRunOptions, timeoutMs?: number, signal?: AbortSignal): Promise<{ exitCode: number; output: string }> {
    return runCommandAsync("claude", createClaudeArgs(options), options.cwd, options.dryRun, timeoutMs, signal);
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
