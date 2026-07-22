import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadTeamRun,
  resumeTeamRun,
  runDirectory,
  startTeamRun,
} from "../src/core/team-runner.ts";
import type { AgentProvider, ProviderName, ProviderRunOptions } from "../src/providers/provider.ts";
import { portfolioStatusWorkflow } from "../src/workflows/portfolio-status.ts";

interface Call {
  provider: ProviderName;
  options: ProviderRunOptions;
}

function fakeFactory(calls: Call[]) {
  return (name: ProviderName): AgentProvider => ({
    name,
    assertAvailable() {},
    run(options) {
      calls.push({ provider: name, options });
      return { exitCode: 0, output: `handoff from ${name}: ${options.accessMode}` };
    },
  });
}

test("a write run pauses for approval then resumes independent roles", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "product-manager-agent-run-"));
  const calls: Call[] = [];
  try {
    const paused = await startTeamRun(
      {
        task: "Build login",
        workspace,
        workflow: portfolioStatusWorkflow,
        accessMode: "write",
        defaultProvider: "codex",
        roleProviders: { reviewer: "claude" },
      },
      fakeFactory(calls),
    );

    assert.equal(paused.status, "awaiting_approval");
    assert.equal(paused.currentStageIndex, 1);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.options.accessMode === "plan"));

    const completed = await resumeTeamRun(
      { workspace, runId: paused.id, approve: true },
      fakeFactory(calls),
    );
    assert.equal(completed.status, "completed");
    assert.equal(calls.length, 5);
    assert.equal(calls[2].options.accessMode, "write");
    assert.equal(calls[3].options.accessMode, "plan");
    assert.equal(calls[4].provider, "claude");
    assert.match(calls[2].options.task, /handoff from codex: plan/);

    const persisted = loadTeamRun(workspace, paused.id);
    assert.equal(persisted.status, "completed");
    assert.ok(persisted.stages.every((stage) => stage.status === "completed"));
    assert.match(readFileSync(join(runDirectory(workspace, paused.id), "REPORT.md"), "utf8"), /Status: completed/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("auto-approve completes a write run without broadening non-strategist access", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "product-manager-agent-run-"));
  const calls: Call[] = [];
  try {
    const state = await startTeamRun(
      {
        task: "Build settings",
        workspace,
        workflow: portfolioStatusWorkflow,
        accessMode: "write",
        defaultProvider: "codex",
        autoApprove: true,
      },
      fakeFactory(calls),
    );
    assert.equal(state.status, "completed");
    assert.deepEqual(
      calls.map((call) => call.options.accessMode),
      ["plan", "plan", "write", "plan", "plan"],
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("a failed stage is persisted and can be retried", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "product-manager-agent-run-"));
  let shouldFail = true;
  const factory = (name: ProviderName): AgentProvider => ({
    name,
    assertAvailable() {},
    run() {
      if (shouldFail) {
        shouldFail = false;
        return { exitCode: 7, output: "temporary failure" };
      }
      return { exitCode: 0, output: "recovered" };
    },
  });
  try {
    const failed = await startTeamRun(
      {
        task: "Investigate",
        workspace,
        workflow: portfolioStatusWorkflow,
        accessMode: "plan",
        defaultProvider: "codex",
      },
      factory,
    );
    assert.equal(failed.status, "failed");
    assert.equal(failed.stages[0].exitCode, 7);

    const recovered = await resumeTeamRun({ workspace, runId: failed.id }, factory);
    assert.equal(recovered.status, "completed");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("rejects traversal run IDs before reading state", () => {
  const workspace = mkdtempSync(join(tmpdir(), "product-manager-agent-run-"));
  try {
    assert.throws(() => loadTeamRun(workspace, "../../outside"), /Invalid team run ID/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("rejects state that redirects writes outside the selected workspace", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "product-manager-agent-run-"));
  try {
    const state = await startTeamRun(
      {
        task: "Inspect",
        workspace,
        workflow: portfolioStatusWorkflow,
        accessMode: "plan",
        defaultProvider: "codex",
      },
      fakeFactory([]),
    );
    const path = join(runDirectory(workspace, state.id), "run.json");
    const malicious = { ...state, workspace: join(workspace, "..", "outside") };
    writeFileSync(path, JSON.stringify(malicious));
    assert.throws(() => loadTeamRun(workspace, state.id), /corrupt team run state/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("rejects artifact paths that escape the run directory", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "product-manager-agent-run-"));
  try {
    const state = await startTeamRun(
      {
        task: "Inspect",
        workspace,
        workflow: portfolioStatusWorkflow,
        accessMode: "plan",
        defaultProvider: "codex",
      },
      fakeFactory([]),
    );
    const path = join(runDirectory(workspace, state.id), "run.json");
    state.stages[0].outputFile = "../../secret.md";
    writeFileSync(path, JSON.stringify(state));
    assert.throws(() => loadTeamRun(workspace, state.id), /Unsafe output path/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
