import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export interface ArtifactContract {
  required: string[];
  trueFields?: string[];
  forbidden?: string[];
}

export function artifactFields(path: string): Map<string, string> {
  const fields = new Map<string, string>();
  if (!existsSync(path)) return fields;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*(?:[-*]\s*)?([a-z][a-z0-9-]*):\s*(.*?)\s*$/i);
    if (match) fields.set(match[1].toLowerCase(), match[2]);
  }
  return fields;
}

export function artifactFindings(path: string, contract: ArtifactContract): string[] {
  if (!existsSync(path)) return [`missing artifact: ${path}`];
  const fields = artifactFields(path);
  const findings = contract.required.flatMap((field) => {
    const value = fields.get(field.toLowerCase());
    return !value || /^(?:pending|missing|unknown|tbd|none|n\/a|-|—)$/i.test(value)
      ? [`${path}: missing non-empty ${field}`] : [];
  });
  for (const field of contract.trueFields ?? []) {
    if (!/^true$/i.test(fields.get(field.toLowerCase()) ?? "")) findings.push(`${path}: ${field} must be true`);
  }
  for (const field of contract.forbidden ?? []) {
    if (fields.has(field.toLowerCase())) findings.push(`${path}: forbidden self-approval field ${field}`);
  }
  return findings;
}

export function artifactFingerprint(paths: string[]): string {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) {
    hash.update(path); hash.update("\0");
    hash.update(existsSync(path) ? readFileSync(path) : Buffer.from("<missing>")); hash.update("\0");
  }
  return hash.digest("hex");
}

export function surfaceDefinitionFingerprint(path: string): string {
  if (!existsSync(path)) return createHash("sha256").update("<missing>").digest("hex");
  const definitions = readFileSync(path, "utf8").split("\n")
    .filter((line) => /^\|/.test(line.trim()) && !/Surface\/state|^\|\s*:?-+/.test(line.trim()))
    .map((line) => line.split("|").slice(1, 6).map((cell) => cell.trim()).join("|"))
    .join("\n");
  return createHash("sha256").update(definitions).digest("hex");
}
