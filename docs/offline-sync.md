# BellField Offline and Sync Model

This document defines how BellField should behave when technicians are in the field, especially when signal is weak, internet is down, or the office server is temporarily unavailable.

Its purpose is to lock the real-world sync rules before technical implementation begins.

This is a product behavior document, not a coding document.

Current implementation note:

- `docs/field-handoff-findings.md` tracks the field app's current shipped/offline status.
- In-screen background sync and register entry queueing exist.
- Field-side media capture/blob replay now has a first implementation with client-side size guardrails, deterministic media failure resolution, and staged-file cleanup after successful sync.
- Field-mobile treats revoked/inactive server-confirmed session access loss as a device cutoff: it clears assigned-work cache, pending queue, truck-stock cache, and staged media from BellField's Expo-owned local storage, then returns to sign-in. Ordinary session expiry is different: it returns to sign-in without clearing queued offline work. Queued field work and staged media are employee-scoped locally so a different technician login on the same device does not inherit, replace, or replay another technician's unsynced work.

---

## 1. Core Sync Philosophy

BellField should be designed so technicians can keep working even when connection quality is poor.

The system should behave like this:

- the phone stores local working data for assigned jobs
- the technician can keep working offline
- the phone syncs back to the company-owned server when connection returns
- the office server remains the main source of truth
- the field app should help work continue, not block it

BellField should prefer:

- quiet background syncing
- clear pending-sync visibility
- strong protection against data loss
- practical warnings only when needed

---

## 2. What the Phone Stores by Default

By default, the field app should locally store only the data needed for the technician’s assigned work.

### Default local job window

The phone should download:

- today’s assigned jobs
- tomorrow’s assigned jobs

This should be the default behavior.

BellField should also allow the company to expand that window later through a setting or toggle if they want more than today + tomorrow.

### Assigned-work-only model

The phone should not try to store the entire company database.

Instead, it should store only the information needed for the technician’s assigned jobs in the configured time window.

---

## 3. What Job Data Gets Stored on the Phone

For each assigned job in the local sync window, the phone should store the practical information the technician needs to do the work.

This includes:

- job details
- appointment details
- location details
- linked contacts needed for the job
- equipment list for that location
- relevant service history for that job/location/equipment
- current estimate context where relevant
- current invoice/register draft context where relevant

BellField should prefer storing the job-specific data needed for field work rather than broad company-wide data.

---

## 4. Offline-Capable Actions

The following should work offline in version 1:

- notes
- appointment status changes
- register entries
- equipment edits
- estimate creation/drafting
- attachment queueing for photos/videos/files

These actions should be saved locally first and synced later.

### Payment rule

Payments should remain online-only in version 1.

BellField should not allow payment processing to finalize offline in v1.

---

## 5. Save Behavior in the Field

The field app should save work locally as the technician uses it.

Important behavior:

- office users should only see field changes after the technician saves them and sync reaches the server
- unsaved field edits should remain local to the device until the user saves

This keeps office users from seeing half-finished edits while a technician is still working.

---

## 6. Sync Timing Behavior

BellField should sync in the background when connection is available.

### Default sync behavior

- auto-sync should happen in the background when signal returns
- BellField should also provide a visible **Sync Now** button
- BellField should show a clear pending-sync count or sync indicator

The goal is:

- automatic syncing most of the time
- manual sync visibility when the user wants reassurance or control

---

## 7. Conflict Handling Rules

BellField should aim to sync often enough that serious conflicts are uncommon.

However, if conflicts happen, BellField should use simple, practical rules.

### Safe merge items

These should normally merge in without much trouble:

- notes
- photos
- videos
- file attachments
- register entries
- similar additive records

### Same-field conflict behavior

If the office and the field both change the same field differently before sync catches up:

- BellField should flag that conflict for office review
- BellField should not silently bury the problem

The goal is to preserve work and make conflicts visible without creating unnecessary chaos.

---

## 8. Removed/Reassigned Job While Offline

