# Company Role Audit

## Findings corrected

- 2026-07-20 deep audit found that public README, Claude instructions, Codex skill
  metadata, CLI help, and several specialized workflows still retained QA/Growth
  templates even though the primary runtime prompts had previously been corrected.
  These entry points now identify their real role and contract.
- Product `product-discovery` and `roadmap-planning`, Frontend `design-to-web` and
  `web-accessibility-audit`, Backend `database-migration` and `security-audit`,
  Android `android-bug-fix` and `android-release-readiness`, Release
  `production-incident`, and Orchestrator `portfolio-status` and
  `release-coordination` now have truthful IDs, inputs, stages, and success gates.
- Android no longer exposes a copied full-stack QA workflow or a `QA Reviewer`
  inside the Engineering team. Android review now stops at Engineering handoff.
- Role-contract regression tests now inspect public entry points and specialized
  workflow identities, preventing future copy-template drift from passing CI.
- Android, Frontend, Backend, and Release runtime prompts were copied from QA; Frontend also carried a Backend roster. Their runtime identities and specialist rosters are now distinct.
- The orchestrator package pointed at a nonexistent CLI filename, so full verification could not launch it. Package entry points now target the real executable.
- Cross-functional planning omitted Android, Release, and Growth and did not generate a complete Design brief or Surface Inventory. These artifacts and roles are now mandatory or must be explicitly marked not applicable.
- Design typography, assets, device variants, runtime screenshots, and QA results were separate prose expectations without one blocking ledger. `DELIVERY_HANDOFF_STANDARD.md` now defines the shared row-level gate used across all role repositories.

## Accountability boundary

| Role | Owns | Must reject |
| --- | --- | --- |
| Orchestrator | routing, dependency state, notification fan-out, gate enforcement | missing/stale evidence or specialist acceptance |
| PM | outcome, scope, full Surface Inventory, owners, acceptance criteria | unowned surfaces, ambiguous states, undeclared platforms |
| Design | all mockups/states, flow, typography/components, asset manifest, runtime fidelity acceptance | invented tokens, omitted assets/variants, runtime mismatch |
| FE/iOS/Android | readable implementation, platform structure, runtime identity/evidence, tests | incomplete inventory, unapproved substitutions, missing device evidence |
| BE | API/domain behavior, compatibility, security, migrations, rollback | undocumented drift or missing consumer coverage |
| QA | cross-platform functional, integration, regression, accessibility evidence | missing Design acceptance, stale evidence, untested states/contracts |
| Release | final artifact, signing/store/privacy/configuration, rollback, manual production gate | source-only claims or incomplete upstream gates |
| Growth | approved claims/assets, measurement, consent, launch dependencies | unreleased claims, unapproved screenshots, missing privacy dependencies |

## Required lifecycle

PM scope → complete Design inventory → engineering → runtime evidence → Design acceptance → QA → Release validation → human-approved production release.
