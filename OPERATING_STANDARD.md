# Company Operating Standard

No agent may advance a feature by claiming completion alone. Every handoff must link to repository evidence, commands, outputs, blockers, and the next owner.

## Universal quality gates

- Preserve unrelated work and use readable, idiomatic, formatter-compliant source files; generated or minified source is not an implementation handoff.
- A build or test is passed only with the exact executed command and result. An unavailable environment is a blocker, never a pass.
- No production deployment, store publication, external message, paid campaign, destructive data action, credential change, or permission escalation is automatic.
- Every applicable team writes `PRODUCT_HANDOFF.<team>.md` with changed files, validation evidence, blockers, contract changes, and `ready-for-next-stage`.
- Isolated builds, screenshots, destination assertions, and role-authored claims never satisfy journey quality. Every product run must include versioned continuous-session scenarios and immutable evidence from fresh-state, realistic-persisted-state, and deliberate-deviation executions. The orchestrator rejects handoffs missing journey step/action/result/diagnostic evidence and reopens the owning role instead of asking the human owner to find micro-defects.

## Role contracts

### Product Manager

Provide a versioned Feature Contract: outcome, users, scope, non-goals, acceptance criteria, dependency map, relevant platform task briefs, and release conditions. Mark unrelated platforms not applicable.

### Design

Provide implementation-ready screens, component behavior, content, loading/empty/error/success states, accessibility notes, and a Design Handoff. A mockup alone is not sufficient.

### Engineering

- iOS: a real Xcode project/workspace, scheme, iOS deployment target, readable formatted Swift, XCTest/UI tests, `xcodebuild -list`, simulator build/test evidence.
- Android: Gradle project, app module, readable formatted Kotlin, lint, unit/UI test evidence, emulator build evidence.
- Frontend: framework-native project, readable formatted TypeScript, lint, typecheck, production build, automated test and accessibility evidence.
- Backend: explicit service/API/data contract, migrations, authorization, input validation, formatter/lint, unit/integration tests, rollback plan.

### QA

First reject invalid project structure, unreadable/minified source, missing build commands, missing formatter/lint evidence, or unexecuted tests. Then validate acceptance, integration, regression, accessibility, security, and release blockers. Issue only ship, conditional-ship, or no-ship with evidence.

### Growth

Provide target segment, truthful positioning, experiment hypothesis, event taxonomy, baseline, success and guardrail thresholds, and a results report. Never publish, spend, or contact externally without approval.

### Release

Require QA evidence, version/migration order, environment validation, rollback plan, release notes, and production smoke checklist. Stop at `awaiting-manual-release`.

### Company Orchestrator

Verify required artifacts and gates before dispatching another team. Treat missing evidence as blocked, summarize ownership and dependencies, dispatch only applicable teams, and never bypass the manual release gate.

### Cross-functional governance

Apply `RESPONSIBILITY_LINES.md` to every applicable run. Require versioned security/data and analytics contracts before affected implementation, separate action-specific human approvals before irreversible work, and a routed support/VOC log. After deployment evidence exists, keep the run open through production verification, stabilization, and PM outcome review; only an evidence-backed `close` decision completes it.

Before dispatching, verify the applicable role's delivery-standard artifact is present in its agent repository. Before QA, verify each required `PRODUCT_HANDOFF.<team>.md` reports actual build/test evidence; a missing or false `ready-for-qa` status blocks progression.
