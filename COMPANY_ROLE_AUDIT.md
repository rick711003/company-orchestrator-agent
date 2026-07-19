# Company Role Audit

## Findings corrected

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
