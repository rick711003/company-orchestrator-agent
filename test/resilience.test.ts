import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { artifactFindings, surfaceDefinitionFingerprint } from "../src/core/artifact-contract.ts";
import { isolatedAgentEnvironment } from "../src/core/agent-process.ts";
import { acquireDispatchLock } from "../src/core/dispatch-lock.ts";

test("atomic dispatch lock rejects duplicate owners and can be reacquired after release", () => {
  const directory = mkdtempSync(join(tmpdir(), "dispatch-lock-"));
  try {
    const first = acquireDispatchLock(directory);
    assert.throws(() => acquireDispatchLock(directory), /already active/);
    first.release();
    const second = acquireDispatchLock(directory);
    second.release();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("dead stale dispatch lock is recovered atomically", () => {
  const directory = mkdtempSync(join(tmpdir(), "dispatch-stale-lock-"));
  try {
    writeFileSync(join(directory, "DISPATCH_LOCK.json"), JSON.stringify({ pid: 999_999_999, createdAt: "2000-01-01T00:00:00.000Z" }));
    const lock = acquireDispatchLock(directory, 1);
    lock.release();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("artifact schema rejects missing evidence and Engineering self-approval", () => {
  const directory = mkdtempSync(join(tmpdir(), "artifact-contract-"));
  try {
    const path = join(directory, "PRODUCT_HANDOFF.ios.md");
    writeFileSync(path, "ready-for-design-review: true\nruntime-evidence: shot.png\ndesign-accepted: true\n");
    const findings = artifactFindings(path, {
      required: ["ready-for-design-review", "runtime-evidence", "test-evidence", "file-size-evidence"],
      trueFields: ["ready-for-design-review"],
      forbidden: ["design-accepted", "qa-passed"],
    });
    assert.ok(findings.some((finding) => finding.includes("test-evidence")));
    assert.ok(findings.some((finding) => finding.includes("file-size-evidence")));
    assert.ok(findings.some((finding) => finding.includes("forbidden self-approval")));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("surface definition version ignores downstream acceptance cells but detects contract changes", () => {
  const directory = mkdtempSync(join(tmpdir(), "surface-version-"));
  const path = join(directory, "SURFACE_INVENTORY.md");
  const header = "| Surface/state | Platform | Owner | Design | Tokens/assets | Runtime ID | Screenshot | Test | Design acceptance | QA | Release |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n";
  try {
    writeFileSync(path, `${header}| settings | iOS | iOS | v1 | tokens | pending | pending | pending | pending | pending | pending |\n`);
    const initial = surfaceDefinitionFingerprint(path);
    writeFileSync(path, `${header}| settings | iOS | iOS | v1 | tokens | runtime | shot | UI-1 | accepted | passed | ready |\n`);
    assert.equal(surfaceDefinitionFingerprint(path), initial);
    writeFileSync(path, `${header}| settings | iOS | iOS | v2 | tokens | runtime | shot | UI-1 | accepted | passed | ready |\n`);
    assert.notEqual(surfaceDefinitionFingerprint(path), initial);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("role subprocess environment strips external credentials and sets hard deny capabilities", () => {
  const environment = isolatedAgentEnvironment("growth", {
    PATH: "/bin", OPENAI_API_KEY: "model-only", GH_TOKEN: "github", AWS_SECRET_ACCESS_KEY: "aws",
    SSH_AUTH_SOCK: "/tmp/agent.sock",
  });
  assert.equal(environment.OPENAI_API_KEY, "model-only");
  assert.equal(environment.GH_TOKEN, undefined);
  assert.equal(environment.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(environment.SSH_AUTH_SOCK, undefined);
  assert.equal(environment.COMPANY_EXTERNAL_ACTIONS, "deny");
  assert.equal(environment.COMPANY_PRODUCTION_ACTIONS, "deny");
});
