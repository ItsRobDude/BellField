# BellField Docs Index

This file is the documentation ownership map for BellField.

Use it to answer two questions quickly:

- which document owns a topic
- which documents are context only and should not be treated as primary source of truth

## Source of Truth Rules

Prefer focused source-of-truth docs over broad planning docs.

Use this general precedence:

1. `AGENTS.md` for contributor operating rules
2. focused docs in `docs/` for product, workflow, modeling, deployment, and implementation guidance
3. legacy planning docs only for background context
4. code, scripts, and the filesystem for what currently exists in the repo

Important interpretation rules:

- `README.md` is the repo landing page and navigation hub. It is not the full product rulebook.
- If a focused doc and a planning doc overlap, prefer the focused doc.
- If a doc describes future-state architecture, do not assume every listed app, package, or module already exists.

## Canonical Docs

### [engineering-standards.md](./engineering-standards.md)

Audience: engineers and AI contributors.

Purpose: coding standards, implementation posture, naming, structure, logging, testing, and review expectations.

Read when: writing or reviewing code, planning implementation shape, or deciding how to structure a change.

Does not own: product behavior, workflow rules, permission behavior, or deployment constraints.

### [product-rules.md](./product-rules.md)

Audience: product, engineering, and contributors implementing user-facing behavior.

Purpose: plain-English product rules for audience priority, operational growth posture, accounts, locations, contacts, equipment, jobs, estimates, invoices, and related core behavior.

Read when: deciding how BellField should behave for office or field users.

Does not own: UI layout details, low-level workflow sequencing, or schema implementation details.

### [workflows-and-state-machines.md](./workflows-and-state-machines.md)

Audience: product and engineering contributors working on lifecycle behavior.

Purpose: job, appointment, estimate, invoice, purchasing, and close-out workflow rules.

Read when: implementing or reviewing status changes, prompts, follow-up behavior, or office-to-field lifecycle logic.

Does not own: screen layout, full permission taxonomy, or schema structure.

### [permissions-model.md](./permissions-model.md)

Audience: contributors working on access control, visibility, approvals, and overrides.

Purpose: role templates, permission behavior, employee overrides, and dangerous-action expectations.

Read when: adding protected actions, changing role behavior, or defining what users can view or edit.

Does not own: workflow sequencing, screen layout, or deployment architecture.

### [offline-sync.md](./offline-sync.md)

Audience: contributors working on field-mobile behavior, sync flows, and offline tolerance.

Purpose: what the field app stores locally, what can happen offline, sync expectations, and conflict posture.

Read when: touching technician data windows, queued uploads, offline edits, sync reconciliation, or device revocation behavior.

Does not own: general product rules outside sync behavior, or backend module structure.

### [screen-behavior-spec.md](./screen-behavior-spec.md)

Audience: contributors working on office-web or field-mobile UI behavior.

Purpose: screen layout intent, drawer vs full page expectations, dashboard behavior, tab structure, and field UX flow.

Read when: changing screen interactions, layout behavior, or deciding where a workflow should live in the UI.

Does not own: business record rules, workflow state definitions, or schema design.

### [data-modeling-rules.md](./data-modeling-rules.md)

Audience: contributors working on schema, data ownership, history preservation, or snapshots.

Purpose: record-keeping rules that the schema and persistence model must obey.

Read when: changing entities, relationships, history behavior, delete/archive semantics, or snapshot-sensitive data.

Does not own: migration command workflow, screen behavior, or detailed milestone sequencing.

### [deployment-model.md](./deployment-model.md)

Audience: contributors working on hosting assumptions, storage, backups, updates, or self-hosting constraints.

Purpose: self-hosted-first deployment posture and operational constraints.

Read when: making hosting, storage, support, Windows, or infrastructure-related decisions.

Does not own: feature behavior, workflow definitions, or code-style rules.

### [self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md)

Audience: contributors planning pilot deployment, installer shape, support boundaries, Windows setup, backups, restore, updates, or customer install expectations.

Purpose: supported self-hosted install posture, early assisted-setup model, unsupported setup boundaries, installer/runbook target, and readiness gates.

Read when: deciding whether a deployment assumption is supportable, planning a pilot install, or turning dev setup into a customer-safe install path.

Does not own: general hosting philosophy; use `deployment-model.md` for that. Does not mean the production installer already exists.

### [install-runbook.md](./install-runbook.md)

