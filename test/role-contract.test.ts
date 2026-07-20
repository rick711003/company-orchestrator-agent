import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import test from "node:test";
test("runtime prompt enforces orchestration rather than impersonating PM", () => { const source = readFileSync(new URL("../src/core/team.ts", import.meta.url), "utf8"); assert.match(source, /company orchestration team/); assert.match(source, /Surface Inventory/); assert.match(source, /Auto-notify/); assert.doesNotMatch(source, /operating as a product management team/); });

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
});
