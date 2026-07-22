import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import test from "node:test";
test("runtime prompt enforces orchestration rather than impersonating PM", () => { const source = readFileSync(new URL("../src/core/team.ts", import.meta.url), "utf8"); assert.match(source, /company orchestration team/); assert.match(source, /Surface Inventory/); assert.match(source, /Auto-notify/); assert.doesNotMatch(source, /operating as a product management team/); });
test("runtime prompt blocks isolated evidence and reused verdicts", () => { const source = readFileSync(new URL("../src/core/team.ts", import.meta.url), "utf8"); assert.match(source, /independent continuous-session evidence/); assert.match(source, /Isolated screens, green builds, or reused verdicts block advancement/); });
test("portfolio and release workflows retain orchestration identities", () => { assert.match(readFileSync(new URL("../src/workflows/portfolio-status.ts", import.meta.url), "utf8"), /id: "portfolio-status"/); assert.match(readFileSync(new URL("../src/workflows/release-coordination.ts", import.meta.url), "utf8"), /id: "release-coordination"/); });

test("dispatch includes iOS, Android, Web, and Backend in the same evidence loop", () => {
  const source = readFileSync(new URL("../src/commands/dispatch.ts", import.meta.url), "utf8");

  for (const required of [
    "ios-engineer-agent",
    "android-engineer-agent",
    "frontend-engineer-agent",
    "backend-engineer-agent",
    "growth-agent",
  ]) {
    assert.match(source, new RegExp(required));
  }

  assert.match(source, /Before code, write/);
  assert.match(source, /Execute and verify one dependency-ready task at a time/);
  assert.match(source, /runtime-acceptance/);
  assert.match(source, /implementation-acceptance/);
  assert.match(source, /product-accepted/);
  assert.match(source, /NOTIFICATION_LOG/);
  assert.match(source, /Engineering must never self-approve Design acceptance/);
  assert.match(source, /QA_TEST_SPEC\.md/);
  assert.match(source, /awaiting-manual-release/);
  assert.match(source, /campaign-ready/);
  assert.match(source, /never publish, contact anyone, spend money/);
  assert.match(source, /acquireDispatchLock/);
  assert.match(source, /artifactFingerprint/);
  assert.match(source, /agentTimeoutMs/);
  assert.match(source, /pendingDevelopment/);
  assert.match(source, /journey-spec-evidence/);
  assert.match(source, /journey-evidence/);
  assert.match(source, /exploratory-session-evidence/);
  assert.match(source, /state-transition-evidence/);
  assert.match(source, /candidate-journey-evidence/);
  assert.match(source, /Isolated destination assertions/);
});

test("operating standard keeps the human owner out of exploratory QA", () => {
  const source = readFileSync(new URL("../OPERATING_STANDARD.md", import.meta.url), "utf8");
  assert.match(source, /continuous-session scenarios/);
  assert.match(source, /fresh-state, realistic-persisted-state/);
  assert.match(source, /instead of asking the human owner/);
});

test("orchestration skill, responsibility lines, and internal graph stay role-specific", () => {
  const skill = readFileSync(new URL("../integrations/codex/company-orchestrator-agent/SKILL.md", import.meta.url), "utf8");
  const responsibilities = readFileSync(new URL("../RESPONSIBILITY_LINES.md", import.meta.url), "utf8");
  const graph = readFileSync(new URL("../INTERNAL_GRAPH_STANDARD.md", import.meta.url), "utf8");
  const cli = readFileSync(new URL("../src/commands/run.ts", import.meta.url), "utf8");
  assert.match(skill, /Coordinate evidence-backed delivery/);
  assert.doesNotMatch(skill, /ASO|company orchestration-experiment|product-company orchestration/);
  for (const line of ["Post-release closed loop", "Separate human authorities", "Security, privacy, and data governance", "Analytics contract", "Customer support and voice-of-customer loop"]) assert.match(responsibilities, new RegExp(line, "i"));
  assert.match(graph, /dependency graph/);
  assert.match(graph, /reopens only itself and descendants/);
  assert.doesNotMatch(cli, /growth strategy checkpoint|marketer, analyst/);
});
