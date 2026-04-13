# BellField Screen Behavior Specification

This document defines how BellField’s main screens should behave in day-to-day use.

Its purpose is to lock the behavior, layout intent, and interaction style of the core office and field screens before technical implementation begins.

This is a product behavior document, not a coding document.

---

## 1. Overall UI Philosophy

BellField should feel:
- modern
- clean
- organized
- practical
- dense when needed, but not overwhelming

The product should avoid feeling like cluttered enterprise software while still keeping important information easy to reach.

Core design principles:
- fewer screens with smarter tabs, drawers, and grouped sections
- full-page versions should still exist for views that become too cluttered in a drawer
- avoid excessive pop-up modals
- prefer tables, tiles, tabs, inline sections, and side drawers
- locked actions should often remain visible but disabled/greyed out
- future UI customization should be possible, including drag/drop organization and tab ordering where practical

BellField should generally aim for a visual organization style in the same family as ServiceTitan or FieldOps for operational depth, while keeping a cleaner, easier-to-learn small-shop identity closer to the best parts of Housecall Pro or Jobber.

Important UI posture:
- BellField should not copy large-suite clutter just because enterprise products have it
- common actions should feel obvious and low-friction
- advanced depth should be layered behind drawers, tabs, filters, and workbenches instead of crowding the default view

---

## 2. Office App Global Behavior

### Default landing screen
When an office user logs in, BellField should land on the **Dashboard** by default.

### Global search behavior
BellField should not force a search bar onto every screen.

Search may appear where appropriate, but it should not always be pinned across the entire office app.

### Searchable items
When search is available, it should support searching by:
- customer
- location
- job number
- invoice number
- equipment serial number
- contact name
- contact phone number

Important rule:
- global search should **not** rely on equipment model as a primary default search target

---

## 3. Dashboard Screen

### Purpose
The dashboard should be primarily a **summary page**, not the main place for deep editing.

It should help users quickly understand what matters today and jump into work.

### Key dashboard content
The dashboard should prioritize these items:
- today’s appointments
- unassigned jobs
- open estimates
- unpaid invoices
- alerts/warnings

### General dashboard style
The dashboard should feel clean and high-level, with:
- summary cards
- trend/overview cards
- quick actions where useful
- a modern, welcoming visual style

The dashboard may include encouraging or high-level informational content, but it should remain practical first.
It should not turn into a giant control panel that tries to surface every possible metric at once.

---

## 4. Customer / Account Screen

### Purpose
The customer/account screen is the main home for the customer relationship.

It should allow staff to understand:
- who the customer is
- what locations belong to them
- who their contacts are
- what financial and service history exists under that account

### Default tab behavior
A customer/account page should open to **Overview** by default.

### Core account tabs
The account screen should include these tabs:
- Overview
- Locations
- Contacts
- Jobs
- Estimates
- Invoices
- Inventory
- Accounting
- History

### Account overview expectations
The overview should make it easy to see:
- account name/type
- current flags such as Do Not Service
- primary billing info
- quick counts or summaries of locations, open jobs, estimates, and invoices

---

## 5. Location Screen

### Purpose
The location screen is one of the most important screens in BellField.

It should act as the operational home for the physical service address.

### Default tab behavior
The location page should default to:
- Overview
- with service history and equipment easy to reach through the tab structure

The layout should make the most important location information immediately visible while still keeping detailed sections organized in tabs or grouped navigation.

### Core location tabs
The location screen should include:
- Overview
- Contacts
- Equipment
- Jobs
- Estimates
- Invoices
- History / Activity

### Location overview expectations
Without clicking around too much, the location overview should show:
- current owner/customer
- address
- main contact information
- open jobs
- last service date
- quick equipment count
- quick access to service history
- useful filter-related information where appropriate

The goal is that staff can understand the location quickly without digging through multiple screens.

---

## 6. Equipment Tab Behavior

### Default equipment view
The equipment tab should default to a **table/list view with click-to-open detail drawer**.

This is the preferred office behavior because it keeps the equipment list dense and practical.

### Detail open behavior
When staff click a piece of equipment:
- BellField should open a **side drawer** by default

That side drawer should allow users to review and edit equipment details without losing their place in the equipment list.

### Alternative views
BellField should allow the company or user to change equipment presentation later if they prefer a different style, such as:
- a more traditional scrolling list
- alternate view preferences

### Inactive equipment behavior
Inactive or removed equipment should be hidden by default.

BellField should provide a clear toggle such as:
- “Show inactive equipment”

This keeps the active list clean while still making older equipment accessible when needed.

---

## 7. Job Screen

### Purpose
The job screen is the main operational record for active and historical work.

It should gather everything important about the job into one organized screen.

### Job header expectations
At the top of the job page, without much scrolling, BellField should show:
- job number
- job status
- location
- bill-to customer
- job type/category/business unit
- assigned technician(s)
- appointment date/time where relevant
- work order number field
- quick actions

### Core job tabs
The job screen should include:
- Overview
- Appointments
- Notes / Activity
- Estimates
- Invoice
- Attachments
- Equipment
- Purchasing / Materials later as needed

### Job timeline behavior
The job should use **one mixed timeline** by default.

That timeline should combine items such as:
- notes
- status history
- technician activity
- invoice-related activity
- appointment changes

The timeline should support filters so users can narrow it down when needed.

### Invoice-note behavior in history
Changes to invoice summary-type information should still appear in the main job history in readable form.

Example style:
- “John Smith edited the invoice notes.”