Audience: contributors and assisted-install operators validating the current Windows server install path.

Purpose: Phase 1 release-folder runbook covering build assembly, unified server config, PostgreSQL provisioning, Windows service manifests, first-owner setup, health checks, and current validation boundaries.

Read when: assembling or testing a BellField server release artifact, or checking what the current installer path can and cannot claim.

Does not own: the broader install posture (`self-hosted-installation-strategy.md`) or deployment philosophy (`deployment-model.md`). It is not yet proof that the stranger install gate has passed.

### [restore-runbook.md](./restore-runbook.md)

Audience: contributors and assisted-install operators validating backup and restore.

Purpose: Phase 2 backup-set shape, supported backup destination boundary, restore helper usage, post-restore checks, and remaining scratch-machine gate.

Read when: changing backup/restore code, testing recovery, or deciding whether a backup destination has been proven.

Does not own: the broader install posture (`self-hosted-installation-strategy.md`) or update rollback flow.

### [phase-2-local-backup-restore-smoke-2026-06-11.md](./phase-2-local-backup-restore-smoke-2026-06-11.md)

Audience: contributors checking what Phase 2 backup/restore validation has actually been run.

Purpose: dated evidence for the nondestructive same-machine Phase 2 validation: worker tests, release packaging, migration smoke, restore-helper refusal behavior, and compiled-worker boot, plus the host PostgreSQL-tool limitation.

Read when: deciding whether Phase 2 repo-side backup/restore foundations are ready to build on, or distinguishing local proof from the unclaimed scratch-machine restore gate.

Does not own: the restore recipe (`restore-runbook.md`) or broader install posture (`self-hosted-installation-strategy.md`).

### [phase-3-local-license-smoke-2026-06-11.md](./phase-3-local-license-smoke-2026-06-11.md)

Audience: contributors checking what Phase 3 license validation has actually been run.

Purpose: dated evidence for the nondestructive same-machine Phase 3 validation: license verifier tests, System/support/UI status, worker license backup inclusion, issuance tooling smoke, restore-helper missing-license refusal, and release artifact spot checks.

Read when: deciding whether Phase 3 repo-side licensing foundations are ready to build on, or distinguishing local proof from clean-machine sold-install and updater/relay gates.

Does not own: the license format (`license-design.md`), install recipe (`install-runbook.md`), restore recipe (`restore-runbook.md`), or Phase 4/5 gates.

### [phase-4-local-updater-smoke-2026-06-11.md](./phase-4-local-updater-smoke-2026-06-11.md)

Audience: contributors checking what Phase 4 update-channel validation has actually been run.

Purpose: dated evidence for the nondestructive same-machine Phase 4 validation: release-date stamping, signed update artifact verification, update-window refusal, scratch updater swap, and packaged updater contents.

Read when: deciding whether Phase 4 repo-side updater foundations are ready to build on, or distinguishing local scratch proof from the unclaimed real installed v(N) to v(N+1) update gate.

Does not own: the install recipe (`install-runbook.md`), license format (`license-design.md`), restore recipe (`restore-runbook.md`), or the future self-serve update UI.

### [phase-1-local-install-smoke-2026-06-11.md](./phase-1-local-install-smoke-2026-06-11.md)

Audience: contributors checking what Phase 1 install validation has actually been run.

Purpose: dated evidence for the nondestructive same-machine compiled-release smoke: release API, worker, office-web standalone, release migrations, first-owner setup, health readiness, and scheduled-job creation against an isolated temporary database.

Read when: deciding whether Phase 1 repo-side install foundations are ready to build on, or distinguishing local smoke proof from the unclaimed clean-machine stranger gate.

Does not own: the install recipe (`install-runbook.md`) or the broader install posture (`self-hosted-installation-strategy.md`).

### [asset-protection-and-licensing.md](./asset-protection-and-licensing.md)

Audience: contributors working on licensing, distribution, updates, or commercial protection posture.

Purpose: the one-time-purchase model, update-window entitlement, and the decision to gate acquisition and updates rather than continued operation, with the refuse-to-start runtime posture and its guardrails.

Read when: touching licensing, the installer/updater, distribution, or any change that could affect whether legitimate customers can run or update the product.

Does not own: general hosting philosophy (`deployment-model.md`) or installer/runbook shape (`self-hosted-installation-strategy.md`). Does not mean any licensing mechanism already exists.

