# BellField Docs Index

Use this page to find the document that owns a task. Read the relevant route, then stop;
there is no need to read every linked document.

## Start Here

- [Repo map](./repo-map.md): apps, packages, source locations, and common commands.
- [What is shipped](./whats-shipped.md): current capabilities and validation boundaries.
- [Launch readiness](./launch-readiness.md): remaining pre-pilot work.
- [Validation evidence index](./validation-evidence-index.md): dated runs and research history.

## Task Reading Paths

| Task                                    | Read                                                                                                                                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any code change                         | [AGENTS](../AGENTS.md), [repo README](../README.md), this index, [repo map](./repo-map.md), [engineering standards](./engineering-standards.md)                                                                                              |
| Decide scope or sequence                | [Positioning](./positioning-and-pricing.md), [feature milestones](./milestone-implementation-plan.md), [sellability phases](./sellable-product-execution-plan.md), [launch readiness](./launch-readiness.md)                                 |
| Product or lifecycle behavior           | [Product rules](./product-rules.md), then [workflows](./workflows-and-state-machines.md) and [screen behavior](./screen-behavior-spec.md) as relevant                                                                                        |
| Permissions or employee administration  | [Permissions model](./permissions-model.md)                                                                                                                                                                                                  |
| Schema, history, or persistence         | [Data modeling](./data-modeling-rules.md), [migration workflow](./database-migrations.md)                                                                                                                                                    |
| API/client wiring                       | [Endpoint catalog](./api-endpoints.md), then the relevant controller/service and shared contracts                                                                                                                                            |
| Field work, offline queue, or media     | [Offline/sync rules](./offline-sync.md), [field handoff](./field-handoff-findings.md), [field media plan](./field-register-media-plan.md); add [data modeling](./data-modeling-rules.md) and [deployment](./deployment-model.md) for storage |
| Customer email, acceptance, or payments | [Customer communications](./customer-comms-and-delivery.md), [relay plan](./delivery-relay-plan.md), then the focused designs below                                                                                                          |
| Install, restore, update, or release    | [Deployment](./deployment-model.md), [sellability phases](./sellable-product-execution-plan.md), then [install](./install-runbook.md), [restore](./restore-runbook.md), or [release operations](./release-operator-route.md)                 |
| Clean-machine/USB validation            | [Gate checklist](./gate-day-checklist.md), [operator rules](./codex-install-test-operator-rules.md), [USB preflight](./release-usb-preflight-checklist.md)                                                                                   |
| Public website                          | [Site maintenance guide](../site/README.md), [positioning](./positioning-and-pricing.md)                                                                                                                                                     |

## Authority and Current State

- [AGENTS.md](../AGENTS.md) owns contributor operating rules and task routing.
- Focused product, workflow, modeling, and deployment documents own their respective rules.
  Broad or historical planning documents do not override them.
- Code, scripts, and the filesystem establish what is implemented. If implementation and a
  controlling rule disagree, resolve the difference deliberately rather than silently changing policy.
- The repo README is a landing page; this index owns navigation. A future-state design is not a
  claim that its implementation or production qualification exists.
- Keep current status in [whats-shipped](./whats-shipped.md) and the owning runbook. Dated
  reports describe their exact run; old blockers and follow-ups are historical context.

## Product and Engineering Owners

- [Product rules](./product-rules.md): customers, locations, equipment, jobs, and product invariants.
- [Workflows and state machines](./workflows-and-state-machines.md): lifecycle transitions and prompts.
- [Screen behavior](./screen-behavior-spec.md): navigation, layout, forms, and office/field interactions.
- [Permissions model](./permissions-model.md): roles, overrides, visibility, and dangerous actions.
- [Data modeling](./data-modeling-rules.md): ownership, snapshots, history, and deletion semantics.
- [Offline sync](./offline-sync.md): field cache, queues, conflicts, and device cutoff rules.
- [Glossary](./glossary.md): shared product terms.
- [Engineering standards](./engineering-standards.md): code structure, comments, tests, and review.
- [Developer setup](./dev-setup.md): local prerequisites, configuration, and run commands.
- [Database migrations](./database-migrations.md): tracked schema changes and bootstrap commands.
- [API endpoints](./api-endpoints.md): endpoint map; controllers and contracts give exact shapes.
- [Architecture guardrails](./architecture-guardrails.md): enforced import and module boundaries.
- [Modular monolith structure](./modular-monolith-codebase-structure.md): architecture direction.
- [Maintainability plan](./maintainability-refactor-plan.md): file-size baseline and bounded refactors.
- [Validation playbook](./validation-playbook.md): checks, disposable DB smokes, and browser/device proof.
- [Shared agent tooling](./agent-tooling.md): portable Gate Day skills, documentation checks, and read-only evidence inspection.
- [Security policy](../SECURITY.md): security review scope and reporting guidance.