---

## 8. Dispatch Board

### Purpose
The dispatch board should be one of the main operating screens for office users.

It should feel like a true scheduling workspace, not just a static calendar.
It should feel operationally serious, but its quick actions should still be learnable by a smaller office without heavy training.

### Default interaction behavior
When a user clicks an appointment card on the dispatch board:
- a **right-side detail drawer** should open by default

That drawer should also include a clear option to open the appointment/job in a full-page view.

This supports both quick edits and deeper review.

### Drawer edit behavior
The right-side drawer should allow quick edits to things such as:
- job summary/caller complaint
- appointment date/time
- technician assignment
- scheduling-related details

This drawer should be convenient for fast dispatch work.

### Dispatch view controls
The dispatch board should support:
- day view
- week view

### Technician row behavior
For the current day:
- technicians with no appointments should still show on the dispatch board until the day ends

For past dates:
- technicians who had no scheduled work that day should not appear on the board for that date

### Unassigned behavior
Appointments with no technician assigned:
- should live in the unassigned area by default
- should not show on the main technician timeline unless the dispatch board is configured to show an unassigned column

---

## 9. Estimate Screens

### Creation behavior
Estimates should usually be created **from inside the job workflow**.

However:
- estimate building itself should use its own dedicated estimate-builder screen

This gives users proper room to work without making the job page overly cluttered.

### Estimate visibility
Estimates should still be visible from:
- the job screen
- the location screen

---

## 10. Invoice Screens

### Office workflow behavior
Invoices should be workable in two ways:
- from inside the job screen for context
- from a dedicated invoice screen/workbench for serious editing, review, and posting

This dual approach gives staff both context and workspace.

### Invoice history behavior
Invoice-related changes should still appear in the main job history with filters available.

The invoice screen itself does not need to become the main place for all activity history, because the job already acts as the shared operational timeline.

---

## 11. Field App Home Screen

### Default opening screen
When a technician opens the field app, BellField should land on the technician’s own **home screen/dashboard**.

This should not just be a raw job list.

### Technician home/dashboard content
The technician home screen may include:
- today’s appointments
- quick status of assigned work
- useful stats
- positive gamified feedback where helpful

Example ideas:
- “No callbacks this month — great job!”
- average completion time
- similar morale/engagement metrics

The goal is to make the field app feel useful and encouraging rather than lifeless.
It should feel lighter and more approachable than a full office console squeezed onto a phone.

---

## 12. Field Job Screen

### Field layout style
The field job experience should avoid one giant doom-scroll page.

Instead, BellField should favor:
- tiles
- tabs
- simple section navigation

This keeps the experience easier for older technicians and reduces the feeling of endless scrolling.
Common field actions should stay available within a few taps without forcing technicians through too many nested screens.

### Core field job sections
The field job screen should include sections such as:
- Job Info
- Contact / Address
- Equipment
- Notes
- Register
- Photos / Files
- Estimate
- Invoice Preview

### Finish flow
When a technician taps **Finish**, BellField should guide them through a short finish flow.

That flow should include:
- notes prompt
- register prompt
- media reminder where appropriate
- final confirmation

This should feel short and practical, not like a long wizard.

---

## 13. Locked Actions and Permission Display

If a user can see a feature but does not have permission to edit it:
- BellField should usually show the action as visible but locked/greyed out

This helps users understand what exists in the system without always removing context.

In other cases, if visibility would create confusion or is not useful to the user’s job, a feature may be hidden instead.

---

## 14. Modals vs Drawers vs Full Pages

BellField should avoid heavy modal usage where possible.

Preferred interaction order:
1. inline sections and tables
2. side drawers
3. full-page versions when the content becomes too complex

The system should not rely on excessive pop-up windows for normal work.

---

## 15. Full-Page vs Compact Behavior

BellField should favor fewer screens with smarter tabs and drawers.

However:
- most important screens should still have full-page versions available when the drawer or compact view becomes too cramped or inconvenient

This lets the app stay efficient without trapping users in tiny views.

---

## 16. Future UI Flexibility

BellField should be designed so future versions may allow users or companies to customize parts of the UI, such as:
- drag-and-drop organization
- tab order
- preferred view style
- preferred panel behavior

This does not need to be fully built in version 1, but the screen design should not fight against that possibility.

---

## 17. Visual Vibe Guidance

BellField should aim for a visual vibe that feels:
- polished
- modern
- bright but professional
- clean without being sterile
- easy to scan

Summary cards, overview sections, and clean spacing are encouraged.

The product should feel like modern business software with a friendly, organized surface — not a cluttered spreadsheet and not a childish app.

---

## 18. Summary

BellField screen behavior should follow these defaults:
- dashboard first for office users
- dashboard/home first for technicians
- no always-present search bar on every screen
- global search where appropriate for key records
- account and location pages driven by smart tabs
- equipment list in a table with side drawer by default
- jobs as the main operational record with a mixed filtered timeline
- dispatch board centered on a timeline with right-side detail drawer
- estimate building from jobs but on its own screen
- invoices usable from both job context and dedicated invoice screen
- field job layout based on tiles/tabs rather than endless scroll
- fewer popups, more tabs/drawers/inline sections
- locked actions usually visible but greyed out
- full-screen versions available where compact views become inconvenient

The goal is a system that stays clean, fast, and understandable while still exposing dense operational detail when needed.
BellField should feel deep where the business needs it, but never busy just to imitate a larger cloud suite.
