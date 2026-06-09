# BellField Deployment Model and Technical Constraints

This document defines the non-negotiable deployment and hosting rules for BellField.

The purpose of this document is to keep BellField aligned with its intended real-world use:

- self-hosted first
- practical for small field-service companies
- low operating cost
- customer-owned data
- office plus field access
- simple enough for smaller shops without dedicated IT staff

This document should guide architecture, coding decisions, deployment decisions, sync behavior, support expectations, and feature design.

---

## 1. Core Hosting Philosophy

BellField should be built for a **single company to run on its own hardware first**.

BellField should **not host customer business data**.

Important principles:

- the customer owns the server
- the customer owns the database
- the customer owns the attachment storage
- BellField should not require BellField-controlled cloud hosting in order to function
- cloud-hosted BellField infrastructure may be explored later, but self-hosted is the primary identity of the product

BellField should be designed with future cloud options in mind, but should not depend on them.

---

## 2. Default Deployment Model

BellField should be designed around this normal setup:

### Main deployment layout

- one main server PC at the customer office
- multiple office desktop computers connecting to that server
- technicians using the field app on mobile devices
- mobile devices connecting securely back to the customer-owned system

### Day-to-day expectation

- office users work from their own desktops
- shared storage and core application data live on the main server machine
- the server should stay on whenever the company expects service activity, such as business hours or 24-hour emergency service

This is the default deployment model BellField should optimize for first.

---

## 3. Office Application Model

BellField should favor a **browser-based office application** even if it feels like a normal desktop-style business app.

Reasoning:

- easier updates
- easier multi-user access across office PCs
- easier self-hosting on a shared server machine
- easier support for several office users working at once
- avoids the complexity of syncing separate installed desktop databases

Practical rule:

- the office application should look and feel like a serious installed business application
- but technically it should work as a web app served from the company-owned BellField server

This is the preferred model even if the user originally imagines a traditional installed Windows program.

---

## 4. Field Application Model

BellField should include a real mobile field app from the beginning.

### Mobile priorities

- Android support first
- simple enough for older technicians
- weak-signal tolerant
- local save behavior
- sync later when needed

### Technician experience rules

- technicians should be able to keep working even if internet connectivity is poor
- changes should save locally on the device
- office users should only see field changes after the technician saves them
- large uploads such as videos and many photos may take longer to sync
- the field app should allow users to cancel or stop long-running uploads if needed and continue working

The mobile app is a core part of BellField, not an optional add-on.

---

## 5. Customer Data Ownership and Privacy

BellField should default to **zero BellField-side access to customer data**.

That means:

- BellField should not collect or host live customer operational data by default
- support and troubleshooting should rely on exported logs, screenshots, or customer-approved diagnostic files
- if a customer wants help, they should intentionally choose what to share
- remote support access should not be assumed or built in as a default dependency

### Support expectation

Support should work like this:

- the customer exports logs or diagnostic bundles
- the customer may optionally share those with support
- logs should avoid including unnecessary business data wherever possible

BellField should include a support/log export capability that helps customers share technical issue information without automatically exposing their business data.

---

## 6. Small Shop Hosting Goal

BellField should be realistic for small shops such as:

- 1 to 5 office staff
- 1 to 5 technicians

### Primary goal

BellField should be easy enough that a small shop can run it without a dedicated IT person.

### Secondary goal

BellField should still be reliable enough that more serious shops can trust it.

### Design target

BellField should aim for a balance of:

- reasonable ease of setup
- strong reliability
- low ongoing operating cost

If BellField must choose between flashy complexity and dependable operation, it should choose dependable operation.

---

## 7. Supported Server Environment

### Primary supported environment

- Windows server PC at the customer office
- multiple office desktops connecting to it

### General recommendation

Windows should be supported because many small shops will already have or prefer a Windows machine.

However, BellField should also provide system recommendations such as:

- a newer dedicated machine is better when the customer can afford it
- older hardware may still work for smaller shops if expectations are reasonable

### Practical expectation

BellField should not assume:

- enterprise hardware
- always-on cloud servers
- paid cloud storage
- expensive managed infrastructure

The product should remain practical for reused or modest hardware as long as the company understands its limits.

### Installation support posture

Self-hosted does not mean unsupported install.

BellField should provide one narrow, controlled Windows-friendly setup path before it promises broad setup flexibility.
Customers should not be expected to run Git, Node.js, pnpm, Docker, migrations, or other developer commands as part of a normal production installation.

