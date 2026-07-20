# Company Integration Test

Date: 2026-07-20

## Scope

The deterministic sandbox exercises all ten roles without network access or changes
to a product repository. Fake role CLIs implement the same artifact protocol used by
the real agents, while the production Orchestrator dispatch and QA gate code runs
unchanged.

## Proved scenarios

- Happy path reaches Release validation and an evidence-backed Growth draft.
- Production release, publication, external contact, and spending remain blocked.
- Product rejection blocks Design runtime acceptance, QA, Release, and Growth.
- A corrected Product handoff resumes from Product acceptance without repeating
  completed Engineering work.
- Design rejection and QA rejection cannot create a Release handoff.
- A crashed Product process returns failure; the next dispatch resumes and completes.
- Three consecutive gate rejections persist attempts and emit one systemic-failure
  event without granting approval.
- Notification routing includes Engineering → Product/Design → QA → Release → Growth
  → company owner.
- Delivery status reports the current phase, next action, attempts, last activity,
  and whether the remaining gate is manual.

## Defects found and corrected

1. Dispatch leaked failure through global `process.exitCode`, so a recovered run could
   still terminate as failed. Exit state is now local to each dispatch.
2. Repeated rejections were deduplicated as if they were the same notification.
   Rejection occurrences and persistent attempt counters are now recorded.
3. The documented retry limit did not exist in runtime state. Three rejections now
   record a systemic failure while preserving the rejected gate.
4. Growth was documented as a company role but was absent from the delivery chain.
   Release validation now triggers a draft-only Growth handoff with hard external
   action boundaries.
5. There was no concise company status surface. `delivery-status` now exposes the
   current phase and next action.
