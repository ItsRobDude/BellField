# Field-Service Platform - Modular Monolith Codebase Structure

> Status: architecture direction and repo-structure guardrail.
> This document is not the source of truth for the exact current filesystem inventory.
> For what exists today, prefer `README.md`, `docs/dev-setup.md`, and the repo itself.

This document defines how BellField should keep its codebase organized as a modular monolith without pretending that future apps or packages already exist.

## 1. Current Repo Shape

Current top-level apps:

- `apps/office-web`
- `apps/field-mobile`
- `apps/api`
- `apps/worker`

Current shared packages:

- `packages/contracts`
- `packages/validation`
- `packages/utils`

Current repo rule:

- new top-level apps or packages should not be added casually
- if a new top-level area is introduced, the docs should be updated intentionally

## 2. Architecture Direction

BellField should continue to use a modular monolith posture:

- one shared backend as the source of truth for business rules
- one primary PostgreSQL database
- clients that talk to the backend, not directly to the database
- module boundaries that stay explicit even inside one backend process

This direction exists to keep deployment simple while still preventing spaghetti coupling.

## 3. App Responsibilities

### `apps/office-web`

Purpose: office-facing web application for CSR, dispatch, management, and accounting workflows.

### Current foundation data boundary

The early codebase may use `apps/api/src/modules/company-data` as foundation persistence glue while the first operational modules are still being stabilized.

Rules:
- Other API modules may depend on `company-data` public services and exported record/input types.
- Other API modules must not import `company-data` repository files directly.
- When CRM, locations, equipment, jobs, and appointments become durable milestone layers, move ownership out of the foundation glue deliberately instead of letting `company-data` become a permanent everything module.

---

Rules:

- talks only to the backend
- does not own business rules by itself
- should stay dense, practical, and desktop-friendly

### `apps/field-mobile`

Purpose: technician-facing mobile application with offline-tolerant behavior.

Rules:

- stores only the data needed for assigned field work
- syncs through backend APIs
- should not fork product logic away from office or backend rules

### `apps/api`

Purpose: shared backend and primary business-logic host.

Rules:

- owns trusted business rules
- owns database writes
- should keep internal module boundaries explicit

### `apps/worker`

Purpose: background task execution and asynchronous processing.

Rules:

- should support backend-owned workflows rather than become a second business-logic center
- should stay narrow and explicit about what it processes

## 4. Shared Package Rules

Current shared packages should stay narrow:

- `contracts` for shared request, response, and contract shapes
- `validation` for shared validation helpers
- `utils` for small cross-cutting utilities

Package guardrails:

- do not move domain behavior into random shared packages
- do not add packages just to feel architecturally sophisticated
- prefer fewer, clearer packages until the repo has a real reason to split more code out

## 5. Backend Module Direction

Inside the API, BellField should continue moving toward explicit domain modules such as:

- identity and access
- CRM and customer data
- locations and contacts
- equipment
- jobs, appointments, and dispatch operations
- estimates
- billing
- purchasing and inventory
- files and audit
- sync

These names describe direction, not a requirement that every boundary already exists as a final package or folder shape.

## 6. Boundary Rules

Non-negotiable boundary rules:

- office and field clients never talk directly to each other
- clients never talk directly to the database
- backend and shared domain logic own business rules
- modules should not silently mutate each other's private data
- cross-module coordination should be explicit, not accidental

## 7. Future Expansion Rule

If BellField later adds more apps, packages, or infrastructure areas:

- document whether they are current-state or target-state
- keep names boring and obvious
- avoid cloud-only assumptions
- do not split code just because a theoretical future architecture might want it
