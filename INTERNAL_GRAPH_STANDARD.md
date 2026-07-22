# Orchestrator Internal Graph Standard

Model each run as a versioned dependency graph, not a single conversation. Nodes are `intake → contract audit → dependency graph → dispatch → gate verification → rejection routing → status/closure`. Each node records ID, inputs and versions, owner, preconditions, allowed tools/permissions, output artifact, verifier, status, attempt count, and downstream nodes.

Execute every dependency-ready reversible node; fan out independent lanes and fan in only when all declared predecessors pass. A failed node reopens only itself and descendants whose evidence fingerprint changed. Preserve unaffected completed nodes. After each execution, independently verify evidence against exit criteria; on failure record defect, owner, correction, retest node, invalidated descendants, retry budget, and escalation. Three repeated failures escalate systemic risk but never become approval.

Stop only at `blocked-contract`, a scoped human authority boundary, `reopened`, or evidence-backed `completed`. Release readiness cannot terminate the graph; production verification, stabilization, analytics/support review, and PM close/reopen remain downstream nodes.

## Runtime contract

- Persist runs as `run.json` schema version 3. Every stage stores explicit `dependsOn`, concurrency key, attempts, timeout, execution ID, input fingerprint, and output fingerprint. Schema versions 1 and 2 migrate in place when loaded. A per-run owner lock with heartbeat prevents concurrent schedulers, cancellation crosses process boundaries, approvals bind to node input fingerprints, and `events.jsonl` preserves the audit trail.
- Start only dependency-ready stages. Stages with non-conflicting concurrency keys may execute concurrently; a fan-in stage waits until every declared predecessor completes.
- A changed or missing upstream output invalidates only fingerprint-dependent descendants. Unrelated completed nodes remain accepted.
- Retry respects each stage's attempt limit. Approval pauses are resumable, timeouts fail the stage, `--cancel` persists cancellation, and a later resume continues from durable graph state where allowed.
- A role graph cannot declare company completion. The company graph closes only after production verification, stabilization, and Product Manager closure.
