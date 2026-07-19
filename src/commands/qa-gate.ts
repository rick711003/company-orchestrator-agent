import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function value(args: string[], index: number, option: string): string {
  const result = args[index + 1];
  if (!result || result.startsWith("-")) throw new Error(`${option} requires a value.`);
  return result;
}

const incompleteValue = /^(?:|[-—]|n\/a|na|none|tbd|todo|pending|missing|unknown)$/i;

export function implementationReadyFindings(markdown: string): string[] {
  const rows = markdown.split("\n").filter((line) => /^\|/.test(line.trim()));
  const data = rows.filter(
    (line) => !/Surface\/state/i.test(line) && !/^\|\s*:?-+/.test(line.trim()),
  );
  if (data.length === 0) return ["Surface Inventory has no implementation rows"];
  return data.flatMap((line, index) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const missing = cells.slice(0, 5).flatMap((cell, cellIndex) =>
      incompleteValue.test(cell) ? [cellIndex + 1] : [],
    );
    return missing.length > 0
      ? [`row ${index + 1} (${cells[0] || "unnamed"}) missing PM/Design columns ${missing.join(",")}`]
      : [];
  });
}

function incompleteSurfaceRows(markdown: string): string[] {
  const rows = markdown.split("\n").filter((line) => /^\|/.test(line.trim()));
  const data = rows.filter(
    (line) => !/Surface\/state/i.test(line) && !/^\|\s*:?-+/.test(line.trim()),
  );
  if (data.length === 0) return ["Surface Inventory has no delivery rows"];

  return data.flatMap((line, index) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 11) return [`row ${index + 1} has ${cells.length}/11 columns`];
    const requiredBeforeQa = cells.slice(0, 9);
    const missing = requiredBeforeQa.flatMap((cell, cellIndex) =>
      incompleteValue.test(cell) ? [cellIndex + 1] : [],
    );
    const designAccepted = /^(?:true|yes|accepted|approved|pass(?:ed)?)$/i.test(cells[8] ?? "");
    if (!designAccepted && !missing.includes(9)) missing.push(9);
    return missing.length > 0
      ? [`row ${index + 1} (${cells[0] || "unnamed"}) missing columns ${missing.join(",")}`]
      : [];
  });
}

export function runQaGateCommand(args: string[]): number {
  let workspace = process.cwd();
  let runId: string | undefined;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--workspace") {
      workspace = resolve(value(args, index, "--workspace"));
      index += 1;
    } else if (args[index] === "--run") {
      runId = value(args, index, "--run");
      index += 1;
    } else if (args[index] === "--apply") apply = true;
    else if (args[index] === "--help" || args[index] === "-h") {
      console.log("Usage: company-orchestrator qa-gate --workspace <path> --run <id> [--apply]");
      return 0;
    } else throw new Error(`Unknown qa-gate option "${args[index]}".`);
  }
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) {
    throw new Error("qa-gate requires a valid --run ID.");
  }

  const directory = join(workspace, ".product-manager-agent", "runs", runId);
  const boardPath = join(directory, "DELIVERY_BOARD.md");
  if (!existsSync(boardPath)) throw new Error(`Delivery board not found: ${boardPath}`);
  const board = readFileSync(boardPath, "utf8");
  const development = board.split("## QA")[0] ?? board;
  const blockers = development
    .split("\n")
    .filter((line) => /^- \[ \] (Backend|Frontend|iOS|Android)/.test(line));
  if (blockers.length > 0) {
    console.log("QA blocked by incomplete development work:");
    for (const blocker of blockers) console.log(blocker);
    return 2;
  }

  const requiredTeams = development.split("\n").flatMap((line) => {
    const match = line.match(/^- \[x\] (Backend|Frontend|iOS|Android) — owner: (?!Not applicable)/);
    return match ? [match[1].toLowerCase()] : [];
  });
  const missingEvidence = requiredTeams.filter((team) => {
    const handoff = join(directory, `PRODUCT_HANDOFF.${team}.md`);
    if (!existsSync(handoff)) return true;
    const content = readFileSync(handoff, "utf8");
    return !/ready-for-design-review:\s*true/i.test(content)
      || !/runtime-evidence:\s*\S+/i.test(content)
      || !/test-evidence:\s*\S+/i.test(content)
      || !/file-size-evidence:\s*\S+/i.test(content);
  });
  if (missingEvidence.length > 0) {
    console.log(`QA blocked by incomplete handoffs: ${missingEvidence.join(", ")}`);
    return 2;
  }

  const productRuntimeHandoff = join(directory, "PRODUCT_HANDOFF.pm-runtime.md");
  if (
    !existsSync(productRuntimeHandoff)
    || !/product-accepted:\s*true/i.test(readFileSync(productRuntimeHandoff, "utf8"))
  ) {
    console.log("QA blocked: independent Product implementation acceptance is missing or rejected.");
    return 2;
  }

  const designRuntimeHandoff = join(directory, "PRODUCT_HANDOFF.design-runtime.md");
  if (
    !existsSync(designRuntimeHandoff)
    || !/design-accepted:\s*true/i.test(readFileSync(designRuntimeHandoff, "utf8"))
  ) {
    console.log("QA blocked: independent runtime Design acceptance is missing or rejected.");
    return 2;
  }

  const inventoryPath = join(directory, "SURFACE_INVENTORY.md");
  if (!existsSync(inventoryPath)) {
    console.log("QA blocked: SURFACE_INVENTORY.md is missing.");
    return 2;
  }
  const incomplete = incompleteSurfaceRows(readFileSync(inventoryPath, "utf8"));
  if (incomplete.length > 0) {
    console.log("QA blocked by incomplete Surface Inventory:");
    for (const finding of incomplete) console.log(`- ${finding}`);
    return 2;
  }

  const requestPath = join(directory, "QA_REQUEST.md");
  const request = `# QA Request\n\nStatus: ready-for-qa\n\n## Required evidence\n\n- [x] FEATURE_CONTRACT.md and complete SURFACE_INVENTORY.md\n- [x] API_CONTRACT.yaml\n- [x] applicable role briefs\n- [x] PRODUCT_HANDOFF from each applicable development team\n- [x] independent PRODUCT_HANDOFF.pm-runtime.md with product-accepted: true\n- [x] independent PRODUCT_HANDOFF.design-runtime.md with design-accepted: true\n- [x] DELIVERY_BOARD.md\n- [ ] QA results and RELEASE_CHECKLIST.md\n\nRun QA with: \`qa-agent run start --workflow full-stack-integration\` and attach results before changing this feature to qa-passed.\n`;
  if (!apply) {
    console.log(`QA is ready. Preview only; re-run with --apply to create ${requestPath}`);
    return 0;
  }
  writeFileSync(requestPath, request);
  console.log(`Created QA request: ${requestPath}`);
  return 0;
}
