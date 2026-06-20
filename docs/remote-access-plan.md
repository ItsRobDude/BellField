# Remote Access Plan

Decided with the owner 2026-06-12: remote access to a shop's BellField
server is **in scope**, with the BellField-managed option available **from
day 1** alongside guided bring-your-own routes. This document is the
controlling plan; detailed slicing happens when the lane opens.

## Why this exists

Two needs, one mechanism:

- **Mid-day field sync.** Field tablets that leave the shop's network run on
  the offline cache and only sync when back on the LAN. A noon reassignment
  is invisible to the tech until they return. Remote access closes that loop.
- **Owner/office anywhere.** Checking tomorrow's board from home, with
  exactly the people the owner permits.

Authorization model: network reachability is the only new layer. Identity
stays BellField logins — roles and permissions govern what a connected
person can do, same as at the shop. The owner grants network access
per-person/per-device through whichever tier below they use.

## Two tiers (both day-1)

### Managed — `shopname.bellfield.app` (paid add-on, ~$15/mo)

The relay's own pattern, repeated per shop: a `cloudflared` connector runs
on the shop server (outbound-only, no router ports, shop IP hidden) and
BellField routes a per-shop hostname to it. Zero networking knowledge
required from the shop; revocable BellField-side; billed like the relay
because BellField carries the availability obligation.

Posture note for the honest pitch: managed-tier traffic transits the tunnel
provider's edge. Shops for whom that matters use the BYO tier — that choice
itself is part of the ownership story.

### Bring-your-own (free, guided or not at all)

Tailscale first (free tier fits small shops, end-to-end encrypted,
BellField never in the path — philosophically identical to
bring-your-own-processor). Per the supported-path rule in
[positioning-and-pricing.md](./positioning-and-pricing.md): BellField ships
a walkthrough that holds the shop's hand to a working setup. Other VPNs are
"your route, your support."

**Never offered, never documented: router port-forwarding.** That is how
shop servers end up indexed on the public internet.

## Security prerequisites before the managed tier ships

Exposing office-web/API beyond the LAN — even behind an unguessable
hostname — means the login page is internet-reachable. Before day-1 sale:

1. Login endpoint throttling/lockout. Closed 2026-06-19 for normal login:
   failed sign-ins are DB-backed and normalized-email-bucketed. Five failed
   attempts inside 15 minutes creates a 5-minute lockout. A locked-out account
   is recoverable from the server console with
   `C:\BellField\release\runtime\node\node.exe C:\BellField\release\tools\install\clear-login-attempts.mjs --email=<employee@example.com>`.
   In a source checkout, the equivalent is
   `pnpm --filter @bellfield/api identity-admin clear-login-attempts --email=<employee@example.com>`.
   The first-owner setup endpoint remains in-memory rate-limited and should move
   to DB-backed throttling in a later hardening pass.
2. Password posture review for office accounts. Closed 2026-06-19 for newly
   set passwords: first-owner setup, employee creation, and password reset now
   require at least 12 characters. Existing shorter passwords can still log in
   so sold installs are not forced through an unplanned rotation. Seeded-dev
   convenience logins must never exist on a sold install — already true via
   first-owner setup and production seed-bootstrap refusal.
3. Session hardening. Closed 2026-06-19: sessions now have backend-enforced
   absolute expiry computed from `issued_at` (12 hours for office-web, 30 days
   for field-mobile by default). Expired field sessions force re-login without
   wiping queued offline work; revoked/inactive devices still use the destructive
   device-cutoff path.
4. Optional hardening to evaluate, not promise: tunnel-level access policy
   (e.g., Cloudflare Access in front of the hostname) as a second wall.
5. Field-mobile base URL handling: tablets need the remote hostname when off
   LAN (config or auto-failover — design decision for the build phase).

## Open items (build-phase)

- Per-shop tunnel provisioning automation (create tunnel + DNS + token from
  BellField side; the relay deployment proved every API call needed).
- Naming: `<shop>.bellfield.app` namespace rules and collision policy.
- Whether managed-access state (configured/healthy) surfaces on the System
  page (it should, with no-leakage copy).
- Billing mechanics: flat monthly alongside relay usage on one statement.
- Tailscale walkthrough doc with screenshots, written for a non-technical
  office manager.
