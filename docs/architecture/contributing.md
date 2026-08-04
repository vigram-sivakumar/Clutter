# Contributing to Clutter's Architecture

This document governs how architectural work proceeds and how this directory (`docs/architecture/`) stays current as that work happens. It sits alongside, and does not replace, the repo's existing implementation governance (`docs/implementation-rules.md`, `ARCHITECTURE_RULES.md`, `docs/architecture-compliance-checklist.md`) — those documents govern *how a single implementation task proceeds*; this document governs *how architectural work gets identified, tracked, sequenced, and recorded* across the whole project.

## Rule 1 — Every architectural change requires a backlog item

No architectural change — a rule-violation fix, a spec amendment, a simplification, a new subsystem — lands without a corresponding entry in `backlog.md`. If you discover an architectural issue not already in the backlog, add it there first, following the same structure as the existing items (ID, Title, Description, Origin report, Validation status, Priority, Complexity, Architectural risk, Dependencies, Acceptance criteria, Status). A PR that fixes an architectural issue with no backlog item is treated the same way an undocumented spec divergence is treated in `implementation-rules.md` — as something that must stop and get named before it merges, not something to improvise past.

## Rule 2 — Every completed item updates the backlog

When a backlog item's work merges, its `Status` in `backlog.md` changes to `Done` in the same PR (or an immediate follow-up, never left stale). A backlog that says `Not Started` for work that already shipped is worse than no backlog at all — it actively misleads the next contributor about what's safe to build on.

## Rule 3 — Every completed item is recorded in the implementation log

Before a backlog item is marked `Done`, an entry is added to `implementation-log.md` following its template (ID, Status, Date, Files Changed, Reason, Follow-up, Related ADR, Related Report). This is the project's architectural changelog — it answers "what actually happened and why" for anyone auditing the codebase's history later, the same way `docs/adr/` answers "why was this decided" for a single decision.

## Rule 4 — Every architecture change updates the investigation if necessary

If implementation work reveals that a finding in `investigation/00-15` was wrong, incomplete, or has changed since it was written, update the relevant report — don't leave stale findings standing uncorrected once you know better. Prefer a small, dated addendum note over rewriting the original report's prose wholesale; the reports are a historical record of what was found and when, not a living document that should silently drift from what it originally said. If the correction is substantive, also note it in `16-validation-report.md`'s "Changes to Investigation" section, keeping that report's own promise (a validation report has the same staleness risk as the investigation it validates) honest over time.

## Rule 5 — ADRs are required for major architectural decisions

Any decision that changes a public contract in `docs/architecture-specification.md`, introduces a new subsystem, or amends one of the twelve rules in `ARCHITECTURE_RULES.md` requires an ADR in `docs/adr/`, following the existing ADR format (Context, Decision, Alternatives Considered, Consequences, Why the chosen approach is preferred) — per `implementation-rules.md` §4's "handling divergence" process. A backlog item that requires an ADR is not `Done` until the ADR is written and accepted; implementation and the ADR are not sequenced as "ship now, document later."

## Rule 6 — Validation precedes implementation

No backlog item proceeds to implementation on the strength of an investigation finding alone. Every item in `backlog.md` carries a **Validation status** field precisely because `investigation/16-validation-report.md` demonstrated this matters: even a well-evidenced report can understate a violation's scope, mischaracterize a fan-out count, or leave a question genuinely open. Before starting implementation on any backlog item:

1. Check the item's Validation status. If it is ✅ Confirmed, proceed.
2. If it is ⚠️ Partially Confirmed, re-read the validation report's specific correction and scope the implementation to the *corrected* claim, not the original one.
3. If it is 🤔 Needs More Investigation or the item sits in `backlog.md`'s "Deferred / Not Yet Backlogged" section, resolve the open question first — either through direct re-investigation or by explicitly re-scoping the item — before writing implementation code.
4. If enough time has passed since the last validation pass that code drift is plausible (see Rule 7), re-verify the specific finding against current source before starting, even if its status says Confirmed.

This mirrors `implementation-rules.md`'s own Pre-Implementation Checklist philosophy (name what you're relying on before you build on it) applied at the level of "is this finding itself still true," not just "is the spec still true."

## Rule 7 — Validation reports go stale; re-run them, don't treat them as permanent

A validation pass is a snapshot. As Phases 1–5 of `roadmap.md` land, re-run a scoped validation pass (Phase 0-style, per the methodology in `investigation/16-validation-report.md`) against whatever changed, rather than assuming earlier validation still holds indefinitely. This is a standing practice under Phase 6 of the roadmap, not a one-time activity.

## What This Branch (and Governance Work Generally) Does Not Do

Per the explicit scope of Phase 0 (`roadmap.md`): governance and documentation work never modifies production source code, fixes bugs, refactors implementation, or updates application architecture directly. Governance branches produce documentation, backlog items, and process; implementation branches (opened only after a governance branch merges, one per backlog item or tightly-related group) do the actual code work, each tracked back to a specific `backlog.md` item.

## Opening an Implementation Branch

Once a backlog item is ready (Validation status resolved per Rule 6, dependencies satisfied per its `backlog.md` entry), open a branch named for the work, not the ticket number — e.g. `architecture/fix-alias-serialization`, `architecture/rule-10-migration`, `architecture/navigation-spec-alignment`, `architecture/workspace-view-state`, `architecture/sidebar-simplification`. One branch addresses one backlog item, or one tightly-related group from the same phase — never a span across phases, and never an undocumented drive-by fix bundled into an unrelated branch (this is the same discipline `implementation-rules.md`'s Rule 5 already requires at the single-task level, applied here at the branch level).
