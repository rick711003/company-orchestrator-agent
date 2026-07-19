# Product Delivery Feedback Loop

The mandatory loop is PM scope → Design contract → Engineering technical plan and implementation → Design runtime acceptance → QA. Release receives work only when PM accepted, Design accepted, and QA passed are all current.

Route rework by defect class: requirement/value/scope → PM; flow/visual/content/state/asset → Design; architecture/code/integration/test → Engineering; runtime fidelity → Design discrepancy list then Engineering then Design; functional QA defect → Engineering then QA; requirement defect found by QA → PM and reopen affected Design and Engineering rows.

Every rejection records reason, evidence, accountable owner, affected surface and requirement IDs, invalidated approvals, next task, and retest owner. The orchestrator automatically reopens and dispatches dependency-affected work until all gates pass. A retry limit reports systemic failure but never converts failure into approval.