### [license-design.md](./license-design.md)

Audience: contributors implementing or reviewing the Phase 3 licensing primitive.

Purpose: signed license file format, canonical signing bytes, offline Ed25519 verification rules, startup-failure boundary, backup/restore boundary, issuance-tooling boundary, and relay-token separation.

Read when: changing license verification, license issuance tooling, support diagnostics around licensing, updater entitlement checks, or restore behavior for licensed installs.

Does not own: the commercial posture (`asset-protection-and-licensing.md`), the broader install posture (`self-hosted-installation-strategy.md`), or the Phase 4 update mechanism.

### [launch-readiness.md](./launch-readiness.md)

Audience: contributors and the owner planning what BellField needs to ship to real customers as a company.

Purpose: the cross-cutting launch punch list — install, update, license, backup/restore, observability, operator/support controls, security harness, validation evidence, and legal/commercial surface — mapped to milestones, with an explicit "no SaaS cargo-culting" boundary.

Read when: planning Milestone 10/11 work, scoping company-readiness tasks, or deciding whether a launch concern is being tracked.

Does not own: the install recipe itself (`self-hosted-installation-strategy.md`), licensing posture (`asset-protection-and-licensing.md`), or hosting philosophy (`deployment-model.md`). It is a consolidating checklist, not the source of truth for any single area.

### [customer-comms-and-delivery.md](./customer-comms-and-delivery.md)

Audience: contributors planning customer-facing document delivery, estimate email, invoice email, payment links, SMS, or BellField-operated delivery infrastructure.

Purpose: owner-first communications and money-loop delivery plan: person-triggered messages, BellField-operated estimate email, secure PDF delivery, customer-facing template settings, timeline audit rules, and the phased path from estimate email to payment links and SMS.

Read when: planning or implementing outbound customer email/SMS, estimate/invoice delivery, customer approval links, payment links, or customer-facing document delivery.

Does not own: estimate/invoice lifecycle rules (`workflows-and-state-machines.md`), permission taxonomy (`permissions-model.md`), or self-hosting constraints (`deployment-model.md`).

### [sellable-product-execution-plan.md](./sellable-product-execution-plan.md)

Audience: contributors executing the path from "runs for BellField's own shop" to "a stranger can buy, install, run, and update it."

Purpose: the controlling phased execution plan — contradiction closures, the installable artifact and first-admin flow, backup/restore, the licensing primitive, the update channel, relay v1 install integration, and the decisions ledger (D1–D8) — each slice with mechanics and acceptance criteria.

Read when: starting any sellability-infrastructure slice, checking phase order or gates, or recording one of the D# decisions.

Does not own: relay design (`delivery-relay-plan.md`), licensing posture (`asset-protection-and-licensing.md`), install posture (`self-hosted-installation-strategy.md`), or the launch checklist (`launch-readiness.md`). It sequences and executes them.

### [delivery-relay-plan.md](./delivery-relay-plan.md)

Audience: contributors planning or implementing the BellField-hosted delivery relay, relay-token consumption, sender identity tiers, or install-side send queueing.

Purpose: the controlling plan for relay key custody, the per-shop single-active relay token, BellField-domain vs custom-domain sending, the narrow relay API, queue-and-retry semantics, webhook termination, and the build order toward acceptance and payment links.

Read when: designing or building the relay, changing how installs send customer email, or touching delivery entitlement behavior.

Does not own: the communications lane phases (`customer-comms-and-delivery.md`), licensing posture (`asset-protection-and-licensing.md`), or hosting philosophy (`deployment-model.md`).

### [validation-playbook.md](./validation-playbook.md)

Audience: contributors validating risky local DB, office UI, field-device, or release-readiness lanes.

Purpose: repeatable validation layers, evidence locations, local M9 smoke usage, and the boundary between automated checks and manual browser/device proof.

Read when: closing out a milestone, proving a workflow with local DB/API state, or collecting dated evidence for browser/device behavior.

Does not own: product behavior, migration rules, or install strategy.

### [milestone-implementation-plan.md](./milestone-implementation-plan.md)

Audience: contributors deciding what should be built next or whether a change is early.

Purpose: build order, milestone boundaries, and what should be postponed on purpose.

Read when: choosing scope, sequencing work, or checking whether a feature belongs in the current phase.

Does not own: detailed product behavior or current repo setup instructions.

### [dev-setup.md](./dev-setup.md)

