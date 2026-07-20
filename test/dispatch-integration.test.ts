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
  put("PRODUCT_HANDOFF.design.md", "design-approved: true\\nflow-evidence: flow\\nmockup-evidence: mockup\\ndesign-version: design-v1\\n");
  check("Design —");
} else if (["backend", "frontend", "ios", "android"].includes(${JSON.stringify(role)})) {
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
  put("PRODUCT_HANDOFF." + ${JSON.stringify(role)} + ".md", "ready-for-design-review: true\\nruntime-evidence: runtime.png\\ntest-evidence: test.log\\nfile-size-evidence: size.log\\n");
  check(label + " —");
} else if (${JSON.stringify(role)} === "product") {
  const crashMarker = path.join(cwd, "product-crashed-once");
  if (scenario.product === "crash-once" && !fs.existsSync(crashMarker)) {
    fs.writeFileSync(crashMarker, "crashed\\n");
    process.exit(7);
  }
  put("PRODUCT_HANDOFF.pm-runtime.md", "product-accepted: " + (scenario.product !== "reject") + "\\nrequirement-traceability: R-1\\nruntime-evidence: runtime.png\\n");
} else if (${JSON.stringify(role)} === "design" && workflow === "runtime-acceptance") {
  put("PRODUCT_HANDOFF.design-runtime.md", "design-accepted: " + (scenario.design === "accept") + "\\nsurface-traceability: settings.alert\\nruntime-evidence: runtime.png\\n");
  if (scenario.design === "accept") put("SURFACE_INVENTORY.md", "| Surface/state | Platform | Owner | Design | Tokens/assets | Runtime ID | Screenshot | Test | Design acceptance | QA | Release |\\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\\n| settings.alert | iOS | iOS | design-v1 | tokens-v1 | runtime.id | runtime.png | UI-1 | accepted | pending | pending |\\n");
} else if (${JSON.stringify(role)} === "qa") {
  put("QA_TEST_SPEC.md", "status: qa-approved\\nrequirement: R-1\\n");
  put("PRODUCT_HANDOFF.qa.md", "qa-passed: " + (scenario.qa === "pass") + "\\ntest-spec-evidence: QA_TEST_SPEC.md\\ntest-evidence: qa.log\\nrelease-ready: " + (scenario.qa === "pass") + "\\n");
} else if (${JSON.stringify(role)} === "release") {
  if (!task.includes("never publish")) process.exit(9);
  put("PRODUCT_HANDOFF.release.md", "release-validated: true\\nstatus: awaiting-manual-release\\nartifact-evidence: archive\\ngate-traceability: R-1\\n");
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
  write(join(directory, "tasks/design.md"), "Design R-1\n");
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

function dispatch(setup: { root: string; workspace: string; run: string }, timeoutMs?: number): number {
  const args = ["--workspace", setup.workspace, "--agents-root", setup.root, "--run", setup.run, "--execute"];
  if (timeoutMs) args.push("--agent-timeout-ms", String(timeoutMs));
  return runDispatchCommand(args);
}

test("ten-role delivery reaches release validation without crossing production gate", () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass" });
  try {
    assert.equal(dispatch(setup), 0);
    const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
    assert.match(readFileSync(join(run, "PRODUCT_HANDOFF.release.md"), "utf8"), /awaiting-manual-release/);
    assert.match(readFileSync(join(run, "PRODUCT_HANDOFF.growth.md"), "utf8"), /awaiting-human-approval/);
    assert.equal(readFileSync(join(run, "NOTIFICATION_LOG.md"), "utf8").match(/<!-- event:/g)?.length, 6);
    assert.equal(fsExists(join(setup.workspace, "production-deployed")), false);
    assert.deepEqual(buildDeliveryStatus(setup.workspace, setup.run).phase, "awaiting-human-release");
  } finally { setup.cleanup(); }
});