The detailed install posture, early support boundary, and readiness gates live in [self-hosted-installation-strategy.md](./self-hosted-installation-strategy.md).

---

## 8. Multi-User Office Behavior

BellField must support multiple office users working at the same time.

That means:

- several office desktops can be logged in at once
- data changes should appear quickly to other office users where appropriate
- dispatch-related changes should update quickly enough to support real office coordination
- the office should not depend on one single user session or one single desktop application instance

The architecture must be multi-user from the start.

---

## 9. Local Storage and Attachment Rules

By default, BellField should store files on customer-owned hardware.

### Default behavior

- attachments should live on the customer’s server machine or customer-selected storage location
- the customer should be able to choose or change the attachment storage location in settings
- changing attachment storage location should be a high-permission action

### Current media storage configuration

The API now stores media blobs on the server filesystem.

Runtime configuration:

- `BELLFIELD_MEDIA_ROOT` - absolute path where uploaded media blobs are stored
- `BELLFIELD_MEDIA_TOKEN_SECRET` - long random secret used to sign upload/download tokens
- `BELLFIELD_MEDIA_MAX_BYTES` - optional raw upload size limit, default 50 MB
- `BELLFIELD_MEDIA_TOKEN_TTL_SECONDS` - optional signed token lifetime, default 300 seconds

Production must set `BELLFIELD_MEDIA_ROOT` and `BELLFIELD_MEDIA_TOKEN_SECRET`.
The token secret must be at least 32 characters and cannot be the dev fallback
or sample placeholder value.
Development and test runs may fall back to temporary local values, but that fallback is not a deployment posture.

The current v1 filesystem layout stores blobs under:

```text
<BELLFIELD_MEDIA_ROOT>/<job-id>/<media-id><extension>
```

The database stores media metadata and relative storage paths.
Backups must include both the PostgreSQL database and the media root; backing up only the database will preserve the records but lose the actual uploaded files.

### File types

BellField should support:

- photos
- videos
- file attachments
- exported documents later

### Important rule

Large attachments should not block technicians from continuing their work.

Uploads may continue later or sync later, depending on connection quality and workflow design.

---

## 10. Backup Philosophy

BellField should support **easy restore from backup** onto a replacement machine.

### Core backup rules

- changes should save as work happens
- the system should be restorable without fancy infrastructure
- a small shop should be able to recover onto another Windows PC if needed

### Backup options

BellField should support both:

- automatic backup
- manual backup

### Customer choice

The company should be able to choose backup behavior in settings.

### Recommended warning and monitoring behavior

BellField should be able to warn when:

- backups have not run recently
- the server drive is running low on space
- a field device has not synced in a long time

Companies should be able to control how and when those warnings appear.

### Backup storage default

By default, backups should stay on customer-owned hardware.

Later, BellField may allow customers to choose other destinations, but BellField should not require BellField-hosted backup storage.

---

## 11. Internet Outage and Offline Behavior

BellField should assume internet outages are possible.

### Most important outage rule

If internet service goes down, technicians must still be able to continue working and sync later.

### Office behavior during outage

Because BellField data lives on the local server machine:

- most office workflows inside the shop should still work as long as the local network and server are still running

### Field behavior during outage

If the office internet is down or unreachable:

- technicians should continue working locally on the mobile app
- sync should wait until connectivity returns

### Server off behavior

If the office server is powered off:

- field syncing may wait until it comes back online
- this is acceptable for smaller self-hosted deployments

---

## 12. Remote Access Philosophy

BellField should support **local office use plus secure remote field access**.

### Recommended remote access goal

Remote access should be designed as:

- simple to set up once
- secure
- forgettable in day-to-day use

BellField should not depend on customers manually doing advanced networking work every time something changes.

### Important rule

BellField should not assume BellField-hosted relay infrastructure is required for the product to work.

Instead, BellField should be structured so customers can use:

- simple secure remote access to their own server
- customer-controlled networking path to their own BellField installation

BellField should document a recommended secure remote access pattern later, but should not require BellField-hosted customer data in order to make field access possible.

---

## 13. Updates Philosophy

BellField should prefer **safe updates over aggressive updates**.

### Default expectation

Automatic updates should be the default behavior where practical.

### User control

Manual updates should also be available as an option.

### Safety rule

