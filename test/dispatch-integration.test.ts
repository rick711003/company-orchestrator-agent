import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { runDispatchCommand } from "../src/commands/dispatch.ts";
import { buildDeliveryStatus } from "../src/commands/delivery-status.ts";

type Scenario = {
  product: "accept" | "reject" | "crash-once";
  design: "accept" | "reject";
  qa: "pass" | "fail";
  frontend?: "pass" | "fail-once" | "hang-once";
  engineeringDelay?: boolean;
};

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function fakeAgentSource(role: string): string {
  return `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const cwd = args[args.indexOf("--cwd") + 1];
const workflow = args[args.indexOf("--workflow") + 1];
const task = args.at(-1);
const runs = path.join(cwd, ".product-manager-agent", "runs");
const run = fs.readdirSync(runs)[0];
const dir = path.join(runs, run);
const scenario = JSON.parse(fs.readFileSync(path.join(cwd, "scenario.json"), "utf8"));
if (process.env.COMPANY_EXTERNAL_ACTIONS !== "deny" || process.env.COMPANY_PRODUCTION_ACTIONS !== "deny" || process.env.GH_TOKEN) process.exit(12);
fs.appendFileSync(path.join(cwd, "agent-invocations.log"), ${JSON.stringify(role)} + ":" + workflow + "\\n");
const put = (name, value) => fs.writeFileSync(path.join(dir, name), value);
const boardPath = path.join(dir, "DELIVERY_BOARD.md");
const check = (label) => fs.writeFileSync(boardPath, fs.readFileSync(boardPath, "utf8").replace("- [ ] " + label, "- [x] " + label));
if (${JSON.stringify(role)} === "design" && workflow === "product-feature") {
  put("DESIGN_FLOW.md", "status: design-approved\\n");
  put("DESIGN_SPEC.md", "status: design-approved\\n");
  put("PRODUCT_HANDOFF.design.md", "design-approved: true\\nflow-evidence: flow\\nmockup-evidence: mockup\\njourney-spec-evidence: journeys\\naffordance-audit-evidence: affordances\\ndesign-version: design-v1\\n");
  check("Design —");
} else if (["backend", "frontend", "ios", "android"].includes(${JSON.stringify(role)})) {
  if (scenario.engineeringDelay) {
    fs.appendFileSync(path.join(cwd, "engineering-concurrency.log"), "start:" + ${JSON.stringify(role)} + "\\n");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    fs.appendFileSync(path.join(cwd, "engineering-concurrency.log"), "end:" + ${JSON.stringify(role)} + "\\n");
  }
  if (${JSON.stringify(role)} === "frontend" && scenario.frontend && scenario.frontend !== "pass") {
    const marker = path.join(cwd, "frontend-" + scenario.frontend);
    if (!fs.existsSync(marker)) {
      fs.writeFileSync(marker, "injected once\\n");
      if (scenario.frontend === "hang-once") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
      else process.exit(7);
    }
  }
  const label = ${JSON.stringify(role)} === "ios" ? "iOS" : ${JSON.stringify(role)}[0].toUpperCase() + ${JSON.stringify(role)}.slice(1);
  put("TECHNICAL_PLAN." + ${JSON.stringify(role)} + ".md", "requirement: R-1\\n");
  put("TASK_LEDGER." + ${JSON.stringify(role)} + ".md", "status: completed\\n");
  put("PRODUCT_HANDOFF." + ${JSON.stringify(role)} + ".md", "ready-for-design-review: true\\nruntime-evidence: runtime.png\\ntest-evidence: test.log\\njourney-evidence: journey.log\\nruntime-diagnostics-evidence: diagnostics.log\\nfile-size-evidence: size.log\\n");
  check(label + " —");
} else if (${JSON.stringify(role)} === "product") {
  const crashMarker = path.join(cwd, "product-crashed-once");
  if (scenario.product === "crash-once" && !fs.existsSync(crashMarker)) {
    fs.writeFileSync(crashMarker, "crashed\\n");
    process.exit(7);
  }
  put("PRODUCT_HANDOFF.pm-runtime.md", "product-accepted: " + (scenario.product !== "reject") + "\\nrequirement-traceability: R-1\\nruntime-evidence: runtime.png\\nsession-evidence: session.log\\nmicro-quality-evidence: details.log\\n");
} else if (${JSON.stringify(role)} === "design" && workflow === "runtime-acceptance") {
  put("PRODUCT_HANDOFF.design-runtime.md", "design-accepted: " + (scenario.design === "accept") + "\\nsurface-traceability: settings.alert\\nruntime-evidence: runtime.png\\njourney-evidence: journey.log\\naffordance-evidence: affordance.log\\ntransition-evidence: transition.log\\n");
  if (scenario.design === "accept") put("SURFACE_INVENTORY.md", "| Surface/state | Platform | Owner | Design | Tokens/assets | Runtime ID | Screenshot | Test | Design acceptance | QA | Release |\\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\\n| settings.alert | iOS | iOS | design-v1 | tokens-v1 | runtime.id | runtime.png | UI-1 | accepted | pending | pending |\\n");
} else if (${JSON.stringify(role)} === "qa") {
  put("QA_TEST_SPEC.md", "status: qa-approved\\nrequirement: R-1\\n");
  put("PRODUCT_HANDOFF.qa.md", "qa-passed: " + (scenario.qa === "pass") + "\\ntest-spec-evidence: QA_TEST_SPEC.md\\ntest-evidence: qa.log\\nexploratory-session-evidence: exploratory.log\\nstate-transition-evidence: transitions.log\\naffordance-evidence: affordances.log\\nruntime-diagnostics-evidence: diagnostics.log\\nrelease-ready: " + (scenario.qa === "pass") + "\\n");
} else if (${JSON.stringify(role)} === "release") {
  if (!task.includes("never publish")) process.exit(9);
  put("PRODUCT_HANDOFF.release.md", "release-validated: true\\nstatus: awaiting-manual-release\\nartifact-evidence: archive\\ngate-traceability: R-1\\ncandidate-journey-evidence: candidate-journey.log\\nruntime-diagnostics-evidence: diagnostics.log\\n");
} else if (${JSON.stringify(role)} === "growth") {
  if (!task.includes("never publish") || !task.includes("never publish, contact anyone, spend money")) process.exit(9);
  put("PRODUCT_HANDOFF.growth.md", "campaign-ready: true\\nstatus: awaiting-human-approval\\naudience: ledger users\\nclaims-evidence: R-1\\napproved-asset-references: design-v1\\nchannels: app store draft\\nmeasurement: activation\\nprivacy-consent-constraints: no contact\\n");
}
`;
}

