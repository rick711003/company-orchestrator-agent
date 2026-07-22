# Company Orchestrator Agent

The coordination layer for a ten-role software company: Product, Design, Backend,
Frontend, iOS, Android, QA, Release, Growth, and Orchestration.

## Delivery loop

`PM + governance contracts → Design → Engineering → Product/Design acceptance → QA → Release validation → Growth draft → scoped human approval → external deployment evidence → production verification → stabilization → PM close/reopen`

Internal planning, implementation, testing, independent review, notifications, and
rework use `--auto-approve`. Production deployment, store submission, spending,
external contact, destructive production data changes, and Growth publication remain
human-controlled and independently approved. Every role also runs its own versioned
internal dependency graph; failures reopen only affected nodes and descendants.

## Commands

```bash
npm install
npm run build

node bin/company-orchestrator.js discover --root ../../..
node bin/company-orchestrator.js dispatch \
  --workspace ../../../MyProduct \
  --run RUN_ID \
  --agents-root .. \
  --agent-timeout-ms 1800000 \
  --execute
node bin/company-orchestrator.js delivery-status \
  --workspace ../../../MyProduct \
  --run RUN_ID
node bin/company-orchestrator.js qa-gate \
  --workspace ../../../MyProduct \
  --run RUN_ID
```

Each run persists `AUTOMATION_STATE.json` and `NOTIFICATION_LOG.md`. Three
consecutive rejections at the same gate produce a systemic-failure event without
converting rejection into approval.

Dispatch is crash-resumable and guarded by an atomic per-run lock. Completed teams
are checkpointed independently, so a failed or timed-out Frontend run does not rerun
successful Backend, iOS, or Android work. Accepted artifacts carry SHA-256 input
fingerprints; changing an authoritative requirement or design/API contract makes
dependent approvals stale and reopens only the affected stages.

Role processes use a fixed working directory without a shell, receive a bounded
timeout, and do not inherit deployment, source-control, payment, messaging, or cloud
credentials. Hard capability flags deny external and production actions. This is a
defense layer in addition to each provider's workspace sandbox; production release
and external actions still require an explicit human gate.

## Verification

```bash
npm run verify
```

The suite includes deterministic company integration tests for happy-path delivery,
Product rejection and recovery, Design/QA rejection, interruption and timeout
recovery, duplicate dispatch locking, stale approval invalidation, partial Engineering
retry, artifact schema enforcement, credential isolation, retry limits, Growth handoff,
notification routing, and the manual production boundary.