Audience: developers setting up or running the repo locally.

Purpose: local prerequisites, environment setup, run commands, and BellField-specific development notes.

Read when: bootstrapping a machine, running apps locally, or checking current workspace commands.

Does not own: product behavior, migration policy, or milestone sequencing.

### [database-migrations.md](./database-migrations.md)

Audience: contributors changing API persistence or tracked schema.

Purpose: the API migration workflow, command usage, naming rules, and migration safety expectations.

Read when: creating, applying, or reviewing schema migrations.

Does not own: broader data-modeling rules or product semantics.

### [api-endpoints.md](./api-endpoints.md)

Audience: contributors wiring office-web, field-mobile, or API clients.

Purpose: quick endpoint catalog showing current paths, surfaces, permission gates, and broad response purpose.

Read when: adding UI client calls, reviewing endpoint availability, or orienting around API surfaces.

Does not own: DTO validation details, product semantics, or the exact implementation; controller/service code remains exact source of truth.

### [modular-monolith-codebase-structure.md](./modular-monolith-codebase-structure.md)

Audience: contributors making architecture or repo-structure decisions.

Purpose: current repo structure guardrails and target-state modular monolith direction.

Read when: deciding where new code belongs, whether a new package or app is justified, or how modules should stay decoupled.

Does not own: current product behavior or a literal inventory of everything that already exists.

### [repo-map.md](./repo-map.md)

Audience: engineers and AI contributors getting oriented before a change.

Purpose: compact current repo map, key module locations, common commands, source-of-truth docs, and drift traps.

Read when: starting work in BellField or handing the repo to a fresh contributor.

Does not own: product rules, workflow semantics, API details, or architecture policy.

### [architecture-guardrails.md](./architecture-guardrails.md)

Audience: contributors changing imports, package boundaries, or shared-code placement.

Purpose: the current architecture rules enforced by `pnpm check:architecture`.

Read when: adding cross-package imports, moving shared types/helpers, or debugging the architecture check.

Does not own: product behavior or milestone sequencing.

### [maintainability-refactor-plan.md](./maintainability-refactor-plan.md)

Audience: contributors planning or executing cleanup/refactor work.

Purpose: current oversized-file baseline, executable file-size rule, and the ordered refactor lanes needed to keep BellField maintainable.

Read when: a source file is approaching the file-size guard, a feature needs to touch an oversized file, or planning a behavior-preserving cleanup slice.

Does not own: product behavior, workflow semantics, or package-boundary rules.

### [crm-job-intake-phase-plan.md](./crm-job-intake-phase-plan.md)

Audience: contributors working on the customer/location/contact-method and New Job intake correction lane.

Purpose: the controlling phase plan for CRM contact methods, job intake rebuild, later CRM refactor, ownership transfer, operational customer/location pages, job-detail navigation, and shell cleanup.

Read when: continuing this lane, reviewing whether Phase 0-2 is complete, or deciding whether Phase 3+ work is allowed.

Does not own: general product rules or screen behavior outside this correction lane. It also does not authorize later phases by itself; follow its stop rule.

### [catalog-phase-plan.md](./catalog-phase-plan.md)

Audience: contributors planning or implementing the trade-neutral Catalog lane.

Purpose: the phase plan for closing the pricebook/catalog gap with a field-first, trade-neutral Catalog that can feed register entries, invoice drafts, estimates, and later service agreements without becoming HVAC-only or a ServiceTitan clone.

Read when: planning Catalog schema, field register catalog selection, office Catalog admin, catalog-backed estimate lines, or catalog/accounting handoff work.

Does not own: core product behavior, workflow state rules, offline sync rules, permissions, or data-modeling invariants; use the focused source-of-truth docs for those.

## Current-State and Handoff Docs

### [whats-shipped.md](./whats-shipped.md)

Audience: contributors reorienting quickly.

Purpose: short current-status snapshot of shipped, open, and not-started work.

Read when: asking "where are we?" before choosing the next slice.

Does not own: milestone definitions or product rules.

### [glossary.md](./glossary.md)

Audience: all contributors.

Purpose: one-line definitions for commonly confused product and implementation terms.

Read when: naming UI labels, docs, DTOs, or implementation concepts.

Does not own: full workflow behavior or schema rules.

### [field-handoff-findings.md](./field-handoff-findings.md)

Audience: contributors working on field-mobile and offline sync.