function fixture(scenario: Scenario): { root: string; workspace: string; run: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "company-integration-"));
  const workspace = join(root, "workspace");
  const run = "integration";
  const directory = join(workspace, ".product-manager-agent", "runs", run);
  write(join(workspace, "scenario.json"), JSON.stringify(scenario));
  for (const name of ["PRD.md", "USER_STORIES.md", "FEATURE_CONTRACT.md", "API_CONTRACT.yaml"]) write(join(directory, name), "R-1: settings alert\n");
  write(join(directory, "SECURITY_DATA_CONTRACT.md"), "status: approved\nversion: 1\naccountable-owner: Product\nresponsible-owner: Backend\nverifier: QA\n");
  write(join(directory, "ANALYTICS_CONTRACT.md"), "status: approved\nversion: 1\nmetric-owner: Growth\nimplementation-owner: Engineering\nverifier: QA\n");
  write(join(directory, "SUPPORT_VOC_LOG.md"), "status: active\naccountable-owner: Product\ntriage-owner: QA\nroute-owner: Orchestrator\n");
  write(join(directory, "CAPABILITY_LEDGER.md"), "# Professional Capability Ledger\\n\\n| Role | Capability IDs | Status | Evidence | Verifier | Updated |\\n| --- | --- | --- | --- | --- | --- |\\n| Orchestrator | GOV-01, PORT-01, EVID-01, OPS-01, AI-01 | accepted | orchestrator-evidence | independent-reviewer | 2026-07-22 |\\n| Product | PROD-01, PROD-02, PROD-03, PROD-04, PROD-05 | accepted | product-evidence | independent-reviewer | 2026-07-22 |\\n| Design | DES-01, DES-02, DES-03, DES-04, DES-05 | accepted | design-evidence | independent-reviewer | 2026-07-22 |\\n| Frontend | WEB-01, WEB-02, WEB-03, WEB-04, WEB-05 | accepted | frontend-evidence | independent-reviewer | 2026-07-22 |\\n| Backend | BE-01, BE-02, BE-03, BE-04, BE-05 | accepted | backend-evidence | independent-reviewer | 2026-07-22 |\\n| iOS | IOS-01, IOS-02, IOS-03, IOS-04, IOS-05 | accepted | ios-evidence | independent-reviewer | 2026-07-22 |\\n| Android | AND-01, AND-02, AND-03, AND-04, AND-05 | accepted | android-evidence | independent-reviewer | 2026-07-22 |\\n| QA | QA-01, QA-02, QA-03, QA-04, QA-05 | accepted | qa-evidence | independent-reviewer | 2026-07-22 |\\n| Release | REL-01, REL-02, REL-03, REL-04, REL-05 | accepted | release-evidence | independent-reviewer | 2026-07-22 |\\n| Growth | GRW-01, GRW-02, GRW-03, GRW-04, GRW-05 | accepted | growth-evidence | independent-reviewer | 2026-07-22 |\\n");
  write(join(directory, "MANUAL_APPROVALS.md"), "# Manual Approvals\n\n## production-deploy\napproved: false\n\n## store-submission\napproved: false\n\n## external-content\napproved: false\n\n## customer-contact\napproved: false\n\n## campaign-spend\napproved: false\n\n## production-data-change\napproved: false\n");
  write(join(directory, "tasks/design.md"), "Design R-1\n");
  const capabilityLedger = join(directory, "CAPABILITY_LEDGER.md");
  write(capabilityLedger, readFileSync(capabilityLedger, "utf8").replaceAll("\\n", "\n"));
  for (const team of ["backend", "frontend", "ios", "android"]) write(join(directory, "tasks", `${team}.md`), `Implement R-1 for ${team}\n`);
  write(join(directory, "SURFACE_INVENTORY.md"), "| Surface/state | Platform | Owner | Design | Tokens/assets | Runtime ID | Screenshot | Test | Design acceptance | QA | Release |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| settings.alert | iOS | iOS | design-v1 | tokens-v1 | pending | pending | pending | pending | pending | pending |\n");
  write(join(directory, "DELIVERY_BOARD.md"), "- [x] PRD and user stories approved\n- [ ] Design — owner: Design Agent\n- [ ] Backend — owner: Backend Agent\n- [ ] Frontend — owner: Frontend Agent\n- [ ] iOS — owner: iOS Agent\n- [ ] Android — owner: Android Agent\n\n## QA\n- [ ] QA Test Spec approved\n- [ ] QA passed\n");
  const agents = [
    ["design-agent", "design-agent.js", "design"], ["backend-engineer-agent", "backend-agent.js", "backend"],
    ["frontend-engineer-agent", "frontend-agent.js", "frontend"], ["ios-engineer-agent", "ios-agent.js", "ios"],
    ["android-engineer-agent", "android-agent.js", "android"], ["product-manager-agent", "product-manager-agent.js", "product"],
    ["qa-engineer-agent", "qa-agent.js", "qa"], ["release-engineer-agent", "release-agent.js", "release"],
    ["growth-agent", "growth-agent.js", "growth"],
  ];
  for (const [repo, bin, role] of agents) write(join(root, repo, "bin", bin), fakeAgentSource(role));
  return { root, workspace, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function dispatch(setup: { root: string; workspace: string; run: string }, timeoutMs?: number): Promise<number> {
  const args = ["--workspace", setup.workspace, "--agents-root", setup.root, "--run", setup.run, "--execute"];
  if (timeoutMs) args.push("--agent-timeout-ms", String(timeoutMs));
  return runDispatchCommand(args);
}

test("ten-role delivery reaches release validation without crossing production gate", async () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass" });
  try {
    assert.equal(await dispatch(setup), 0);
    const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
    assert.match(readFileSync(join(run, "PRODUCT_HANDOFF.release.md"), "utf8"), /awaiting-manual-release/);
    assert.match(readFileSync(join(run, "PRODUCT_HANDOFF.growth.md"), "utf8"), /awaiting-human-approval/);
    assert.equal(readFileSync(join(run, "NOTIFICATION_LOG.md"), "utf8").match(/<!-- event:/g)?.length, 6);
    assert.equal(fsExists(join(setup.workspace, "production-deployed")), false);
    const status = buildDeliveryStatus(setup.workspace, setup.run);
    assert.deepEqual(status.phase, "awaiting-production-deploy-approval");
    assert.equal(status.pendingApprovals.length, 6);
  } finally { setup.cleanup(); }
});

