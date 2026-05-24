# BellField Glossary

Short definitions for terms that show up across product docs, code, and handoff notes.
Prefer these terms when adding docs or UI copy.

| Term | Meaning | Canonical docs |
| --- | --- | --- |
| Account / customer account | The company or person-level business relationship. A customer can own many locations. | `docs/product-rules.md`, `docs/data-modeling-rules.md` |
| Location | The physical service address where work happens. Locations are long-lived and can change owner/customer over time. | `docs/product-rules.md`, `docs/data-modeling-rules.md` |
| Contact | A shared person/contact record that may be linked to a customer, a location, or both. | `docs/product-rules.md`, `docs/data-modeling-rules.md` |
| Contact link | The relationship between a contact and a customer/location, including link-specific tags, active state, or end date. | `docs/data-modeling-rules.md` |
| Equipment | A physical serviceable asset. HVAC-style components stay separate records by default. | `docs/product-rules.md`, `docs/data-modeling-rules.md` |
| Install date | The equipment installation date. This is warranty-relevant and should not be replaced by model year in quick-read UI. | `docs/screen-behavior-spec.md` |
| Job | The parent operational work record. Jobs belong to one location and may have zero or more appointments. | `docs/workflows-and-state-machines.md`, `docs/data-modeling-rules.md` |
| Appointment | A scheduled visit attached to one job. Dispatch and field assignment are appointment-centered. | `docs/workflows-and-state-machines.md` |
| Dispatch board | The daily office scheduling surface with technician rows, unassigned queue, and horizontal appointment timeline. | `docs/screen-behavior-spec.md` |
| Job detail | The focused in-app job surface opened from dispatch or queues. It owns overview, appointments, captured work, media, and timeline review. | `docs/screen-behavior-spec.md` |
| Jobs queue | Compact office lists for review-needed, waiting, unscheduled, and open jobs that are not the dated dispatch timeline. | `docs/milestone-implementation-plan.md` |
| Finished visit review | Office review needed after a technician marks an appointment finished while the job remains open. | `docs/workflows-and-state-machines.md` |
| Finished review acknowledgement | Persisted office decision that clears review-needed state for a finished appointment. Current decisions are kept open or follow-up scheduled. | `docs/api-endpoints.md` |
| Register | The job-owned line-entry area for labor, service items, parts, memberships, and other sellable lines. | `docs/data-modeling-rules.md` |
| Register follow-up note | Free-text reminder captured during finish review. It is not a structured register line. | `docs/workflows-and-state-machines.md` |
| Captured work | Office-facing shorthand for register entries and media captured from field/office work on a job. | `docs/field-register-media-plan.md` |
| Media attachment | Job-owned photo, video, or document metadata plus a server-side blob. | `docs/data-modeling-rules.md`, `docs/deployment-model.md` |
| Upload intent | Metadata reservation for a media attachment before bytes are uploaded. Returns a short-lived signed upload token. | `docs/api-endpoints.md` |
| Media blob | The stored file bytes under `BELLFIELD_MEDIA_ROOT`. | `docs/deployment-model.md` |
| Void | Soft removal that preserves the row and history. Used for register and media v1 removal. | `docs/data-modeling-rules.md` |
| True delete | Permanent deletion. It requires stronger permission and confirmation and is not ordinary workflow cleanup. | `docs/permissions-model.md` |
| Assigned work | The field app's current server-provided set of jobs/appointments/equipment/register data for the signed-in technician's work window. | `docs/offline-sync.md` |
| Pending operation | A field-mobile queued local change that has not successfully synced yet. | `docs/offline-sync.md` |
| Conflict | A queued field change that cannot be safely applied because newer server-side state changed the same area. | `docs/offline-sync.md` |
| Rejected operation | A queued field change that the server declined, often because scope or assignment changed and replay could not be validated. | `docs/offline-sync.md` |
| Sync metadata | Local field app status such as last successful sync time, pending count, and last sync error. | `docs/offline-sync.md` |
| Office core permissions | Current default office role bundle for customers, locations, contacts, equipment, jobs, appointments/dispatch, register, media, and estimates with view/create/edit. | `docs/permissions-model.md` |
| Self-hosted first | BellField's default deployment model: customer-owned server, database, and file storage. | `docs/deployment-model.md` |
