import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface DeliveryStatus {
  run: string;
  phase: string;
  nextAction: string;
  attempts: Record<string, number>;
  lastActivity?: string;
  manualGate: boolean;
}

function accepted(directory: string, file: string, pattern: RegExp): boolean {
  const path = join(directory, file);
  return existsSync(path) && pattern.test(readFileSync(path, "utf8"));
}

export function buildDeliveryStatus(workspace: string, run: string): DeliveryStatus {
  const directory = join(resolve(workspace), ".product-manager-agent", "runs", run);
  if (!existsSync(directory)) throw new Error(`Delivery run not found: ${directory}`);
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
    phase = "awaiting-human-release";
    nextAction = "Human may approve production release and external Growth actions";
    manualGate = true;
  }
  return { run, phase, nextAction, attempts: automation.attempts ?? {}, lastActivity: automation.updatedAt, manualGate };
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
  else console.log(`Run: ${status.run}\nPhase: ${status.phase}\nNext: ${status.nextAction}\nAttempts: ${JSON.stringify(status.attempts)}\nManual gate: ${status.manualGate ? "yes" : "no"}`);
  return 0;
}
