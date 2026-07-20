import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { implementationReadyFindings, runQaGateCommand } from "./qa-gate.ts";
import { acquireDispatchLock } from "../core/dispatch-lock.ts";
import { agentFailure, runAgent } from "../core/agent-process.ts";
import { artifactFindings, artifactFingerprint, surfaceDefinitionFingerprint, type ArtifactContract } from "../core/artifact-contract.ts";

const developmentAgents = [
  { board: "Backend", repo: "backend-engineer-agent", bin: "backend-agent.js", workflow: "api-feature-development", brief: "tasks/backend.md" },
  { board: "Frontend", repo: "frontend-engineer-agent", bin: "frontend-agent.js", workflow: "web-feature-development", brief: "tasks/frontend.md" },
  { board: "iOS", repo: "ios-engineer-agent", bin: "ios-agent.js", workflow: "feature-development", brief: "tasks/ios.md" },
  { board: "Android", repo: "android-engineer-agent", bin: "android-agent.js", workflow: "android-feature-development", brief: "tasks/android.md" },
];

type GateName = "product" | "design" | "qa" | "release";
type GateOutcome = "accepted" | "rejected";
interface AutomationState {
  schemaVersion: 1;
  attempts: Record<GateName, number>;
  outcomes: Partial<Record<GateName, GateOutcome>>;
  fingerprints: Partial<Record<GateName, string>>;
  updatedAt: string;
}

const MAX_GATE_ATTEMPTS = 3;

function automationState(run: string): AutomationState {
  const path = join(run, "AUTOMATION_STATE.json");
  if (!existsSync(path)) {
    return { schemaVersion: 1, attempts: { product: 0, design: 0, qa: 0, release: 0 }, outcomes: {}, fingerprints: {}, updatedAt: new Date().toISOString() };
  }
  const state = JSON.parse(readFileSync(path, "utf8")) as AutomationState;
  if (state.schemaVersion !== 1) throw new Error(`Unsupported automation state: ${path}`);
  state.fingerprints ??= {};
  return state;
}

function recordGateOutcome(run: string, gate: GateName, outcome: GateOutcome, fingerprint?: string): { attempt: number; changed: boolean; exhausted: boolean } {
  const state = automationState(run);
  const previous = state.outcomes[gate];
  if (outcome === "rejected") state.attempts[gate] += 1;
  else state.attempts[gate] = 0;
  state.outcomes[gate] = outcome;
  if (outcome === "accepted" && fingerprint) state.fingerprints[gate] = fingerprint;
  state.updatedAt = new Date().toISOString();
  const path = join(run, "AUTOMATION_STATE.json");
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, path);
  return { attempt: state.attempts[gate], changed: previous !== outcome, exhausted: outcome === "rejected" && state.attempts[gate] >= MAX_GATE_ATTEMPTS };
}

function recordNotification(run: string, event: string, from: string, to: string, evidence: string, occurrence = "once"): void {
  const path = join(run, "NOTIFICATION_LOG.md");
  const marker = `<!-- event:${event}:${occurrence} -->`;
  const current = existsSync(path) ? readFileSync(path, "utf8") : "# Notification Log\n\n";
  if (!existsSync(path)) writeFileSync(path, current);
  if (current.includes(marker)) return;
  appendFileSync(path, `${marker}\n- event: ${event}\n- from: ${from}\n- to: ${to}\n- evidence: ${evidence}\n\n`);
}

function recordRejection(run: string, gate: GateName, event: string, from: string, to: string, evidence: string): boolean {
  const outcome = recordGateOutcome(run, gate, "rejected");
  recordNotification(run, event, from, to, evidence, String(outcome.attempt));
  if (outcome.exhausted) {
    recordNotification(run, "systemic-failure", "Orchestrator", "Company owner", `${gate} rejected ${outcome.attempt} consecutive attempts; approval remains blocked.`, gate);
  }
  return outcome.exhausted;
}

function recordAcceptance(run: string, gate: GateName, event: string, from: string, to: string, evidence: string, fingerprint?: string): void {
  const outcome = recordGateOutcome(run, gate, "accepted", fingerprint);
  if (outcome.changed) recordNotification(run, event, from, to, evidence);
}

function acceptedArtifact(path: string, contract: ArtifactContract): boolean {
  const findings = artifactFindings(path, contract);
  if (findings.length === 0) return true;
  for (const finding of findings) console.log(`Artifact contract: ${finding}`);
  return false;
}

