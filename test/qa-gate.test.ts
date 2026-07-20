import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runQaGateCommand } from "../src/commands/qa-gate.ts";

function fixture(inventory: string, handoff: string): { workspace: string; run: string } {
  const workspace = mkdtempSync(join(tmpdir(), "orchestrator-gate-"));
  const run = "audit";
  const directory = join(workspace, ".product-manager-agent", "runs", run);
  mkdirSync(directory, { recursive: true });
  writeFileSync(directory + "/DELIVERY_BOARD.md", "## Development\n\n- [x] iOS — owner: iOS Agent\n\n## QA\n");
  writeFileSync(directory + "/SURFACE_INVENTORY.md", inventory);
  writeFileSync(directory + "/PRODUCT_HANDOFF.ios.md", handoff);
  writeFileSync(directory + "/PRODUCT_HANDOFF.pm-runtime.md", "product-accepted: true\nrequirement-traceability: R-1\nruntime-evidence: runtime.png\n");
  writeFileSync(directory + "/PRODUCT_HANDOFF.design-runtime.md", "design-accepted: true\nsurface-traceability: settings.alert\nruntime-evidence: runtime.png\n");
  return { workspace, run };
}

test("blocks self-declared readiness without row-level evidence", () => {
  const setup = fixture(
    "| Surface/state | Platform | Owner | Design | Tokens/assets | Runtime ID | Screenshot | Test | Design acceptance | QA | Release |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| settings.alert | iOS | iOS | approved | tokens | alert.id | pending | pending | pending | pending | pending |",
    "ready-for-design-review: true\nruntime-evidence: shot.png\ntest-evidence: ui test\nfile-size-evidence: npm test",
  );
  try {
    assert.equal(runQaGateCommand(["--workspace", setup.workspace, "--run", setup.run]), 2);
  } finally {
    rmSync(setup.workspace, { recursive: true, force: true });
  }
});

test("allows QA only after complete runtime and design evidence", () => {
  const setup = fixture(
    "| Surface/state | Platform | Owner | Design | Tokens/assets | Runtime ID | Screenshot | Test | Design acceptance | QA | Release |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| settings.alert | iOS | iOS | design-v1 | type-v1 | alert.id | shot.png | UI-42 | accepted | pending | pending |",
    "ready-for-design-review: true\nruntime-evidence: shot.png\ntest-evidence: UI-42\nfile-size-evidence: npm test",
  );
  try {
    assert.equal(runQaGateCommand(["--workspace", setup.workspace, "--run", setup.run]), 0);
  } finally {
    rmSync(setup.workspace, { recursive: true, force: true });
  }
});

test("blocks QA when independent runtime Design acceptance is rejected", () => {
  const setup = fixture(
    "| Surface/state | Platform | Owner | Design | Tokens/assets | Runtime ID | Screenshot | Test | Design acceptance | QA | Release |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| settings.alert | iOS | iOS | design-v1 | type-v1 | alert.id | shot.png | UI-42 | accepted | pending | pending |",
    "ready-for-design-review: true\nruntime-evidence: shot.png\ntest-evidence: UI-42\nfile-size-evidence: npm test",
  );
  try {
    writeFileSync(
      join(setup.workspace, ".product-manager-agent", "runs", setup.run, "PRODUCT_HANDOFF.design-runtime.md"),
      "design-accepted: false\n",
    );
    assert.equal(runQaGateCommand(["--workspace", setup.workspace, "--run", setup.run]), 2);
  } finally {
    rmSync(setup.workspace, { recursive: true, force: true });
  }
});

test("blocks QA when independent Product acceptance is rejected", () => {
  const setup = fixture(
    "| Surface/state | Platform | Owner | Design | Tokens/assets | Runtime ID | Screenshot | Test | Design acceptance | QA | Release |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| settings.alert | iOS | iOS | design-v1 | type-v1 | alert.id | shot.png | UI-42 | accepted | pending | pending |",
    "ready-for-design-review: true\nruntime-evidence: shot.png\ntest-evidence: UI-42\nfile-size-evidence: npm test",
  );
  try {
    writeFileSync(
      join(setup.workspace, ".product-manager-agent", "runs", setup.run, "PRODUCT_HANDOFF.pm-runtime.md"),
      "product-accepted: false\n",
    );
    assert.equal(runQaGateCommand(["--workspace", setup.workspace, "--run", setup.run]), 2);
  } finally {
    rmSync(setup.workspace, { recursive: true, force: true });
  }
});
