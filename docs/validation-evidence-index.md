# Validation and Research Evidence Index

Dated reports preserve the source commit, environment, outcome, and limitations of each run.
They are evidence, not current operator instructions. Use [the docs index](./README.md) for
current procedures and [what is shipped](./whats-shipped.md) for implementation status.

## Latest Clean Windows Boundary

[Rerun 30](./gate-day-clean-windows-smoke-2026-07-08-rerun-30.md) records Gates 1–3 completed
on the named Windows 11 Home artifacts: install/reboot/second-device office access, packaged
backup/restore, and installed update. Gate 4 expired-window refusal and Gate 5 sold-shaped relay
acceptance remain unattempted in that record. The broader Android field-device lane remains separate.

Rerun 30 did not separately record post-restore marker absence;
[rerun 15](./gate-day-clean-windows-smoke-2026-06-20-rerun-15.md) remains the direct
marker-erasure evidence. Follow [the gate checklist](./gate-day-checklist.md),
[install runbook](./install-runbook.md), and [restore runbook](./restore-runbook.md)
for current execution. Earlier blockers below describe earlier artifacts; do not replay their
old follow-up instructions as the current plan.

## Clean Windows Attempt History

These are the checked-in attempts; gaps in numbering do not imply additional evidence.

- [Clean Windows Gate-Day Smoke - 2026-06-20](./gate-day-clean-windows-smoke-2026-06-20.md)
- [Clean Windows Gate-Day Smoke Rerun 2 - 2026-06-20](./gate-day-clean-windows-smoke-2026-06-20-rerun-2.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 3](./gate-day-clean-windows-smoke-2026-06-20-rerun-3.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 4](./gate-day-clean-windows-smoke-2026-06-20-rerun-4.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 5](./gate-day-clean-windows-smoke-2026-06-20-rerun-5.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 6](./gate-day-clean-windows-smoke-2026-06-20-rerun-6.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 7](./gate-day-clean-windows-smoke-2026-06-20-rerun-7.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 8](./gate-day-clean-windows-smoke-2026-06-20-rerun-8.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 9](./gate-day-clean-windows-smoke-2026-06-20-rerun-9.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 10](./gate-day-clean-windows-smoke-2026-06-20-rerun-10.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 11](./gate-day-clean-windows-smoke-2026-06-20-rerun-11.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 12](./gate-day-clean-windows-smoke-2026-06-20-rerun-12.md)
- [Gate Day Clean Windows Smoke - 2026-06-20 Rerun 13](./gate-day-clean-windows-smoke-2026-06-20-rerun-13.md)
- [Gate Day Clean Windows Smoke - 2026-06-23 Rerun 14](./gate-day-clean-windows-smoke-2026-06-20-rerun-14.md)
- [Gate Day Clean Windows Smoke - 2026-06-24 Rerun 15](./gate-day-clean-windows-smoke-2026-06-20-rerun-15.md)
- [Gate Day Clean Windows Smoke - 2026-06-26 Rerun 16](./gate-day-clean-windows-smoke-2026-06-20-rerun-16.md)
- [Gate Day Clean Windows Smoke - 2026-06-27 Rerun 17](./gate-day-clean-windows-smoke-2026-06-20-rerun-17.md)
- [Gate Day Clean Windows Smoke - 2026-06-27 Rerun 18](./gate-day-clean-windows-smoke-2026-06-20-rerun-18.md)
- [Gate Day Clean Windows Smoke - 2026-06-28 Rerun 19](./gate-day-clean-windows-smoke-2026-06-20-rerun-19.md)
- [Gate Day Clean Windows Smoke - 2026-06-28 Rerun 21](./gate-day-clean-windows-smoke-2026-06-20-rerun-21.md)
- [Gate Day Clean Windows Smoke - 2026-07-08 Rerun 30](./gate-day-clean-windows-smoke-2026-07-08-rerun-30.md)

## Local, Device, and Live-Service Evidence

Local smoke, real-device proof, testing-relay operation, and payment-provider sandbox proof
have distinct boundaries. A passing report does not establish permanent production hosting
or qualify a different artifact.

- [Field Mobile Offline Queue Ownership Smoke - 2026-06-19](./field-mobile-offline-queue-ownership-smoke-2026-06-19.md)
- [Online Refund Live Stripe Smoke — 2026-06-15](./online-refund-live-smoke-2026-06-15.md)
- [Payment Link Depth Live Stripe Smoke - 2026-06-15](./payment-link-depth-live-smoke-2026-06-15.md)
- [Phase 1 Local Install Smoke - 2026-06-11](./phase-1-local-install-smoke-2026-06-11.md)
- [Phase 2 Local Backup/Restore Smoke - 2026-06-11](./phase-2-local-backup-restore-smoke-2026-06-11.md)
- [Phase 3 Local License Smoke - 2026-06-11](./phase-3-local-license-smoke-2026-06-11.md)
- [Phase 4 Local Updater Smoke - 2026-06-11](./phase-4-local-updater-smoke-2026-06-11.md)
- [Phase 6a Live Acceptance Smoke - 2026-06-13](./phase-6a-live-acceptance-smoke-2026-06-13.md)
- [Phase 6b Live Invoice Email and Payment-Link Smoke - 2026-06-14](./phase-6b-live-invoice-email-payment-smoke-2026-06-14.md)
- [Testing Relay Deployment — 2026-06-12](./relay-deployment-2026-06-12.md)

Additional run logs live in the [validation playbook](./validation-playbook.md) and
[field mobile smoke procedure](./field-mobile-smoke.md).

## Competitive Research Snapshots

Use [the research pass log](./research-pass-log.md), [competitive research log](./competitive-research-log.md),
and [comparison rubric](./fsm-comparison-rubric.md) for attribution and method. These snapshots
record observations and proposals at their dates; [positioning](./positioning-and-pricing.md)
and the approved implementation plans control scope.

- [BellField vs. ServiceTitan - Scored Comparison (Chrome rerun, 2026-06-10)](./fsm-comparison-servicetitan-2026-06-10.md)
- [BellField vs. ServiceTitan - Scored Comparison (Chrome rerun, 2026-06-12)](./fsm-comparison-servicetitan-2026-06-12.md)
- [BellField vs. ServiceTitan — Scored Comparison (Chrome rerun, 2026-06-08)](./fsm-comparison-servicetitan-2026-06.md)
- [ServiceTitan Deep-Systems Comparison — 2026-07-14 Codex Pass](./fsm-comparison-servicetitan-2026-07-14-codex-deep-pass.md)
- [BellField vs. ServiceTitan — Gap Analysis & Design Self-Audit (2026-07-14)](./fsm-gap-analysis-2026-07-14.md)
