# Cross-Functional Delivery Handoff Standard

Every product change uses one versioned Surface Inventory covering every route, tab, screen, sheet, modal, editor, detail, system integration, meaningful state, device class or viewport, locale, theme, accessibility variant, and fixture.

Each row requires acceptance criterion, owner, approved design, typography/component tokens, asset manifest entries, implementation evidence, runtime identifier and screenshot, automated test, Design acceptance, QA result, dependency status, and release status. Any missing, stale, assumed, or contradictory cell blocks handoff.

Design owns versioned typography and asset tokens. Typography specifies semantic role, family, weight, Dynamic Type or responsive mapping, size, line height, tracking, and locale behavior. Assets specify source master, runtime name, target/catalog, device family, density, appearance, locale, packaged-artifact proof, and runtime proof. Engineering may not invent values or silently omit variants.

Lifecycle: PM scope → complete Design inventory → engineering → runtime evidence → Design acceptance → QA → Release validation → manual production release. Contract, dependency, risk, scope, rejection, and readiness changes notify the orchestrator, PM, and every affected owner automatically.