## Planning and Commercial Owners

Read positioning first, then the feature and sellability plans in parallel.

- [Positioning and pricing](./positioning-and-pricing.md): product identity, ownership deal, and prices.
- [Milestone implementation](./milestone-implementation-plan.md): feature sequence and boundaries.
- [Sellable product execution](./sellable-product-execution-plan.md): install, license, update, and relay phases.
- [Launch readiness](./launch-readiness.md): consolidated pre-pilot requirements.
- [Remote access](./remote-access-plan.md): managed/BYO tiers and prerequisites.
- [Server builds](./server-build-plan.md): Windows entry tier, dedicated Windows Server, and Linux/Docker direction.
- [SaaS pricing](./saas-pricing-plan.md): deferred, staffing-gated hosted offering; not current implementation scope.
- [CRM/job intake plan](./crm-job-intake-phase-plan.md): focused CRM and intake lane design.
- [Catalog plan](./catalog-phase-plan.md): sellable items, pricing, and agreement lane design.

## Deployment and Operator Routes

- [Deployment model](./deployment-model.md): customer-owned hosting and storage constraints.
- [Self-hosted installation strategy](./self-hosted-installation-strategy.md): supported install posture and support boundaries.
- [Install runbook](./install-runbook.md): release preparation, provisioning, services, and qualification boundary.
- [Restore runbook](./restore-runbook.md): backup sets, replacement-server prerequisites, and recovery procedure.
- [Release operator route](./release-operator-route.md): signing, artifact publishing, and permanent-relay cutover.
- [Testing relay operations](./testing-relay-ops.md): current test-host procedures and credential locations.
- [Triton 500 setup](./triton-500-setup.md): recovery/setup of that specific test machine only.
- [Gate Day checklist](./gate-day-checklist.md): clean-machine validation sequence.
- [Install-test operator rules](./codex-install-test-operator-rules.md): scratch-machine operating constraints.
- [USB preflight checklist](./release-usb-preflight-checklist.md): artifact provenance, packaging, and media verification.
- [USB checkoff template](./release-usb-preflight-checkoff-template.md): the preparation evidence form.
- [Asset protection/licensing](./asset-protection-and-licensing.md): distribution and entitlement posture.
- [License design](./license-design.md): signed license formats and verification.
- [License refund/trial plan](./license-refund-trial-plan.md): trial/refund design and its approval boundaries.

For the latest recorded clean Windows result, use
[rerun 30](./gate-day-clean-windows-smoke-2026-07-08-rerun-30.md) and the current
[gate checklist](./gate-day-checklist.md). Prior attempts are indexed as dated evidence below;
reading an old failure does not reopen a completed gate.

## Customer Delivery and Field Work

- [Customer communications](./customer-comms-and-delivery.md): email-first delivery and follow-through.
- [Delivery relay plan](./delivery-relay-plan.md): sender identity, credential custody, queue/retry, and relay boundaries.
- [Relay token design](./relay-token-design.md): shop identity, single-active binding, and token lifecycle.
- [Acceptance links](./acceptance-links-design.md): customer decisions, version pinning, and poll/ack behavior.
- [Refunds design](./refunds-design.md): manual and provider-confirmed correction paths.
- [Field handoff findings](./field-handoff-findings.md): implemented field behavior and remaining reliability work.
- [Field register/media plan](./field-register-media-plan.md): captured work and attachment design.
- [Field mobile smoke](./field-mobile-smoke.md): repeatable Android/Expo procedure and device run log.

## Public Site

[site/README.md](../site/README.md) owns maintenance of the implemented Pages site and waitlist.
[The pre-release copy draft](./prerelease-site-draft.md) preserves copy/design intent and unresolved
owner markup; it does not describe current deployment or supersede the source files.

## Evidence and Historical Context

- [Validation evidence index](./validation-evidence-index.md): all dated clean-machine, local,
  field-device, and relay/payment reports. Existing evidence stays in its original files.
- [Research pass log](./research-pass-log.md): research provenance, authors, and prompt records.
- [Competitive research log](./competitive-research-log.md): competitive passes and comparisons.
- [Comparison rubric](./fsm-comparison-rubric.md): consistent evaluation method; comparisons do not set scope.
- [Product shape plan](./product-shape-plan.md): legacy framing; focused product rules control.
- Historical shipped-lane context: [M9 office UI](./m9-office-ui-plan.md),
  [M10 trust/admin](./m10-trust-admin-plan.md), [inventory/job costing](./inventory-job-costing-plan.md),
  and [field-capture costing](./job-costing-from-field-capture-spec.md).

When updating docs, change the owning rule and current status together. Keep raw run history in
its dated report, link it from the evidence index, and avoid copying long narratives into this router.
