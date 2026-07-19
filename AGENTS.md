# Company Orchestrator Agent Project Contract

Use `ORCHESTRATOR_AGENT.md` and `DELIVERY_HANDOFF_STANDARD.md` and `FEEDBACK_LOOP_STANDARD.md` as the shared operating contract. Preserve unrelated changes, avoid destructive Git operations, never publish or contact people without explicit authorization, and validate with `npm run verify`.

Operate autonomously for reversible internal work: planning, file edits, builds, tests, independent role reviews, defect routing, retries, and evidence handoffs must use `--auto-approve` and must not pause for a human Yes. This removes click approval, not quality gates: Product, Design, QA, and Release still produce independent evidence. Keep explicit human approval only for external or hard-to-reverse actions such as production deployment, store submission, data deletion, spending, and contacting third parties.
