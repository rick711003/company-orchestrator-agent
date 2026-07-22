# Cross-Functional Responsibility Lines

These controls supplement the feature lifecycle. A role may perform several duties,
but each decision has one accountable owner, one evidence producer, an independent
verifier, and an escalation route. Silence and `not applicable` without rationale are
blocking states.

## 1. Post-release closed loop

| Decision | Accountable | Responsible | Verifier | Escalation |
| --- | --- | --- | --- | --- |
| Candidate and rollout plan | Release | Release + Engineering | QA | Orchestrator |
| Production technical health | Release | affected Engineering lane | QA | company owner |
| Product outcome and close/reopen | PM | PM + Growth | Orchestrator | company owner |

Production work begins only after scoped approval and externally supplied deployment
evidence. Required artifacts are `PRODUCTION_DEPLOYMENT.md`,
`PRODUCT_HANDOFF.production.md`, and `PRODUCT_HANDOFF.outcome-review.md`. Production
verification records artifact/version, environment, rollout cohort, smoke journeys,
telemetry window, incidents, rollback readiness, and `production-verified`. The PM
outcome review records user outcome, guardrails, support themes, analytics evidence,
residual work, and exactly one decision: `close`, `continue-observation`, `rollback`,
or `reopen`. Only `close` ends the run.

## 2. Separate human authorities

`MANUAL_APPROVALS.md` records independent approvals for:

- `production-deploy-approved`
- `store-submission-approved`
- `external-content-approved`
- `customer-contact-approved`
- `campaign-spend-approved`
- `production-data-change-approved`

Each approved action requires approver, scope, artifact/version, environment or
channel, approval timestamp, expiry, and revocation status. Approval for one action
never implies another. Rebuilt artifacts, expired approvals, scope drift, or revoked
approval return the action to blocked.

## 3. Security, privacy, and data governance

PM is accountable for data purpose, classification, retention/deletion/export, and
policy acceptance. Backend is responsible for the technical threat model, controls,
authorization, secrets, dependency/SBOM review, data lifecycle, backup/restore, and
incident recovery across all consumers. Each client engineer owns platform storage
and transport controls. QA independently verifies abuse cases and privacy behavior.
Release verifies that the candidate, configuration, disclosures, and controls match.
The Orchestrator blocks dispatch when `SECURITY_DATA_CONTRACT.md` is required but
missing, stale, unowned, or lacks threat, privacy, lifecycle, recovery, and incident
sections.

## 4. Analytics contract

Growth is accountable for metric meaning, baseline, success threshold, and
guardrails. PM approves that metrics represent the intended user outcome. Engineering
implements the versioned event contract and consent behavior. QA verifies event
payload, ordering, duplication, omission, offline retry, prohibited fields, and
consent states. Release verifies environment configuration. Production activation
requires `ANALYTICS_CONTRACT.md` with owners, versioned events and properties, PII
classification, consent, identity rules, delivery semantics, dashboard mapping,
baseline, thresholds, kill criteria, and production-verification owner.

## 5. Customer support and voice-of-customer loop

PM is accountable for user-impact decisions and product follow-up. Growth is
responsible for aggregating approved, privacy-safe feedback and themes; it does not
contact customers without separate approval. QA owns reproducibility and severity
verification. Engineering owns repair and safe data remediation. Release owns known-
issue and operational communication readiness. The Orchestrator routes every item in
`SUPPORT_VOC_LOG.md` with intake source, consent/classification, severity, user impact,
owner, SLA, reproduction evidence, workaround, linked requirement/incident, next
action, and closure confirmation. P0/P1 issues reopen stabilization immediately.

## Invalidation and completion

The ten professional capability profiles form an additional company gate. The
Orchestrator maintains `CAPABILITY_LEDGER.md`; Product, Design, Frontend, Backend,
iOS, Android, QA, Release, Growth, and Orchestration must each account for five
stable capability IDs. Each applicable row requires direct evidence and an
independent verifier. A missing, pending, stale, self-verified, or unexplained
`not-applicable` row creates the `professional-capability-coverage` blocker in the
company DAG. No role may trade away another profession's minimum standard to meet a
date.

Changes to requirement, candidate hash, schema, event contract, privacy disclosure,
approval scope, rollout cohort, or support severity invalidate affected downstream
evidence. Every rejection names owner, correction, retest owner, invalidated gates,
and due/escalation time. A run is complete only when production is verified, the
stabilization window has ended, security/data and analytics evidence is current,
critical support items are closed or explicitly accepted, and PM records `close`.