test("scoped approval and external evidence advance through post-release closure", async () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass" });
  try {
    assert.equal(await dispatch(setup), 0);
    const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
    write(join(run, "MANUAL_APPROVALS.md"), "# Manual Approvals\n\n## production-deploy\napproved: true\napprover: company-owner\nscope: candidate-v1\nartifact-version: sha256:abc\ntarget: production\napproved-at: 2026-07-22T00:00:00Z\nexpires-at: 2099-01-01T00:00:00Z\nrevoked: false\n\n## store-submission\napproved: false\n\n## external-content\napproved: false\n\n## customer-contact\napproved: false\n\n## campaign-spend\napproved: false\n\n## production-data-change\napproved: false\n");
    assert.equal(buildDeliveryStatus(setup.workspace, setup.run).phase, "approved-awaiting-external-deployment");
    write(join(run, "PRODUCTION_DEPLOYMENT.md"), "deployed: true\nartifact-evidence: sha256:abc\nenvironment: production\n");
    assert.equal(buildDeliveryStatus(setup.workspace, setup.run).phase, "production-verification");
    write(join(run, "PRODUCT_HANDOFF.production.md"), "production-verified: true\nstabilization-complete: false\ntelemetry-evidence: monitor\n");
    assert.equal(buildDeliveryStatus(setup.workspace, setup.run).phase, "stabilization");
    write(join(run, "PRODUCT_HANDOFF.production.md"), "production-verified: true\nstabilization-complete: true\ntelemetry-evidence: monitor\n");
    assert.equal(buildDeliveryStatus(setup.workspace, setup.run).phase, "outcome-review");
    write(join(run, "PRODUCT_HANDOFF.outcome-review.md"), "decision: close\nproduct-outcome-evidence: activation\nsupport-evidence: no-critical-open\n");
    assert.equal(buildDeliveryStatus(setup.workspace, setup.run).phase, "completed");
  } finally { setup.cleanup(); }
});