If a technician is removed from a job while offline, but they already performed work and entered data:

- their unsynced work should still upload later
- BellField should preserve that work
- BellField should create a warning/note/history flag so office staff understand the situation

The company should not lose work simply because assignment changed while the technician was disconnected.

---

## 9. Attachment and Media Sync Rules

BellField should prioritize text/data first and heavy media second.

### Practical storage rule

The phone should prefer:

- core text/data first
- heavy photos/videos on demand where practical

This helps prevent the field app from consuming too much device storage too quickly.

### Large upload behavior

Large photos/videos/files may take longer to sync.

BellField should allow the technician to:

- keep working while large uploads are pending
- cancel or stop a long-running upload if needed
- sync those items later

Large media should not block the technician from finishing the rest of their work.

---

## 10. Unsynced Work Retention

BellField should never casually throw away unsynced work.

Default rule:

- unsynced work stays on the device until it syncs successfully or is intentionally cleared through an allowed action

BellField should not auto-expire unsynced work just because time passed.

This helps protect the company from accidental data loss.

---

## 11. Server Down / Internet Down Behavior

BellField should assume the office server or office internet may be unavailable sometimes.

### Office internet outage

If the office internet goes down:

- technicians should continue working locally
- sync should wait until connection returns

### Office server unavailable

If the office server is down or unreachable:

- the phone should quietly keep changes queued
- BellField should retry later
- technicians should still be able to keep working with already-synced job data

BellField should avoid scaring the technician with constant interruptions.

In most cases:

- warnings about sync trouble should mainly appear in the sync area or when the user checks sync status

---

## 12. Device Sign-In Behavior

BellField should allow technicians to stay signed in if the company allows it.

### Stay signed in behavior

The field app may offer a “stay signed in” style option so the technician does not have to log in constantly.

A technician should be able to keep using already-synced jobs offline until:

- they sign out
- the company forces re-login
- the device is revoked

This supports practical real-life field usage.

---

## 13. Lost or Revoked Device Behavior

If a device is lost or access is revoked:

- BellField should cut off that device’s access
- local BellField data should be wiped the next time that device successfully connects

Important protection rule:

- Before the server has confirmed access loss, BellField should try to sync local work as best as it can so the company does not lose valid work already entered on that device.
- Once the server confirms the session/device/employee is no longer allowed, that rejected bearer token cannot safely replay work; the field app should treat this as a destructive device cutoff and wipe BellField local field data.

If the device never reconnects, BellField can only act on the next successful connection.

---

## 14. Visibility of Sync Health

BellField should make sync health visible without becoming annoying.

The field app should make it easy to see:

- pending sync count
- whether sync is current
- whether uploads are still pending
- whether the server is unreachable

Companies should later be able to configure how aggressive or quiet sync warnings should be.

---

## 15. Office Visibility Rules

The office should not see field edits until:

- the technician saves them
- and the device syncs them back to the server

Once synced:

- dispatch board changes should update live
- office staff should see the latest field-saved information quickly

This keeps the office/server authoritative without removing the technician’s ability to work offline.

---

## 16. Default V1 Summary

BellField version 1 offline/sync behavior should work like this:

- the phone stores assigned jobs only
- default local window is today + tomorrow
- companies can later allow more days if desired
- technicians can work offline
- notes, statuses, register items, equipment edits, estimates, and attachments can queue locally
- payments stay online-only
- auto-sync runs in the background when possible
- Sync Now is available
- pending-sync visibility is clear
- additive records merge cleanly
- same-field conflicts get flagged for office review
- removed/offline tech work still uploads later with a warning/history note
- large media can take longer and should not block work
- unsynced work should remain until safely synced or intentionally cleared
- if the server is down, the phone keeps retrying later
- revoked/inactive access wipes BellField data on next server-confirmed access loss; ordinary session expiry returns to sign-in without wiping employee-scoped queued work

BellField should always favor protecting the company’s work over forcing perfect online behavior.
