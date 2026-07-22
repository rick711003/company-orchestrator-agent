import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const expectedRoles = ["Orchestrator", "Product", "Design", "Frontend", "Backend", "iOS", "Android", "QA", "Release", "Growth"];

export interface CapabilityLedgerResult { complete: boolean; findings: string[]; acceptedRoles: string[]; }

export function evaluateCapabilityLedger(directory: string): CapabilityLedgerResult {
  const path = join(directory, "CAPABILITY_LEDGER.md");
  if (!existsSync(path)) return { complete: false, findings: ["CAPABILITY_LEDGER.md is missing"], acceptedRoles: [] };
  const rows = readFileSync(path, "utf8").split("\n").filter((line) => /^\|\s*(?:Orchestrator|Product|Design|Frontend|Backend|iOS|Android|QA|Release|Growth)\s*\|/.test(line));
  const findings: string[] = [];
  const acceptedRoles: string[] = [];
  for (const role of expectedRoles) {
    const row = rows.find((line) => new RegExp(`^\\|\\s*${role}\\s*\\|`, "i").test(line));
    if (!row) { findings.push(`${role}: ledger row missing`); continue; }
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    const [, capabilityIds = "", status = "", evidence = "", verifier = ""] = cells;
    if (!/^[A-Z]+-\d{2}(?:,\s*[A-Z]+-\d{2}){4}$/.test(capabilityIds)) findings.push(`${role}: five capability IDs required`);
    if (!/^(?:accepted|not-applicable)$/i.test(status)) findings.push(`${role}: status must be accepted or not-applicable`);
    if (!evidence || !verifier) findings.push(`${role}: evidence and independent verifier required`);
    if (/^(?:accepted|not-applicable)$/i.test(status) && evidence && verifier) acceptedRoles.push(role);
  }
  return { complete: findings.length === 0, findings, acceptedRoles };
}

