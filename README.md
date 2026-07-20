# Company Orchestrator Agent

The coordination layer for a ten-role software company: Product, Design, Backend,
Frontend, iOS, Android, QA, Release, Growth, and Orchestration.

## Delivery loop

`PM contract → Design contract → Engineering → Product acceptance → runtime Design acceptance → QA → Release validation → Growth draft → human release/external-action gate`

Internal planning, implementation, testing, independent review, notifications, and
rework use `--auto-approve`. Production deployment, store submission, spending,
external contact, destructive production data changes, and Growth publication remain
human-controlled.

## Commands

```bash
npm install
npm run build

node bin/company-orchestrator.js discover --root ..
node bin/company-orchestrator.js dispatch \
  --workspace ../MyProduct \
  --run RUN_ID \
  --agents-root .. \
  --execute
node bin/company-orchestrator.js delivery-status \
  --workspace ../MyProduct \
  --run RUN_ID
node bin/company-orchestrator.js qa-gate \
  --workspace ../MyProduct \
  --run RUN_ID
```

Each run persists `AUTOMATION_STATE.json` and `NOTIFICATION_LOG.md`. Three
consecutive rejections at the same gate produce a systemic-failure event without
converting rejection into approval.

## Verification

```bash
npm run verify
```

The suite includes deterministic company integration tests for happy-path delivery,
Product rejection and recovery, Design/QA rejection, interruption recovery, retry
limits, Growth handoff, notification routing, and the manual production boundary.
