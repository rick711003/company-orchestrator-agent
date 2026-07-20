import { spawnSync, type SpawnSyncReturns } from "node:child_process";

const externalCredential = /^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_|GITHUB_|STRIPE_|SLACK_|SMTP_|SENDGRID_|TWILIO_|VERCEL_|NETLIFY_|CLOUDFLARE_|SSH_AUTH_SOCK$)/i;

export function isolatedAgentEnvironment(role: string, source = process.env): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(Object.entries(source).filter(([name]) => !externalCredential.test(name)));
  return {
    ...environment,
    COMPANY_AGENT_ROLE: role,
    COMPANY_EXTERNAL_ACTIONS: "deny",
    COMPANY_PRODUCTION_ACTIONS: "deny",
    COMPANY_CREDENTIAL_FORWARDING: "restricted",
  };
}

export function runAgent(command: string[], workspace: string, role: string, timeoutMs: number): SpawnSyncReturns<Buffer> {
  return spawnSync("node", command, {
    cwd: workspace,
    env: isolatedAgentEnvironment(role),
    shell: false,
    timeout: timeoutMs,
    killSignal: "SIGTERM",
    stdio: "inherit",
  });
}

export function agentFailure(result: SpawnSyncReturns<Buffer>, role: string): string | undefined {
  if (result.error && "code" in result.error && result.error.code === "ETIMEDOUT") return `${role} timed out`;
  if (result.error) return `${role} failed to start: ${result.error.message}`;
  if (result.signal) return `${role} terminated by ${result.signal}`;
  if (result.status !== 0) return `${role} exited with status ${result.status ?? "unknown"}`;
  return undefined;
}