Purpose: field app trust/readability findings and remaining field-side gaps from recent implementation passes.

Read when: picking up Milestone 6 field app work or checking what field behavior is already trustworthy.

Does not own: general sync rules; use `offline-sync.md` for product intent.

### [field-register-media-plan.md](./field-register-media-plan.md)

Audience: contributors working on remaining field media capture or invoice/register handoff.

Purpose: historical implementation plan plus current shipped/deferred status for register and media.

Read when: continuing field media or register-to-invoice work.

Does not own: current endpoint inventory; use `api-endpoints.md` for that.

### [field-mobile-smoke.md](./field-mobile-smoke.md)

Audience: contributors validating the Expo field app against a local API and local seeded database.

Purpose: repeatable field-mobile smoke setup, assigned-work data prep, Android/Expo launch notes, manual checklist, and screenshot locations.

Read when: running Milestone 6 field sign-in, home/detail, register, equipment, media, or Sync Now smoke checks.

Does not own: field product behavior; use `offline-sync.md` and `screen-behavior-spec.md` for that.

## Evaluation and Comparison Docs

### [fsm-comparison-rubric.md](./fsm-comparison-rubric.md)

Audience: contributors and product reviewers comparing BellField against major field-service management products.

Purpose: reusable 100-point rubric for scoring office UI, field UI, and business-correctness depth against ServiceTitan / Jobber / Housecall Pro / FieldEdge-style expectations.

Read when: running a fresh competitive score, discussing market gaps, or deciding whether a gap is current-scope quality or deferred market parity.

Does not own: BellField behavior; product and workflow docs remain source of truth.

### [fsm-comparison-servicetitan-2026-06-10.md](./fsm-comparison-servicetitan-2026-06-10.md)

Audience: contributors and product reviewers checking the current competitive score.

Purpose: current Chrome/source/public-reference scorecard after Catalog, optioned estimates, estimate PDF delivery, company Settings, tax-setting, and estimate-editor cleanup.

Read when: asking where BellField stands against the mature FSM market today.

Does not own: implementation order or product behavior. Use it as an evaluation snapshot.

## Legacy and Planning Context

### [fsm-comparison-servicetitan-2026-06.md](./fsm-comparison-servicetitan-2026-06.md)

Status: historical comparison snapshot.

Use it for: understanding the 2026-06-08 Chrome scoring run before later Catalog, agreement, estimate delivery, Settings, and tax-setting work.

Do not use it for: current BellField scoring. Use `fsm-comparison-servicetitan-2026-06-10.md` instead.

### [product-shape-plan.md](./product-shape-plan.md)

Status: historical planning context.

Use it for: understanding earlier product framing and planning thought process.

Do not use it for: overriding `product-rules.md`, `screen-behavior-spec.md`, `workflows-and-state-machines.md`, `offline-sync.md`, or `milestone-implementation-plan.md`.

## Practical Reading Paths

For all code tasks:

- `AGENTS.md`
- `README.md`
- `repo-map.md`
- `engineering-standards.md`

For product behavior changes:

- `product-rules.md`
- add `workflows-and-state-machines.md` if lifecycle behavior changes
- add `screen-behavior-spec.md` if UI behavior changes

For schema or persistence changes:

- `data-modeling-rules.md`
- `database-migrations.md`

For API/client wiring:

- `api-endpoints.md`
- the relevant controller/service files

For deployment or hosting changes:

- `deployment-model.md`
- `self-hosted-installation-strategy.md` when the change affects installer shape, setup support, backup/restore, updates, or pilot install expectations
- `asset-protection-and-licensing.md` when the change affects licensing, distribution, update entitlement, or whether legitimate customers can run or update the product

For customer document delivery, communications, or BellField-operated delivery infrastructure:

- `customer-comms-and-delivery.md`
- `product-rules.md`
- `workflows-and-state-machines.md` for estimate, invoice, payment, or acceptance behavior
- `permissions-model.md` for send/configure/payment permissions

For planning what belongs in scope:

- `milestone-implementation-plan.md`
- `crm-job-intake-phase-plan.md` for the CRM/contact-method/New Job intake correction lane and its stop rule
- `whats-shipped.md` for current repo status
- `maintainability-refactor-plan.md` for cleanup that repairs weak structure without adding product scope

For validation and smoke proof:

- `validation-playbook.md`
- `field-mobile-smoke.md` for real-device field app checks
