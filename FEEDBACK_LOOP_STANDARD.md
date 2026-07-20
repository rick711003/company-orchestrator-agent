# Product Delivery Feedback Loop

The mandatory loop is PM scope → Design contract → Engineering technical plan and implementation → Product implementation acceptance → Design runtime acceptance → QA → Release validation → draft-only Growth handoff. Release receives work only when Product accepted, Design accepted, and QA passed are all current. Growth may prepare evidence-backed drafts only after Release validation and may not publish, contact, or spend without explicit human approval.

Route rework by defect class: requirement/value/scope → PM; flow/visual/content/state/asset → Design; architecture/code/integration/test → Engineering; runtime fidelity → Design discrepancy list then Engineering then Design; functional QA defect → Engineering then QA; requirement defect found by QA → PM and reopen affected Design and Engineering rows.

Every rejection records reason, evidence, accountable owner, affected surface and requirement IDs, invalidated approvals, next task, and retest owner. The orchestrator automatically reopens and dispatches dependency-affected work until all gates pass. A retry limit reports systemic failure but never converts failure into approval.
