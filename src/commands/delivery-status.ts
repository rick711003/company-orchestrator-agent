import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeCompanyDag } from "./dispatch.ts";
import { evaluateCapabilityLedger } from "../core/capability-ledger.ts";

export interface DeliveryStatus {
  run: string;
  phase: string;
  nextAction: string;
  attempts: Record<string, number>;
  lastActivity?: string;
  manualGate: boolean;
  pendingApprovals: string[];
}

function accepted(directory: string, file: string, pattern: RegExp): boolean {
  const path = join(directory, file);
  return existsSync(path) && pattern.test(readFileSync(path, "utf8"));
}

const approvalActions = ["production-deploy", "store-submission", "external-content", "customer-contact", "campaign-spend", "production-data-change"];

function scopedApproval(directory: string, action: string): boolean {
  const path = join(directory, "MANUAL_APPROVALS.md");
  if (!existsSync(path)) return false;
  const content = `${readFileSync(path, "utf8")}\n## end\n`;
  const section = content.match(new RegExp(`^## ${action}\\s*$([\\s\\S]*?)(?=^## )`, "im"))?.[1] ?? "";
  const expiry = section.match(/^expires-at:\s*(\S+)/im)?.[1];
  return /^approved:\s*true\s*$/im.test(section)
    && /^approver:\s*\S/im.test(section)
    && /^scope:\s*\S/im.test(section)
    && /^artifact-version:\s*\S/im.test(section)
    && /^target:\s*\S/im.test(section)
    && /^approved-at:\s*\S/im.test(section)
    && /^revoked:\s*false\s*$/im.test(section)
    && Boolean(expiry && !Number.isNaN(Date.parse(expiry)) && Date.parse(expiry) > Date.now());
}