function approvalIsCurrent(run: string, gate: GateName, expected: string): boolean {
  const state = automationState(run);
  const current = state.outcomes[gate] === "accepted" && state.fingerprints[gate] === expected;
  if (state.outcomes[gate] === "accepted" && !current) console.log(`${gate} approval is stale because authoritative inputs changed; independent acceptance will rerun.`);
  return current;
}

function runDispatchUnlocked(args: string[]): number {
  let workspace = process.cwd(); let root = resolve(process.cwd(), ".."); let runId = ""; let execute = false; let exitCode = 0; let agentTimeoutMs = 30 * 60 * 1000;
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i]; const next = () => { const value = args[++i]; if (!value) throw new Error(`${option} requires a value.`); return value; };
    if (option === "--workspace") workspace = resolve(next()); else if (option === "--agents-root") root = resolve(next()); else if (option === "--run") runId = next(); else if (option === "--execute") execute = true; else if (option === "--agent-timeout-ms") { agentTimeoutMs = Number(next()); if (!Number.isInteger(agentTimeoutMs) || agentTimeoutMs < 100) throw new Error("--agent-timeout-ms must be an integer of at least 100."); }
    else if (option === "--help" || option === "-h") { console.log("Usage: company-orchestrator dispatch --workspace <path> --run <id> [--agents-root <path>] [--agent-timeout-ms <ms>] [--execute]"); return 0; }
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
    const task = `${readFileSync(join(run, "tasks/design.md"), "utf8")}\n\nAuthoritative PM inputs: ${join(run, "PRD.md")}, ${join(run, "USER_STORIES.md")}, and ${join(run, "SURFACE_INVENTORY.md")}. Translate every requirement/story into ${join(run, "DESIGN_FLOW.md")} and ${join(run, "DESIGN_SPEC.md")}; cover every screen, sheet, modal, menu, alert, dialog, toast, state, device/viewport, locale, theme, and accessibility variant. Define continuous first-use, return-use, edit/cancel, destructive/recovery, runtime locale/theme/type-size, cached-state, and persisted-state journeys. Audit every control-like visual treatment for true or false affordance and representative localized glyph fit. Set both documents to status: design-approved only after independent Design review. Write ${join(run, "PRODUCT_HANDOFF.design.md")} with requirement/surface traceability, flow-evidence, mockup-evidence, journey-spec-evidence, affordance-audit-evidence, design-version, blockers, and design-approved: true. Then change this exact Delivery Board line to [x]: ${designLine}`;
    const command = [bin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "product-feature", task];
    console.log(`${execute ? "Starting" : "Preview"}: node ${command.map((part) => JSON.stringify(part)).join(" ")}`);
    if (execute) {
      const result = runAgent(command, workspace, "design", agentTimeoutMs);
      const failure = agentFailure(result, "Design");
      if (failure) { console.log(failure); return 1; }
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
  const designReady = acceptedArtifact(designHandoff, { required: ["flow-evidence", "mockup-evidence", "journey-spec-evidence", "affordance-audit-evidence", "design-version", "design-approved"], trueFields: ["design-approved"] })
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
    const task = `${brief}\n\nAuthoritative inputs: ${join(run, "PRD.md")}, ${join(run, "USER_STORIES.md")}, ${join(run, "SURFACE_INVENTORY.md")}, ${designFlow}, ${designSpec}, and ${join(run, "API_CONTRACT.yaml")}. Before code, write ${technicalPlan} and ${taskLedger}. Every task must cite requirement ID, surface/consumer ID, design/API version, dependencies, modules/files, approach, edge cases, tests, exact verification command, rollback, owner, and status. Execute and verify one dependency-ready task at a time. Engineering owns technical architecture but must not invent product behavior or visual values; report blocked-contract when input is incomplete. Enforce the repository file-size gate and attach its exact command and result. Install/run the real artifact and execute continuous fresh-state and persisted-state journeys across changed and adjacent surfaces, including deliberate deviations, runtime state changes, affordance probing, layout/glyph fit, and diagnostics.\n\nCompletion protocol: write ${join(run, `PRODUCT_HANDOFF.${agent.board.toLowerCase()}.md`)} containing requirement/surface traceability, technical-plan and task-ledger evidence, changed files, runtime-evidence, test-evidence, journey-evidence, runtime-diagnostics-evidence, file-size-evidence, API changes, blockers, and ready-for-design-review: true. Engineering must never self-approve Design acceptance or QA readiness. Then change this exact Delivery Board line to [x]: ${line}`;
    const command = [bin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", agent.workflow, task];
    console.log(`${execute ? "Starting" : "Preview"}: node ${command.map((part) => JSON.stringify(part)).join(" ")}`);
    if (execute) { const result = runAgent(command, workspace, agent.board.toLowerCase(), agentTimeoutMs); const failure = agentFailure(result, agent.board); if (failure) { console.log(failure); exitCode = 1; } }
    started += 1;
  }
  console.log(`${execute ? "Started" : "Would start"} ${started} development agent(s).`);
  if (execute && exitCode === 0) {
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
      return !acceptedArtifact(path, { required: ["runtime-evidence", "test-evidence", "journey-evidence", "runtime-diagnostics-evidence", "file-size-evidence", "ready-for-design-review"], trueFields: ["ready-for-design-review"], forbidden: ["design-accepted", "ready-for-qa", "qa-passed", "release-validated"] });
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
    const engineeringHandoffs = applicableTeams.map((team) => join(run, `PRODUCT_HANDOFF.${team}.md`));
    const productInputs = [join(run, "PRD.md"), join(run, "USER_STORIES.md"), join(run, "FEATURE_CONTRACT.md"), designFlow, designSpec, join(run, "API_CONTRACT.yaml"), ...engineeringHandoffs];
    const productFingerprint = `${artifactFingerprint(productInputs)}:${surfaceDefinitionFingerprint(join(run, "SURFACE_INVENTORY.md"))}`;
    const productRuntimeAccepted = acceptedArtifact(productRuntimeHandoff, { required: ["requirement-traceability", "runtime-evidence", "session-evidence", "micro-quality-evidence", "product-accepted"], trueFields: ["product-accepted"] })
      && approvalIsCurrent(run, "product", productFingerprint);
    if (!productRuntimeAccepted) {
      const productBin = join(root, "product-manager-agent", "bin", "product-manager-agent.js");
      if (!existsSync(productBin)) {
        console.log(`Product implementation acceptance blocked: CLI not found at ${productBin}`);
        return 2;
      }
      const productRuntimeTask = `Perform independent Product implementation acceptance for run ${runId}. Compare ${join(run, "PRD.md")}, ${join(run, "USER_STORIES.md")}, ${join(run, "FEATURE_CONTRACT.md")}, ${join(run, "SURFACE_INVENTORY.md")}, ${designFlow}, ${designSpec}, ${join(run, "API_CONTRACT.yaml")}, and every applicable Engineering handoff/runtime artifact. Trace every requirement, story, business rule, scope boundary, content meaning, onboarding obligation, failure and recovery behavior, and platform commitment. Execute complete fresh-state and realistic persisted-state user sessions in story order, including runtime setting changes and deliberate deviations; inspect micro-quality, continuity, wording, and user feedback instead of accepting isolated screens. Engineering completion is evidence, never Product approval. Write ${productRuntimeHandoff} with requirement-traceability, runtime-evidence, session-evidence, micro-quality-evidence, and product-accepted. Set product-accepted: true only when every applicable requirement and session passes; otherwise set product-accepted: false, list rejected requirement IDs, evidence, severity, owner, correction and retest, invalidate stale Design/QA/Release approvals, and reopen matching Delivery Board rows. Do not edit product code, claim Design acceptance, or release.`;
      const productRuntimeCommand = [productBin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "implementation-acceptance", productRuntimeTask];
      console.log(`Starting independent Product implementation acceptance: node ${productRuntimeCommand.map((part) => JSON.stringify(part)).join(" ")}`);
      const productRuntimeResult = runAgent(productRuntimeCommand, workspace, "product", agentTimeoutMs);
      const productFailure = agentFailure(productRuntimeResult, "Product");
      if (productFailure) { console.log(productFailure); return 1; }
      if (!acceptedArtifact(productRuntimeHandoff, { required: ["requirement-traceability", "runtime-evidence", "session-evidence", "micro-quality-evidence", "product-accepted"], trueFields: ["product-accepted"] })) {
        const exhausted = recordRejection(run, "product", "product-acceptance-rejected", "Product", "Engineering", productRuntimeHandoff);
        if (exhausted) console.log(`Product acceptance reached the ${MAX_GATE_ATTEMPTS}-attempt retry limit; systemic failure recorded without granting approval.`);
        console.log("Product review rejected this iteration. Routed rework must complete before Design runtime acceptance and QA.");
        return 2;
      }
    }
    recordAcceptance(run, "product", "product-acceptance-passed", "Product", "Design", productRuntimeHandoff, productFingerprint);

    const designRuntimeHandoff = join(run, "PRODUCT_HANDOFF.design-runtime.md");
    const designRuntimeInputs = [join(run, "PRD.md"), join(run, "USER_STORIES.md"), designFlow, designSpec, join(run, "SURFACE_INVENTORY.md"), productRuntimeHandoff, ...engineeringHandoffs];
    const designRuntimeAccepted = acceptedArtifact(designRuntimeHandoff, { required: ["runtime-evidence", "journey-evidence", "affordance-evidence", "transition-evidence", "design-accepted"], trueFields: ["design-accepted"] })
      && approvalIsCurrent(run, "design", artifactFingerprint(designRuntimeInputs));
    if (!designRuntimeAccepted) {
      const designBin = join(root, "design-agent", "bin", "design-agent.js");
      if (!existsSync(designBin)) {
        console.log(`Runtime Design acceptance blocked: CLI not found at ${designBin}`);
        return 2;
      }
      const designRuntimeTask = `Perform independent runtime Design acceptance for run ${runId}. Compare ${designFlow}, ${designSpec}, ${join(run, "SURFACE_INVENTORY.md")}, and every applicable Engineering handoff/runtime artifact. Inspect every declared surface, state, device/viewport, locale, theme, accessibility variant, typography token, asset, content value, interaction, and transition. Run continuous first-use and return-use journeys; probe everything that appears interactive, switch runtime locale/theme/type size, revisit cached surfaces, and inspect glyph/layout fit plus transition feedback. Engineering claims are evidence inputs, never Design approval. After independent review, write ${designRuntimeHandoff} with runtime-evidence, journey-evidence, affordance-evidence, transition-evidence, and design-accepted. Set design-accepted: true only when every applicable row and journey passes; otherwise set design-accepted: false, list rejected requirement/surface IDs, evidence, severity, owning Engineering team, required correction and retest, invalidate stale QA/Release status, and reopen the matching Delivery Board rows. Update Design acceptance cells in SURFACE_INVENTORY.md row by row. Do not edit product code and do not release.`;
      const designRuntimeCommand = [designBin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "runtime-acceptance", designRuntimeTask];
      console.log(`Starting independent runtime Design acceptance: node ${designRuntimeCommand.map((part) => JSON.stringify(part)).join(" ")}`);
      const designRuntimeResult = runAgent(designRuntimeCommand, workspace, "design", agentTimeoutMs);
      const designFailure = agentFailure(designRuntimeResult, "Design");
      if (designFailure) { console.log(designFailure); return 1; }
      if (!acceptedArtifact(designRuntimeHandoff, { required: ["runtime-evidence", "journey-evidence", "affordance-evidence", "transition-evidence", "design-accepted"], trueFields: ["design-accepted"] })) {
        const exhausted = recordRejection(run, "design", "design-acceptance-rejected", "Design", "Engineering, Product", designRuntimeHandoff);
        if (exhausted) console.log(`Design acceptance reached the ${MAX_GATE_ATTEMPTS}-attempt retry limit; systemic failure recorded without granting approval.`);
        console.log("Runtime Design review rejected this iteration. Routed Engineering rework must complete before QA.");
        return 2;
      }
    }

    recordAcceptance(run, "design", "design-acceptance-passed", "Design", "QA", designRuntimeHandoff, artifactFingerprint(designRuntimeInputs));

    const qaHandoffPath = join(run, "PRODUCT_HANDOFF.qa.md");
    const qaSpecPath = join(run, "QA_TEST_SPEC.md");
    const releaseHandoffPath = join(run, "PRODUCT_HANDOFF.release.md");
    const growthHandoffPath = join(run, "PRODUCT_HANDOFF.growth.md");
    const releaseInputs = [...designRuntimeInputs, designRuntimeHandoff, qaSpecPath, qaHandoffPath];
    const releaseFingerprint = artifactFingerprint(releaseInputs);
    const completedAndCurrent = acceptedArtifact(releaseHandoffPath, {
      required: ["artifact-evidence", "gate-traceability", "candidate-journey-evidence", "runtime-diagnostics-evidence", "status", "release-validated"], trueFields: ["release-validated"],
    }) && acceptedArtifact(growthHandoffPath, {
      required: ["audience", "claims-evidence", "approved-asset-references", "channels", "measurement", "privacy-consent-constraints", "status", "campaign-ready"], trueFields: ["campaign-ready"],
    }) && approvalIsCurrent(run, "release", releaseFingerprint);
    if (completedAndCurrent) {
      console.log("Delivery artifacts are current; duplicate dispatch skipped. Production and external actions remain at the human gate.");
      return 0;
    }

    const gate = runQaGateCommand(["--workspace", workspace, "--run", runId, "--apply"]);
    if (gate === 2) console.log("QA remains blocked until required PRODUCT_HANDOFFs update the Delivery Board.");
    else if (gate !== 0) exitCode = gate;
    else {
      const qaBin = join(root, "qa-engineer-agent", "bin", "qa-agent.js");
      if (!existsSync(qaBin)) {
        console.log(`QA dispatch blocked: CLI not found at ${qaBin}`);
        exitCode = 2;
      } else {
        const qaTask = `Execute the QA feedback-loop gate for run ${runId}. Authoritative inputs: ${join(run, "PRD.md")}, ${join(run, "USER_STORIES.md")}, ${join(run, "SURFACE_INVENTORY.md")}, ${designFlow}, ${designSpec}, ${join(run, "API_CONTRACT.yaml")}, and every applicable PRODUCT_HANDOFF.ios/android/frontend/backend.md. Before execution, write ${join(run, "QA_TEST_SPEC.md")} with status: qa-approved and a traceability matrix mapping every requirement, Design flow branch, surface/state, API behavior, device/viewport, locale, theme, failure, recovery, and accessibility variant to test cases. Execute at least one uninterrupted fresh-state and one realistic persisted-state exploratory session. Follow each approved journey, deliberately deviate at every step, probe apparent controls, switch runtime settings, revisit cached surfaces, vary timing/failures, and record timestamped actions, results, screenshots, and diagnostics. Isolated destination assertions or another role's screenshots are insufficient. Classify and route defects: requirement → PM, design → Design, implementation/integration → owning Engineering team; reopen affected Delivery Board rows and invalidate stale approvals. When and only when all current cases pass, write ${join(run, "PRODUCT_HANDOFF.qa.md")} with qa-passed: true, test-spec-evidence, test-evidence, exploratory-session-evidence, state-transition-evidence, affordance-evidence, runtime-diagnostics-evidence, defects, regressions, and release-ready: true; check QA Test Spec approved and QA passed on DELIVERY_BOARD.md. Do not publish or release.`;
        const command = [qaBin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "feature-validation", qaTask];
        console.log(`Starting QA loop: node ${command.map((part) => JSON.stringify(part)).join(" ")}`);
        const result = runAgent(command, workspace, "qa", agentTimeoutMs);
        const qaFailure = agentFailure(result, "QA");
        if (qaFailure) { console.log(qaFailure); exitCode = 1; }
        else {
          const qaHandoff = join(run, "PRODUCT_HANDOFF.qa.md");
          const qaSpec = join(run, "QA_TEST_SPEC.md");
          const qaPassed = acceptedArtifact(qaHandoff, { required: ["test-spec-evidence", "test-evidence", "exploratory-session-evidence", "state-transition-evidence", "affordance-evidence", "runtime-diagnostics-evidence", "qa-passed", "release-ready"], trueFields: ["qa-passed", "release-ready"] })
            && existsSync(qaSpec)
            && /status:\s*qa-approved/i.test(readFileSync(qaSpec, "utf8"));
          if (!qaPassed) {
            const exhausted = recordRejection(run, "qa", "qa-rejected", "QA", "Product, Design, Engineering", qaHandoff);
            if (exhausted) console.log(`QA reached the ${MAX_GATE_ATTEMPTS}-attempt retry limit; systemic failure recorded without granting approval.`);
            console.log("QA rejected this iteration. Reopened owners must complete routed rework before the next automatic dispatch.");
            exitCode = 2;
          } else {
            recordAcceptance(run, "qa", "qa-passed", "QA", "Release", qaHandoff);
            const releaseBin = join(root, "release-engineer-agent", "bin", "release-agent.js");
            if (!existsSync(releaseBin)) {
              console.log(`Release validation blocked: CLI not found at ${releaseBin}`);
              exitCode = 2;
            } else {
              const releaseTask = `Validate release readiness for run ${runId} without publishing. Inspect the final built/archive artifacts and all files in ${run}: PRD, stories, Surface Inventory, Design flow/spec and runtime acceptance, every Engineering technical plan/task ledger/handoff, API contract, QA Test Spec/handoff, privacy, localization, assets/device families, signing/configuration, analytics, migrations, observability, rollout, and rollback. Install the exact candidate and independently replay the continuous fresh/upgrade/return/failure journeys, including runtime settings, cached state, persistence/restart, affordance, glyph/layout, and diagnostics checks. Write ${join(run, "PRODUCT_HANDOFF.release.md")} with artifact-evidence, gate-traceability, candidate-journey-evidence, runtime-diagnostics-evidence, blockers, release-validated: true, and status: awaiting-manual-release only when every gate is current. Update RELEASE_CHECKLIST.md and DELIVERY_BOARD.md, but never publish, submit, contact, spend, deploy to production, or convert the manual gate to approval.`;
              const releaseCommand = [releaseBin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "release-planning", releaseTask];
              console.log(`Starting Release validation: node ${releaseCommand.map((part) => JSON.stringify(part)).join(" ")}`);
              const releaseResult = runAgent(releaseCommand, workspace, "release", agentTimeoutMs);
              const releaseFailure = agentFailure(releaseResult, "Release");
              if (releaseFailure) { console.log(releaseFailure); exitCode = 1; }
              else {
                if (!acceptedArtifact(releaseHandoffPath, { required: ["artifact-evidence", "gate-traceability", "candidate-journey-evidence", "runtime-diagnostics-evidence", "status", "release-validated"], trueFields: ["release-validated"] })) {
                  console.log("Release artifact contract is incomplete; Growth and production remain blocked.");
                  exitCode = 2;
                  return 2;
                }
                recordAcceptance(run, "release", "release-validated", "Release", "Growth, Human release owner", releaseHandoffPath, artifactFingerprint(releaseInputs));
                const growthBin = join(root, "growth-agent", "bin", "growth-agent.js");
                if (!existsSync(growthBin)) {
                  console.log(`Growth handoff blocked: CLI not found at ${growthBin}`);
                  exitCode = 2;
                } else {
                  const growthHandoff = join(run, "PRODUCT_HANDOFF.growth.md");
                  const growthTask = `Prepare an approval-ready Growth handoff for run ${runId} using only current, accepted evidence from ${run}. Read the approved PRD and stories, Design assets, Product runtime acceptance, Design runtime acceptance, QA results, and Release validation. Write ${growthHandoff} with audience, truthful claims traced to evidence, approved asset references, channels, measurement, privacy/consent constraints, blockers, and campaign-ready: true. Produce drafts only: never publish, contact anyone, spend money, create accounts, change production, or imply that awaiting-manual-release is released.`;
                  const growthCommand = [growthBin, "run", "start", "--write", "--auto-approve", "--cwd", workspace, "--workflow", "launch-campaign", growthTask];
                  console.log(`Starting Growth handoff: node ${growthCommand.map((part) => JSON.stringify(part)).join(" ")}`);
                  const growthResult = runAgent(growthCommand, workspace, "growth", agentTimeoutMs);
                  const growthFailure = agentFailure(growthResult, "Growth");
                  if (growthFailure) { console.log(growthFailure); exitCode = 1; }
                  else if (!acceptedArtifact(growthHandoff, { required: ["audience", "claims-evidence", "approved-asset-references", "channels", "measurement", "privacy-consent-constraints", "status", "campaign-ready"], trueFields: ["campaign-ready"] })) {
                    console.log("Growth handoff is incomplete; no external action was authorized.");
                    exitCode = 2;
                  } else {
                    recordNotification(run, "growth-package-ready", "Growth", "Company owner", growthHandoff);
                    console.log("Release validation and Growth draft completed. Production and external actions remain awaiting explicit human approval.");
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return exitCode;
}

export function runDispatchCommand(args: string[]): number {
  let workspace = process.cwd(); let runId = "";
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--workspace") workspace = resolve(args[++index] ?? "");
    else if (args[index] === "--run") runId = args[++index] ?? "";
    else if (["--agents-root", "--agent-timeout-ms"].includes(args[index])) index += 1;
  }
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) throw new Error("dispatch requires a valid --run.");
  const run = join(workspace, ".product-manager-agent", "runs", runId);
  const lock = acquireDispatchLock(run);
  try { return runDispatchUnlocked(args); }
  finally { lock.release(); }
}