BellField should generally prefer:

- do not update unless it is safe

This means BellField should avoid update strategies that casually risk breaking a small shop’s live system.

### Update behavior expectations

- update behavior should be configurable by the company
- office-side update flow should be understandable for non-technical customers
- updates should not require BellField to host customer data

---

## 14. Authentication and Device Access Rules

### User accounts

Every employee should have their own login.

BellField should not rely on shared office credentials as a normal practice.

### Password management

- the owner or a high-permission admin should be able to reset employee passwords
- after a password is set, other users should not be able to see the actual password value

### Stay signed in

The field app and office application may offer a "stay signed in" style option where appropriate.

### Lost device protection

If a technician loses a device:

- the office or owner should be able to revoke or cut off that device’s access

### Former employees

If someone leaves the company:

- their account should be disabled
- their change history should remain attached to their user history
- the owner may decide later whether to delete that history

---

## 15. Plugins and Paid Extras Philosophy

The core BellField product should work without paid extras.

BellField should not require outside paid services just to handle its main purpose.

### Core product should function without

- paid texting services
- paid email platforms
- paid payment processors
- paid reminder engines
- paid cloud storage

### Integration philosophy

Things like texting, email delivery, payment processing, and similar extras should be treated as:

- optional plug-ins
- optional modules
- optional integrations

Customers should be able to ignore those entirely if they want.

### Provider ownership and adapters

When BellField integrates with paid services, the normal self-hosted posture should be:

- the customer owns the provider account
- the customer controls API keys and billing
- provider keys live in customer-controlled deployment settings
- BellField stores only the operational result it needs, such as send status, payment confirmation, or a provider reference
- provider pricing and terms are rechecked at implementation time

Email, SMS, and payment integrations should be adapter-backed so the product can support provider choices over time.
Examples include:

- transactional email through SMTP, Resend, Postmark, or similar providers
- payment links or gateway capture through Stripe or another processor
- SMS through Twilio, Telnyx, or another compliant messaging provider

These examples are not product dependencies.
They are candidates for optional adapters when the implementation slice reaches customer document delivery, reminders, or payment capture.

### Growth and communication boundary

BellField should add communication tools in an operational order:

1. estimate and invoice delivery
2. customer approval links and audit history
3. payment links for posted invoices
4. appointment reminders and on-my-way messages
5. service agreement renewal or follow-up notices

Full marketing campaigns, broad customer portals, and BellField-hosted customer-data services should remain later optional work.
They should not become required infrastructure for the core self-hosted product.

---

## 16. Technical Constraints for the Codebase

These technical constraints should guide the actual codebase.

### Backend and clients

- the office app and field app should never talk directly to each other
- both should communicate through the BellField backend
- business rules should live in the backend and shared domain logic, not be split randomly across clients
- clients should never talk directly to the database

### Data persistence

- the main business database should live on the customer-owned server
- field devices should keep local working data for offline use
- field sync should be queue-based and resilient

### Storage abstraction

BellField should use a storage abstraction so that:

- local file storage works by default
- alternate storage targets could be added later
- the product does not have to be rewritten just because a customer wants to move file storage later

### Cost control rule

BellField should avoid making optional infrastructure mandatory too early.

That means BellField should not require extra paid or heavy infrastructure unless the product truly needs it later.

---

## 17. First-Version Deployment Priorities

The first version of BellField should optimize for:

1. reliability
2. practical self-hosting
3. support for small shops
4. low operating cost
5. ease of setup without assuming deep technical knowledge

BellField does not need to solve every deployment style at once.

It should first be excellent at this:

- one company
- one main office server PC
- office desktops connecting to it
- Android field app
- local data ownership
- secure remote field access
- local backup and restore capability

Early paid pilots should assume assisted setup until the BellField Server install path has been proven from a clean runbook, including backup, restore, update, office-desktop access, and field-device sync.

---

## 18. Summary

BellField should be built with these deployment truths in mind:

- self-hosted first
- customer-owned data
- no required BellField-hosted business data
- one office server PC plus multiple office desktops
- Android-first field app
- local save and later sync for field work
- Windows support for small shops
- safe updates over risky updates
- optional integrations instead of mandatory paid services
- easy backup and restore
- support export logs without exposing live customer data by default

If future cloud options are added later, they should be additive.

They should not break BellField’s core identity as a practical, self-hosted field-service platform for real service companies.
