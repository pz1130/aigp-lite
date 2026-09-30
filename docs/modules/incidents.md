# Incidents Module

## Automation (v0.20.0)

### Auto-opening incidents from policy hits

Configured per-org at `/settings/incident-automation`. Defaults:

- `block` enforcement-mode hits → always open an incident (`blockAlwaysOpens=true`).
- Non-block hits → open if ≥ 5 hits in a 10-minute window (`hitBurstThreshold=5`, `hitBurstWindowMin=10`).
- Same policy + same usecase + last 24 h → attach to the existing open incident instead of opening a new one (audit event `incident.evaluation_attached`).

Mapping of `policy.scope` × `policy.severity` × trigger → `IncidentCategory` + `IncidentSeverity` is implemented in `src/lib/incidents/classify.ts`.

### Semantic dedup

When an incident is created (manually or auto-opened), the system embeds `title + rootCause + category` with `text-embedding-3-small` and compares against open incidents in the same org from the last 30 days. Matches above 0.85 similarity surface as non-blocking suggestion banners on the new incident's detail page. The user can merge one-click or dismiss.

Requires a `ProviderConnection` with `config.supportsEmbeddings = true`. Without one, dedup is a no-op and `incident.dedup.skipped{reason='no_provider'}` is incremented.

### Merge semantics

Soft merge: source incident gets `mergedIntoId`, `status='closed'`, `closedAt=now`, becomes read-only, and is hidden from the default list view (toggle "Show merged" to see). RCA drafts on the source are reassigned to the target. Audit event: `incident.merged`.