test("company DAG executes independent Engineering role graphs concurrently", async () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass", engineeringDelay: true });
  try {
    assert.equal(await dispatch(setup), 0);
    const events = readFileSync(join(setup.workspace, "engineering-concurrency.log"), "utf8").trim().split("\n");
    assert.equal(events.slice(0, 4).filter((event) => event.startsWith("start:")).length, 4);
    const dag = JSON.parse(readFileSync(join(setup.workspace, ".product-manager-agent", "runs", setup.run, "COMPANY_DAG.json"), "utf8"));
    assert.equal(dag.schemaVersion, 3);
    assert.ok(dag.nodes.some((node: { id: string; status: string }) => node.id === "product-closure" && node.status === "blocked"));
  } finally { setup.cleanup(); }
});

test("PM closure remains blocked when any professional capability lacks evidence", async () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass" });
  try {
    const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
    write(join(run, "PRODUCT_HANDOFF.outcome-review.md"), "decision: close\nproduct-outcome-evidence: activation\nsupport-evidence: no-critical-open\n");
    write(join(run, "CAPABILITY_LEDGER.md"), "# Professional Capability Ledger\n\n| Role | Capability IDs | Status | Evidence | Verifier | Updated |\n| --- | --- | --- | --- | --- | --- |\n| Product | PROD-01, PROD-02, PROD-03, PROD-04, PROD-05 | pending | | | |\n");
    assert.equal(buildDeliveryStatus(setup.workspace, setup.run).phase, "capability-review");
    const dag = JSON.parse(readFileSync(join(run, "COMPANY_DAG.json"), "utf8"));
    assert.equal(dag.capabilityCoverage.complete, false);
    assert.ok(dag.nodes.some((node: { id: string; status: string }) => node.id === "product-closure" && node.status === "blocked"));
  } finally { setup.cleanup(); }
});

test("Product rejection blocks Design, QA, and Release then resumes from Product acceptance", async () => {
  const setup = fixture({ product: "reject", design: "accept", qa: "pass" });
  try {
    assert.equal(await dispatch(setup), 2);
    const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
    assert.equal(fsExists(join(run, "PRODUCT_HANDOFF.design-runtime.md")), false);
    assert.equal(fsExists(join(run, "PRODUCT_HANDOFF.qa.md")), false);
    write(join(setup.workspace, "scenario.json"), JSON.stringify({ product: "accept", design: "accept", qa: "pass" }));
    assert.equal(await dispatch(setup), 0);
    assert.match(readFileSync(join(run, "PRODUCT_HANDOFF.release.md"), "utf8"), /release-validated: true/);
  } finally { setup.cleanup(); }
});

test("Design and QA rejection never advance Release", async () => {
  for (const scenario of [
    { product: "accept", design: "reject", qa: "pass" } as Scenario,
    { product: "accept", design: "accept", qa: "fail" } as Scenario,
  ]) {
    const setup = fixture(scenario);
    try {
      assert.equal(await dispatch(setup), 2);
      const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
      assert.equal(fsExists(join(run, "PRODUCT_HANDOFF.release.md")), false);
    } finally { setup.cleanup(); }
  }
});

