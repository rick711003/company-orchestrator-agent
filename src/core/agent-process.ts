import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";

export interface AgentProcessResult { status: number | null; signal: NodeJS.Signals | null; error?: Error }

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

export function runAgentAsync(command: string[], workspace: string, role: string, timeoutMs: number): Promise<AgentProcessResult> {
  return new Promise((resolve) => {
    const child = spawn("node", command, { cwd: workspace, env: isolatedAgentEnvironment(role), shell: false, stdio: "inherit" });
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 2_000).unref(); }, timeoutMs);
    child.on("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ status: null, signal: null, error }); } });
    child.on("close", (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, signal, error: timedOut ? Object.assign(new Error(`${role} timed out`), { code: "ETIMEDOUT" }) : undefined });
    });
  });
}

export function agentFailure(result: SpawnSyncReturns<Buffer> | AgentProcessResult, role: string): string | undefined {
  if (result.error && "code" in result.error && result.error.code === "ETIMEDOUT") return `${role} timed out`;
  if (result.error) return `${role} failed to start: ${result.error.message}`;
  if (result.signal) return `${role} terminated by ${result.signal}`;
  if (result.status !== 0) return `${role} exited with status ${result.status ?? "unknown"}`;
  return undefined;
}
