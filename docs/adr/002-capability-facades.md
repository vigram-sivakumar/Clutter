# ADR-002: Capability Facades Replace the Fragmented Service Layer

**Status:** Accepted

## Context

The pre-migration application layer implemented "things that can happen to a page" across six files: `PageApplicationService` (open/close/edit), `PageMutationService` (archive/restore), `ResourceCreation` (create), `ResourceDeletionService` (delete), `MoveService` (physical move, used internally by the others), and roughly half of `NavigationService` (a facade whose other half consisted of methods that threw `Not implemented`). A UI author adding a new entry point for an existing capability had to already know which of these six files owned it; there was no single answer to "where does Move Page go" that didn't require reading multiple files first. The stated product goal — `pageStore.move(pageId, destinationFolderId)` as a stable, single call site for every consumer — did not exist for any capability except, partially, create (via `NavigationService.createNote` forwarding to `ResourceCreation`).

## Decision

Introduce `PageOperations` and `FolderOperations` as the complete application-layer surface for their respective aggregates. Each owns the full lifecycle of its aggregate — open, create, save-or-equivalent, archive/restore-or-equivalent, delete, move, rename — as methods on one class. `PageApplicationService`, `PageMutationService`, `ResourceCreation`, and `ResourceDeletionService` are retired; their tested logic migrates into `PageOperations` method-by-method. `MoveService` remains as an internal collaborator invoked by the Gate (see ADR-001), not by UI code directly. `NavigationService` narrows into `NavigationRouter`, retaining only intents that are genuinely cross-cutting or view-level (see ADR-005) — its capability-lifecycle-shaped methods move to the facades.

## Alternatives Considered

- **Keep the six files but formalize a shared interface across them.** Rejected: an interface implemented by six classes doesn't reduce the "which file do I open" problem — a caller still needs to know which of the six implementations to reach for. The point isn't a shared type, it's a shared *location*.
- **One `PageOperations` for both pages and folders.** Rejected: pages and folders have different capability sets (folders don't have "content" to save, don't have a draft-promotion concept) and different downstream Gate operation shapes. Merging them would produce a facade with methods that only apply to half its own surface, which reintroduces the "does this apply to me" ambiguity the facade is supposed to remove.
- **A capability-per-file model** (one file for "Move," one for "Archive," etc., each exporting a single function). Considered because it maps cleanly onto individual PRs. Rejected: this is closer to the original six-file problem than the fix for it — it optimizes for "small diffs to add a capability" at the cost of "one place to read the whole lifecycle," which the review identified as the more valuable property for onboarding and change-locality.

## Consequences

- Two files (`PageOperations.ts`, `FolderOperations.ts`) now carry meaningfully more code each than any single one of the six files they replace. This is intentional — the review's central finding was that the problem was too many files for one concept, not that individual files were too large.
- A genuinely new aggregate (Templates, Attachments, whatever comes next) gets its own facade following the identical shape, rather than being folded into `PageOperations` — this is the release valve that keeps the two current facades from becoming a dumping ground for unrelated concepts.
- Existing tests for the six retired files carry over largely unchanged (per the migration plan in `docs/architecture-target.md`), since the underlying logic doesn't change, only its file location and its write path (per ADR-001).

## Why This Approach Is Preferred

It directly targets the review's own success criterion: "if I add a new capability, I want to implement it where that capability is owned." Two facades, one per aggregate, following an identical method shape, is the smallest structure that makes that question have exactly one answer for both today's two aggregates and any future one, without over-generalizing into a framework nobody asked for.