test("Product rejection blocks Design, QA, and Release then resumes from Product acceptance", () => {
  const setup = fixture({ product: "reject", design: "accept", qa: "pass" });
  try {
    assert.equal(dispatch(setup), 2);
    const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
    assert.equal(fsExists(join(run, "PRODUCT_HANDOFF.design-runtime.md")), false);
    assert.equal(fsExists(join(run, "PRODUCT_HANDOFF.qa.md")), false);
    write(join(setup.workspace, "scenario.json"), JSON.stringify({ product: "accept", design: "accept", qa: "pass" }));
    assert.equal(dispatch(setup), 0);
    assert.match(readFileSync(join(run, "PRODUCT_HANDOFF.release.md"), "utf8"), /release-validated: true/);
  } finally { setup.cleanup(); }
});

test("Design and QA rejection never advance Release", () => {
  for (const scenario of [
    { product: "accept", design: "reject", qa: "pass" } as Scenario,
    { product: "accept", design: "accept", qa: "fail" } as Scenario,
  ]) {
    const setup = fixture(scenario);
    try {
      assert.equal(dispatch(setup), 2);
      const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
      assert.equal(fsExists(join(run, "PRODUCT_HANDOFF.release.md")), false);
    } finally { setup.cleanup(); }
  }
});

test("three consecutive gate rejections persist a systemic failure without approval", () => {
  const setup = fixture({ product: "reject", design: "accept", qa: "pass" });
  try {
    assert.equal(dispatch(setup), 2);
    assert.equal(dispatch(setup), 2);
    assert.equal(dispatch(setup), 2);
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

test("an interrupted role run resumes without repeating completed Engineering work", () => {
  const setup = fixture({ product: "crash-once", design: "accept", qa: "pass" });
  try {
    assert.equal(dispatch(setup), 1);
    const run = join(setup.workspace, ".product-manager-agent", "runs", setup.run);
    const before = readFileSync(join(run, "TASK_LEDGER.ios.md"), "utf8");
    assert.equal(dispatch(setup), 0);
    assert.equal(readFileSync(join(run, "TASK_LEDGER.ios.md"), "utf8"), before);
    assert.match(readFileSync(join(run, "PRODUCT_HANDOFF.release.md"), "utf8"), /release-validated: true/);
  } finally { setup.cleanup(); }
});

test("partial Engineering failure reruns only the failed Frontend team", () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass", frontend: "fail-once" });
  try {
    assert.equal(dispatch(setup), 1);
    assert.equal(dispatch(setup), 0);
    const invocations = readFileSync(join(setup.workspace, "agent-invocations.log"), "utf8");
    assert.equal(invocations.match(/backend:api-feature-development/g)?.length, 1);
    assert.equal(invocations.match(/frontend:web-feature-development/g)?.length, 2);
    assert.equal(invocations.match(/ios:feature-development/g)?.length, 1);
    assert.equal(invocations.match(/android:android-feature-development/g)?.length, 1);
  } finally { setup.cleanup(); }
});

test("hung Engineering process times out and resumes only that team", () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass", frontend: "hang-once" });
  try {
    assert.equal(dispatch(setup, 100), 1);
    assert.equal(dispatch(setup, 100), 0);
    const invocations = readFileSync(join(setup.workspace, "agent-invocations.log"), "utf8");
    assert.equal(invocations.match(/frontend:web-feature-development/g)?.length, 2);
    assert.equal(invocations.match(/backend:api-feature-development/g)?.length, 1);
  } finally { setup.cleanup(); }
});

test("duplicate dispatch skips every role when version fingerprints are current", () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass" });
  try {
    assert.equal(dispatch(setup), 0);
    const before = readFileSync(join(setup.workspace, "agent-invocations.log"), "utf8");
    assert.equal(dispatch(setup), 0);
    assert.equal(readFileSync(join(setup.workspace, "agent-invocations.log"), "utf8"), before);
  } finally { setup.cleanup(); }
});

test("changed PRD invalidates stale Product, Design, QA, Release, and Growth approvals", () => {
  const setup = fixture({ product: "accept", design: "accept", qa: "pass" });
  try {
    assert.equal(dispatch(setup), 0);
    const prd = join(setup.workspace, ".product-manager-agent", "runs", setup.run, "PRD.md");
    write(prd, `${readFileSync(prd, "utf8")}R-2: changed behavior\\n`);
    assert.equal(dispatch(setup), 0);
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
