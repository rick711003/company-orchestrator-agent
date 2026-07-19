import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { implementationReadyFindings, runQaGateCommand } from "./qa-gate.ts";

const developmentAgents = [
  { board: "Backend", repo: "backend-engineer-agent", bin: "backend-agent.js", workflow: "api-feature-development", brief: "tasks/backend.md" },
  { board: "Frontend", repo: "frontend-engineer-agent", bin: "frontend-agent.js", workflow: "web-feature-development", brief: "tasks/frontend.md" },
  { board: "iOS", repo: "ios-engineer-agent", bin: "ios-agent.js", workflow: "feature-development", brief: "tasks/ios.md" },
  { board: "Android", repo: "android-engineer-agent", bin: "android-agent.js", workflow: "android-feature-development", brief: "tasks/android.md" },
];

function recordNotification(run: string, event: string, from: string, to: string, evidence: string): void {
  const path = join(run, "NOTIFICATION_LOG.md");
  const marker = `<!-- event:${event} -->`;
  const current = existsSync(path) ? readFileSync(path, "utf8") : "# Notification Log\n\n";
  if (!existsSync(path)) writeFileSync(path, current);
  if (current.includes(marker)) return;
  appendFileSync(path, `${marker}\n- event: ${event}\n- from: ${from}\n- to: ${to}\n- evidence: ${evidence}\n\n`);
}