test("three consecutive gate rejections persist a systemic failure without approval", async () => {
  const setup = fixture({ product: "reject", design: "accept", qa: "pass" });
  try {
    assert.equal(await dispatch(setup), 2);
    assert.equal(await dispatch(setup), 2);
    assert.equal(await dispatch(setup), 2);
    const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
    const state = JSON.parse(readFileSync(join(run, "AUTOMATION_STATE.json"), "utf8"));
    assert.equal(state.attempts.product, 3);
    assert.equal(state.outcomes.product, "rejected");
    const notifications = readFileSync(join(run, "NOTIFICATION_LOG.md"), "utf8");
    assert.equal(notifications.match(/event:product-acceptance-rejected/g)?.length, 3);
    assert.equal(notifications.match(/event:systemic-failure/g)?.length, 1);
    assert.equal(fsExists(join(run, "PRODUCT_HANDOFF.design-runtime.md")), false);
    assert.equal(fsExists(join(run, "PRODUCT_HANDOFF.release.md")), false);
  } finally { setup.cleanup(); }
});

test("an interrupted role run resumes without repeating completed Engineering work", async () => {
  const setup = fixture({ product: "crash-once", design: "accept", qa: "pass" });
  try {
    assert.equal(await dispatch(setup), 1);
    const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
    const before = readFileSync(join(run, "TASK_LEDGER.ios.md"), "utf8");
    assert.equal(await dispatch(setup), 0);
    assert.equal(readFileSync(join(run, "TASK_LEDGER.ios.md"), "utf8"), before);
    assert.match(readFileSync(join(run, "PRODUCT_HANDOFF.release.md"), "utf8"), /release-validated: true/);
  } finally { setup.cleanup(); }
});

test("partial Engineering failure reruns only the failed Frontend team", async () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass", frontend: "fail-once" });
  try {
    assert.equal(await dispatch(setup), 1);
    assert.equal(await dispatch(setup), 0);
    const invocations = readFileSync(join(setup.workspace, "agent-invocations.log"), "utf8");
    assert.equal(invocations.match(/backend:api-feature-development/g)?.length, 1);
    assert.equal(invocations.match(/frontend:web-feature-development/g)?.length, 2);
    assert.equal(invocations.match(/ios:feature-development/g)?.length, 1);
    assert.equal(invocations.match(/android:android-feature-development/g)?.length, 1);
  } finally { setup.cleanup(); }
});

test("hung Engineering process times out and resumes only that team", async () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass", frontend: "hang-once" });
  try {
    assert.equal(await dispatch(setup, 250), 1);
    assert.equal(await dispatch(setup, 250), 0);
    const invocations = readFileSync(join(setup.workspace, "agent-invocations.log"), "utf8");
    assert.equal(invocations.match(/frontend:web-feature-development/g)?.length, 2);
    assert.equal(invocations.match(/backend:api-feature-development/g)?.length, 1);
  } finally { setup.cleanup(); }
});

test("duplicate dispatch skips every role when version fingerprints are current", async () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass" });
  try {
    assert.equal(await dispatch(setup), 0);
    const before = readFileSync(join(setup.workspace, "agent-invocations.log"), "utf8");
    assert.equal(await dispatch(setup), 0);
    assert.equal(readFileSync(join(setup.workspace, "agent-invocations.log"), "utf8"), before);
  } finally { setup.cleanup(); }
});

test("changed PRD invalidates stale Product, Design, QA, Release, and Growth approvals", async () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass" });
  try {
    assert.equal(await dispatch(setup), 0);
    const prd = join(setup.workspace, ".product-manager-agent", "runs", setup.run, "PRD.md");
    write(prd, `${readFileSync(prd, "utf8")}R-2: changed behavior\\n`);
    assert.equal(await dispatch(setup), 0);
    const invocations = readFileSync(join(setup.workspace, "agent-invocations.log"), "utf8");
    assert.equal(invocations.match(/product:implementation-acceptance/g)?.length, 2);
    assert.equal(invocations.match(/design:runtime-acceptance/g)?.length, 2);
    assert.equal(invocations.match(/qa:feature-validation/g)?.length, 2);
    assert.equal(invocations.match(/release:release-planning/g)?.length, 2);
    assert.equal(invocations.match(/growth:launch-campaign/g)?.length, 2);
  } finally { setup.cleanup(); }
});

function fsExists(path: string): boolean {
  try { readFileSync(path); return true; } catch { return false; }
}
