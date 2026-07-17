import { ClaudeProvider } from "./claude.ts";
import { CodexProvider } from "./codex.ts";
import type { AgentProvider, ProviderName } from "./provider.ts";

export type { ProviderName } from "./provider.ts";

export function createProvider(name: ProviderName): AgentProvider {
  return name === "claude" ? new ClaudeProvider() : new CodexProvider();
}