export function runDispatchCommand(args: string[]): number {
  let workspace = process.cwd(); let root = resolve(process.cwd(), ".."); let runId = ""; let execute = false;
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i]; const next = () => { const value = args[++i]; if (!value) throw new Error(`${option} requires a value.`); return value; };
    if (option === "--workspace") workspace = resolve(next()); else if (option === "--agents-root") root = resolve(next()); else if (option === "--run") runId = next(); else if (option === "--execute") execute = true;
    else if (option === "--help" || option === "-h") { console.log("Usage: company-orchestrator dispatch --workspace <path> --run <id> [--agents-root <path>] [--execute]"); return 0; }
    else throw new Error(`Unknown dispatch option \"${option}\".`);
  }
  if (!runId) throw new Error("dispatch requires --run.");
  const run = join(workspace, ".product-manager-agent", "runs", runId);
  const boardPath = join(run, "DELIVERY_BOARD.md");
  let board = readFileSync(boardPath, "utf8");
  const requiredContracts = ["PRD.md", "USER_STORIES.md", "FEATURE_CONTRACT.md", "SURFACE_INVENTORY.md", "tasks/design.md"];
  const missingContracts = requiredContracts.filter((name) => !existsSync(join(run, name)));
  if (missingContracts.length > 0) {
    console.log(`Cross-functional dispatch blocked by missing PM contracts: ${missingContracts.join(", ")}`);
    return 2;
  }
  const productLine = board.split("\n").find((line) => line.includes("] PRD and user stories approved"));
  if (productLine && !/\[x\]/i.test(productLine)) {
    console.log("Design dispatch blocked until PM approves PRD and user stories on the Delivery Board.");
    return 2;
  }

  const designLine = board.split("\n").find((line) => line.includes("] Design —"));
  if (designLine && !/\[x\]|not applicable/i.test(designLine)) {
    const bin = join(root, "design-agent", "bin", "design-agent.js");
    if (!existsSync(bin)) {
      console.log(`Blocked: Design agent CLI not found at ${bin}`);
      return 2;
    }
    const task = `${readFileSync(join(run, "tasks/design.md"), "utf8")}\n\nAuthoritative PM inputs: ${join(run, "PRD.md")}, ${join(run, "USER_STORIES.md")}, and ${join(run, "SURFACE_INVENTORY.md")}. Translate every requirement/story into ${join(run, "DESIGN_FLOW.md")} and ${join(run, "DESIGN_SPEC.md")}; cover every screen, sheet, modal, menu, alert, dialog, toast, state, device/viewport, locale, theme, and accessibility variant. Set both documents to status: design-approved only after independent Design review. Write ${join(run, "PRODUCT_HANDOFF.design.md")} with requirement/surface traceability, flow-evidence, mockup-evidence, design-version, blockers, and design-approved: true. Then change this exact Delivery Board line to [x]: ${designLine}`;
    const command = [bin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "product-feature", task];
    console.log(`${execute ? "Starting" : "Preview"}: node ${command.map((part) => JSON.stringify(part)).join(" ")}`);
    if (execute) {
      const result = spawnSync("node", command, { stdio: "inherit" });
      if (result.status !== 0) return 1;
    }
    console.log(`${execute ? "Completed" : "Would start"} Design; Engineering remains blocked until Design handoff is accepted.`);
    if (!execute) return 0;

    board = readFileSync(boardPath, "utf8");
    const refreshedDesignLine = board.split("\n").find((line) => line.includes("] Design —"));
    if (refreshedDesignLine && !/\[x\]|not applicable/i.test(refreshedDesignLine)) {
      console.log("Engineering dispatch blocked: Design completed its run but did not approve the Design Delivery Board gate.");
      return 2;
    }
  }

  const designHandoff = join(run, "PRODUCT_HANDOFF.design.md");
  const designFlow = join(run, "DESIGN_FLOW.md");
  const designSpec = join(run, "DESIGN_SPEC.md");
  const designReady = existsSync(designHandoff)
    && /design-approved:\s*true/i.test(readFileSync(designHandoff, "utf8"))
    && existsSync(designFlow) && /status:\s*design-approved/i.test(readFileSync(designFlow, "utf8"))
    && existsSync(designSpec) && /status:\s*design-approved/i.test(readFileSync(designSpec, "utf8"));
  if (!designReady) {
    console.log("Engineering dispatch blocked: Design flow, specification, and approved handoff are incomplete or stale.");
    return 2;
  }
  const inventoryFindings = implementationReadyFindings(readFileSync(join(run, "SURFACE_INVENTORY.md"), "utf8"));
  if (inventoryFindings.length > 0) {
    console.log("Engineering dispatch blocked by incomplete PM/Design handoff:");
    for (const finding of inventoryFindings) console.log(`- ${finding}`);
    return 2;
  }
  let started = 0;
  for (const agent of developmentAgents) {
    const line = board.split("\n").find((value) => value.includes(`] ${agent.board} —`)) ?? "";
    if (!line || /\[x\]|not applicable/i.test(line)) continue;
    const bin = join(root, agent.repo, "bin", agent.bin); const briefPath = join(run, agent.brief);
    if (!existsSync(bin)) { console.log(`Blocked: ${agent.board} agent CLI not found at ${bin}`); continue; }
    const brief = existsSync(briefPath) ? readFileSync(briefPath, "utf8") : `Implement the ${agent.board} scope in ${join(run, "FEATURE_CONTRACT.md")}.`;
    const technicalPlan = join(run, `TECHNICAL_PLAN.${agent.board.toLowerCase()}.md`);
    const taskLedger = join(run, `TASK_LEDGER.${agent.board.toLowerCase()}.md`);
    const task = `${brief}\n\nAuthoritative inputs: ${join(run, "PRD.md")}, ${join(run, "USER_STORIES.md")}, ${join(run, "SURFACE_INVENTORY.md")}, ${designFlow}, ${designSpec}, and ${join(run, "API_CONTRACT.yaml")}. Before code, write ${technicalPlan} and ${taskLedger}. Every task must cite requirement ID, surface/consumer ID, design/API version, dependencies, modules/files, approach, edge cases, tests, exact verification command, rollback, owner, and status. Execute and verify one dependency-ready task at a time. Engineering owns technical architecture but must not invent product behavior or visual values; report blocked-contract when input is incomplete. Enforce the repository file-size gate and attach its exact command and result.\n\nCompletion protocol: write ${join(run, `PRODUCT_HANDOFF.${agent.board.toLowerCase()}.md`)} containing requirement/surface traceability, technical-plan and task-ledger evidence, changed files, runtime-evidence, test-evidence, file-size-evidence, API changes, blockers, and ready-for-design-review: true. Engineering must never self-approve Design acceptance or QA readiness. Then change this exact Delivery Board line to [x]: ${line}`;
    const command = [bin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", agent.workflow, task];
    console.log(`${execute ? "Starting" : "Preview"}: node ${command.map((part) => JSON.stringify(part)).join(" ")}`);
    if (execute) { const result = spawnSync("node", command, { stdio: "inherit" }); if (result.status !== 0) process.exitCode = 1; }
    started += 1;
  }
  console.log(`${execute ? "Started" : "Would start"} ${started} development agent(s).`);
  if (execute && !process.exitCode) {
    const refreshedBoard = readFileSync(boardPath, "utf8");
    const developmentSection = refreshedBoard.split("## QA")[0] ?? refreshedBoard;
    const pendingDevelopment = developmentSection
      .split("\n")
      .filter((line) => /^- \[ \] (Backend|Frontend|iOS|Android)/.test(line));
    const applicableTeams = developmentSection.split("\n").flatMap((line) => {
      const match = line.match(/^- \[x\] (Backend|Frontend|iOS|Android) — owner: (?!Not applicable)/);
      return match ? [match[1].toLowerCase()] : [];
    });
    const incompleteEngineeringEvidence = applicableTeams.filter((team) => {
      const path = join(run, `PRODUCT_HANDOFF.${team}.md`);
      if (!existsSync(path)) return true;
      const content = readFileSync(path, "utf8");
      return !/ready-for-design-review:\s*true/i.test(content)
        || !/runtime-evidence:\s*\S+/i.test(content)
        || !/test-evidence:\s*\S+/i.test(content)
        || !/file-size-evidence:\s*\S+/i.test(content);
    });
    if (pendingDevelopment.length > 0 || incompleteEngineeringEvidence.length > 0) {
      console.log("Runtime Design acceptance blocked until every applicable Engineering handoff is complete.");
      pendingDevelopment.forEach((line) => console.log(line));
      if (incompleteEngineeringEvidence.length > 0) {
        console.log(`Incomplete Engineering evidence: ${incompleteEngineeringEvidence.join(", ")}`);
      }
      return 2;
    }

    recordNotification(run, "engineering-evidence-complete", "Engineering", "Product, Design", "Applicable Engineering handoffs contain runtime, test, and file-size evidence.");
    const productRuntimeHandoff = join(run, "PRODUCT_HANDOFF.pm-runtime.md");
    const productRuntimeAccepted = existsSync(productRuntimeHandoff)
      && /product-accepted:\s*true/i.test(readFileSync(productRuntimeHandoff, "utf8"));
    if (!productRuntimeAccepted) {
      const productBin = join(root, "product-manager-agent", "bin", "product-manager-agent.js");
      if (!existsSync(productBin)) {
        console.log(`Product implementation acceptance blocked: CLI not found at ${productBin}`);
        return 2;
      }
      const productRuntimeTask = `Perform independent Product implementation acceptance for run ${runId}. Compare ${join(run, "PRD.md")}, ${join(run, "USER_STORIES.md")}, ${join(run, "FEATURE_CONTRACT.md")}, ${join(run, "SURFACE_INVENTORY.md")}, ${designFlow}, ${designSpec}, ${join(run, "API_CONTRACT.yaml")}, and every applicable Engineering handoff/runtime artifact. Trace every requirement, story, business rule, scope boundary, content meaning, onboarding obligation, failure and recovery behavior, and platform commitment. Engineering completion is evidence, never Product approval. Write ${productRuntimeHandoff}. Set product-accepted: true only when every applicable requirement passes; otherwise set product-accepted: false, list rejected requirement IDs, evidence, severity, owner, correction and retest, invalidate stale Design/QA/Release approvals, and reopen matching Delivery Board rows. Do not edit product code, claim Design acceptance, or release.`;
      const productRuntimeCommand = [productBin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "implementation-acceptance", productRuntimeTask];
      console.log(`Starting independent Product implementation acceptance: node ${productRuntimeCommand.map((part) => JSON.stringify(part)).join(" ")}`);
      const productRuntimeResult = spawnSync("node", productRuntimeCommand, { stdio: "inherit" });
      if (productRuntimeResult.status !== 0) return 1;
      if (!existsSync(productRuntimeHandoff) || !/product-accepted:\s*true/i.test(readFileSync(productRuntimeHandoff, "utf8"))) {
        recordNotification(run, "product-acceptance-rejected", "Product", "Engineering", productRuntimeHandoff);
        console.log("Product review rejected this iteration. Routed rework must complete before Design runtime acceptance and QA.");
        return 2;
      }
    }
    recordNotification(run, "product-acceptance-passed", "Product", "Design", productRuntimeHandoff);

    const designRuntimeHandoff = join(run, "PRODUCT_HANDOFF.design-runtime.md");
    const designRuntimeAccepted = existsSync(designRuntimeHandoff)
      && /design-accepted:\s*true/i.test(readFileSync(designRuntimeHandoff, "utf8"));
    if (!designRuntimeAccepted) {
      const designBin = join(root, "design-agent", "bin", "design-agent.js");
      if (!existsSync(designBin)) {
        console.log(`Runtime Design acceptance blocked: CLI not found at ${designBin}`);
        return 2;
      }
      const designRuntimeTask = `Perform independent runtime Design acceptance for run ${runId}. Compare ${designFlow}, ${designSpec}, ${join(run, "SURFACE_INVENTORY.md")}, and every applicable Engineering handoff/runtime artifact. Inspect every declared surface, state, device/viewport, locale, theme, accessibility variant, typography token, asset, content value, interaction, and transition. Engineering claims are evidence inputs, never Design approval. After independent review, write ${designRuntimeHandoff}. Set design-accepted: true only when every applicable row passes; otherwise set design-accepted: false, list rejected requirement/surface IDs, evidence, severity, owning Engineering team, required correction and retest, invalidate stale QA/Release status, and reopen the matching Delivery Board rows. Update Design acceptance cells in SURFACE_INVENTORY.md row by row. Do not edit product code and do not release.`;
      const designRuntimeCommand = [designBin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "runtime-acceptance", designRuntimeTask];
      console.log(`Starting independent runtime Design acceptance: node ${designRuntimeCommand.map((part) => JSON.stringify(part)).join(" ")}`);
      const designRuntimeResult = spawnSync("node", designRuntimeCommand, { stdio: "inherit" });
      if (designRuntimeResult.status !== 0) return 1;
      if (!existsSync(designRuntimeHandoff) || !/design-accepted:\s*true/i.test(readFileSync(designRuntimeHandoff, "utf8"))) {
        recordNotification(run, "design-acceptance-rejected", "Design", "Engineering, Product", designRuntimeHandoff);
        console.log("Runtime Design review rejected this iteration. Routed Engineering rework must complete before QA.");
        return 2;
      }
    }

    recordNotification(run, "design-acceptance-passed", "Design", "QA", designRuntimeHandoff);

    const gate = runQaGateCommand(["--workspace", workspace, "--run", runId, "--apply"]);
    if (gate === 2) console.log("QA remains blocked until required PRODUCT_HANDOFFs update the Delivery Board.");
    else if (gate !== 0) process.exitCode = gate;
    else {
      const qaBin = join(root, "qa-engineer-agent", "bin", "qa-agent.js");
      if (!existsSync(qaBin)) {
        console.log(`QA dispatch blocked: CLI not found at ${qaBin}`);
        process.exitCode = 2;
      } else {
        const qaTask = `Execute the QA feedback-loop gate for run ${runId}. Authoritative inputs: ${join(run, "PRD.md")}, ${join(run, "USER_STORIES.md")}, ${join(run, "SURFACE_INVENTORY.md")}, ${designFlow}, ${designSpec}, ${join(run, "API_CONTRACT.yaml")}, and every applicable PRODUCT_HANDOFF.ios/android/frontend/backend.md. Before execution, write ${join(run, "QA_TEST_SPEC.md")} with status: qa-approved and a traceability matrix mapping every requirement, Design flow branch, surface/state, API behavior, device/viewport, locale, theme, failure, recovery, and accessibility variant to test cases. Execute step by step with exact evidence. Classify and route defects: requirement → PM, design → Design, implementation/integration → owning Engineering team; reopen affected Delivery Board rows and invalidate stale approvals. When and only when all current cases pass, write ${join(run, "PRODUCT_HANDOFF.qa.md")} with qa-passed: true, test-spec-evidence, test-evidence, defects, regressions, and release-ready: true; check QA Test Spec approved and QA passed on DELIVERY_BOARD.md. Do not publish or release.`;
        const command = [qaBin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "feature-validation", qaTask];
        console.log(`Starting QA loop: node ${command.map((part) => JSON.stringify(part)).join(" ")}`);
        const result = spawnSync("node", command, { stdio: "inherit" });
        if (result.status !== 0) process.exitCode = 1;
        else {
          const qaHandoff = join(run, "PRODUCT_HANDOFF.qa.md");
          const qaSpec = join(run, "QA_TEST_SPEC.md");
          const qaPassed = existsSync(qaHandoff)
            && /qa-passed:\s*true/i.test(readFileSync(qaHandoff, "utf8"))
            && existsSync(qaSpec)
            && /status:\s*qa-approved/i.test(readFileSync(qaSpec, "utf8"));
          if (!qaPassed) {
            recordNotification(run, "qa-rejected", "QA", "Product, Design, Engineering", qaHandoff);
            console.log("QA rejected this iteration. Reopened owners must complete routed rework before the next automatic dispatch.");
            process.exitCode = 2;
          } else {
            const releaseBin = join(root, "release-engineer-agent", "bin", "release-agent.js");
            if (!existsSync(releaseBin)) {
              console.log(`Release validation blocked: CLI not found at ${releaseBin}`);
              process.exitCode = 2;
            } else {
              const releaseTask = `Validate release readiness for run ${runId} without publishing. Inspect the final built/archive artifacts and all files in ${run}: PRD, stories, Surface Inventory, Design flow/spec and runtime acceptance, every Engineering technical plan/task ledger/handoff, API contract, QA Test Spec/handoff, privacy, localization, assets/device families, signing/configuration, analytics, migrations, observability, rollout, and rollback. Write ${join(run, "PRODUCT_HANDOFF.release.md")} with artifact-evidence, gate traceability, blockers, release-validated: true, and status: awaiting-manual-release only when every gate is current. Update RELEASE_CHECKLIST.md and DELIVERY_BOARD.md, but never publish, submit, contact, spend, deploy to production, or convert the manual gate to approval.`;
              const releaseCommand = [releaseBin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "release-planning", releaseTask];
              console.log(`Starting Release validation: node ${releaseCommand.map((part) => JSON.stringify(part)).join(" ")}`);
              const releaseResult = spawnSync("node", releaseCommand, { stdio: "inherit" });
              if (releaseResult.status !== 0) process.exitCode = 1;
              else {
                recordNotification(run, "release-validated", "Release", "Human release owner", join(run, "PRODUCT_HANDOFF.release.md"));
                console.log("Release validation completed. Production remains awaiting explicit human approval.");
              }
            }
          }
        }
      }
    }
  }
  return typeof process.exitCode === "number" ? process.exitCode : 0;
}
