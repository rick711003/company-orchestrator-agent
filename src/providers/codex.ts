import type { AgentProvider, ProviderRunOptions } from "./provider.ts";
import { commandExists, runCommand } from "./process.ts";

export class CodexProvider implements AgentProvider {
  readonly name = "codex" as const;

  assertAvailable(): void {
    if (!commandExists("codex")) {
      throw new Error("Codex CLI is not installed or is not available in PATH.");
    }
  }

  run(options: ProviderRunOptions): { exitCode: number; output: string } {
    const args = createCodexArgs(options);
    return runCommand("codex", args, options.cwd, options.dryRun);
  }
}

export function createCodexArgs(options: ProviderRunOptions): string[] {
  const args = [
    "exec",
    "--sandbox",
    options.accessMode === "write" ? "workspace-write" : "read-only",
  ];
  if (options.accessMode === "plan") args.push("--skip-git-repo-check");
  args.push("--cd", options.cwd, options.task);
  return args;
}