export function buildDeliveryStatus(workspace: string, run: string): DeliveryStatus {
  const directory = join(resolve(workspace), ".product-manager-agent", "runs", run);
  if (!existsSync(directory)) throw new Error(`Delivery run not found: ${directory}`);
  writeCompanyDag(directory);
  const automationPath = join(directory, "AUTOMATION_STATE.json");
  const automation = existsSync(automationPath)
    ? JSON.parse(readFileSync(automationPath, "utf8")) as { attempts?: Record<string, number>; updatedAt?: string }
    : {};
  const growth = accepted(directory, "PRODUCT_HANDOFF.growth.md", /campaign-ready:\s*true/i);
  const release = accepted(directory, "PRODUCT_HANDOFF.release.md", /release-validated:\s*true/i);
  const qa = accepted(directory, "PRODUCT_HANDOFF.qa.md", /qa-passed:\s*true/i);
  const designRuntime = accepted(directory, "PRODUCT_HANDOFF.design-runtime.md", /design-accepted:\s*true/i);
  const productRuntime = accepted(directory, "PRODUCT_HANDOFF.pm-runtime.md", /product-accepted:\s*true/i);
  const design = accepted(directory, "PRODUCT_HANDOFF.design.md", /design-approved:\s*true/i);
  const approvals = Object.fromEntries(approvalActions.map((action) => [action, scopedApproval(directory, action)]));
  const pendingApprovals = approvalActions.filter((action) => !approvals[action]);
  const deployment = accepted(directory, "PRODUCTION_DEPLOYMENT.md", /deployed:\s*true/i)
    && accepted(directory, "PRODUCTION_DEPLOYMENT.md", /artifact-evidence:\s*\S/i);
  const production = accepted(directory, "PRODUCT_HANDOFF.production.md", /production-verified:\s*true/i);
  const stabilized = accepted(directory, "PRODUCT_HANDOFF.production.md", /stabilization-complete:\s*true/i);
  const outcomeClosed = accepted(directory, "PRODUCT_HANDOFF.outcome-review.md", /decision:\s*close/i);
  const outcomeReopened = accepted(directory, "PRODUCT_HANDOFF.outcome-review.md", /decision:\s*(?:reopen|rollback)/i);
  const capabilityCoverage = evaluateCapabilityLedger(directory);
  const boardPath = join(directory, "DELIVERY_BOARD.md");
  const board = existsSync(boardPath) ? readFileSync(boardPath, "utf8") : "";
  const applicableTeams = ["backend", "frontend", "ios", "android"].filter((team) => {
    const label = team === "ios" ? "iOS" : `${team[0].toUpperCase()}${team.slice(1)}`;
    return new RegExp(`^- \\[.\\] ${label} — owner: (?!Not applicable)`, "m").test(board);
  });
  const engineering = applicableTeams.length > 0 && applicableTeams.every((team) =>
    accepted(directory, `PRODUCT_HANDOFF.${team}.md`, /ready-for-design-review:\s*true/i));

  let phase = "product-and-design-contract";
  let nextAction = "Complete PM contracts and Design specification";
  let manualGate = false;
  if (design) { phase = "engineering"; nextAction = "Complete applicable Engineering handoffs"; }
  if (engineering) { phase = "product-acceptance"; nextAction = "Product must accept implemented behavior"; }
  if (productRuntime) { phase = "design-acceptance"; nextAction = "Design must accept runtime fidelity"; }
  if (designRuntime) { phase = "qa"; nextAction = "QA must execute the approved test specification"; }
  if (qa) { phase = "release-validation"; nextAction = "Release must validate final artifacts"; }
  if (release && !growth) { phase = "growth-handoff"; nextAction = "Growth must prepare an evidence-backed draft package"; }
  if (release && growth) {
    phase = "awaiting-production-deploy-approval";
    nextAction = "Record a scoped production-deploy approval; other external authorities remain independent";
    manualGate = true;
  }
  if (release && growth && approvals["production-deploy"]) {
    phase = "approved-awaiting-external-deployment";
    nextAction = "Perform only the approved deployment scope and attach external deployment evidence";
    manualGate = false;
  }
  if (deployment) { phase = "production-verification"; nextAction = "Release and affected Engineering must verify production; QA verifies independently"; }
  if (production && !stabilized) { phase = "stabilization"; nextAction = "Observe telemetry, security/data, analytics guardrails, incidents, and support severity"; }
  if (production && stabilized) { phase = "outcome-review"; nextAction = "Product must decide close, continue-observation, rollback, or reopen from current evidence"; }
  if (outcomeReopened) { phase = "reopened"; nextAction = "Orchestrator must invalidate affected gates and route corrective work"; }
  if (outcomeClosed && !capabilityCoverage.complete) { phase = "capability-review"; nextAction = `Resolve professional capability gaps: ${capabilityCoverage.findings.join("; ")}`; }
  if (outcomeClosed && capabilityCoverage.complete) { phase = "completed"; nextAction = "Run closed with production, outcome, and professional capability evidence"; }
  return { run, phase, nextAction, attempts: automation.attempts ?? {}, lastActivity: automation.updatedAt, manualGate, pendingApprovals };
}

export function runDeliveryStatusCommand(args: string[]): number {
  let workspace = process.cwd(); let run = ""; let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const next = () => { const value = args[++index]; if (!value) throw new Error(`${option} requires a value.`); return value; };
    if (option === "--workspace") workspace = next();
    else if (option === "--run") run = next();
    else if (option === "--json") json = true;
    else throw new Error(`Unknown delivery-status option "${option}".`);
  }
  if (!run || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(run)) throw new Error("delivery-status requires a valid --run ID.");
  const status = buildDeliveryStatus(workspace, run);
  if (json) console.log(JSON.stringify(status, null, 2));
  else console.log(`Run: ${status.run}\nPhase: ${status.phase}\nNext: ${status.nextAction}\nAttempts: ${JSON.stringify(status.attempts)}\nManual gate: ${status.manualGate ? "yes" : "no"}\nPending independent approvals: ${status.pendingApprovals.join(", ") || "none"}`);
  return 0;
}
