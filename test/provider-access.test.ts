import assert from "node:assert/strict";
import test from "node:test";
import { createCodexArgs } from "../src/providers/codex.ts";
import { createClaudeArgs } from "../src/providers/claude.ts";

const base = {
  cwd: "/tmp/App",
  task: "Do the work",
  dryRun: true,
} as const;

test("Codex plan mode uses a read-only sandbox", () => {
  const args = createCodexArgs({ ...base, accessMode: "plan" });
  assert.deepEqual(args.slice(0, 4), ["exec", "--sandbox", "read-only", "--skip-git-repo-check"]);
  assert.ok(!args.includes("workspace-write"));
});

test("Codex write mode is workspace-scoped and requires Git", () => {
  const args = createCodexArgs({ ...base, accessMode: "write" });
  assert.deepEqual(args.slice(0, 3), ["exec", "--sandbox", "workspace-write"]);
  assert.ok(!args.includes("--skip-git-repo-check"));
  assert.ok(!args.includes("danger-full-access"));
});

test("Claude plan mode is read-only", () => {
  const args = createClaudeArgs({ ...base, accessMode: "plan" });
  assert.deepEqual(args.slice(0, 3), ["--print", "--permission-mode", "plan"]);
});

test("Claude write mode accepts edits without bypassing permissions", () => {
  const args = createClaudeArgs({ ...base, accessMode: "write" });
  assert.deepEqual(args.slice(0, 3), ["--print", "--permission-mode", "acceptEdits"]);
  assert.ok(!args.includes("--dangerously-skip-permissions"));
  assert.ok(!args.includes("bypassPermissions"));
});
