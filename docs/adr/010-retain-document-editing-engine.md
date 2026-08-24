# ADR-010: Retain `DocumentEditing` (formerly `core/engine`) Unshrunk as an Internal Collaborator

**Status:** Accepted

## Context

`core/engine` (renamed `DocumentEditing` in the target architecture) — `DocumentSession`, `DocumentRegistry`, `DocumentRevision`, `DocumentTransaction`, `SaveCoordinator`, `DocumentState`, six files, ~530 LOC — implements session lifecycle, revision tracking, and stale-save-completion guarding for edited pages. The review noted this is more structure than the current `MarkdownEditor.tsx` — a `contentEditable` field that commits on blur — strictly needs; a plain `{ markdown, dirty, revision }` object would suffice for today's actual editing surface. The review also noted `packages/editor` (ADR-009) represents a more complete, differently-shaped design for a richer future editor.

The question this ADR settles: given the capability facades (ADR-002) are being introduced anyway, should `DocumentEditing` be simplified down to match today's minimal editor, with the expectation of rebuilding it when a richer editor is prioritized?

**Note (added later, non-normative):** the `contentEditable`-field description above is contemporaneous context from when this ADR was written. `MarkdownEditor.tsx` has since migrated to a CodeMirror 6 `EditorView` (see `docs/editor-architecture-decisions.md`). This does not change the decision below — `DocumentEditing` remains `PageOperations`'s internal collaborator regardless of what the editor's own rendering layer is built on.

## Decision

Keep `DocumentEditing` exactly as-is, unshrunk, folded into the application layer as `PageOperations`'s internal collaborator (not a peer application-layer service — this is the one structural change: it stops being importable from outside `application/`). No simplification, no rebuilding.

## Alternatives Considered

- **Collapse it to a minimal edit buffer now, rebuild the fuller version later when a richer editor is prioritized.** Rejected: this trades a small, one-time "this is more than we need" discomfort for a guaranteed future rebuild cost, on a subsystem that isn't actually causing any of the problems the review identified (it wasn't cited as a source of fragmentation, bypassed safety, or unclear ownership — only as "more than currently strictly necessary"). "More than strictly necessary but not causing harm" is a materially different finding than the write-path fragmentation (ADR-001) or the six-service application layer (ADR-002), and doesn't warrant the same intervention.
- **Merge `DocumentEditing`'s revision-tracking into the Persistence Gate, since both are concerned with save state.** Rejected: this would blur the boundary ADR-001 depends on — the Gate owns *how a write happens safely on disk*; `DocumentEditing` owns *in-memory edit-buffer state before a write is even requested*. Merging them would make the Gate stateful across UI-interaction timescales (keystrokes, blur events) rather than purely around the disk-write moment, complicating the one class this specification most needs to stay simple and provably correct.
- **Replace it with `packages/editor`'s more complete session/transaction model.** Rejected per ADR-009 — that design predates and was abandoned before being connected to today's application layer; adopting it now would mean reconciling a different vocabulary (`PrimitiveOp`/`applyOp`) against the facades being introduced in the same effort, which is unnecessary scope coupling between two otherwise-independent decisions.

## Consequences

- `DocumentTransaction` remains a discrete, replayable value object even though today's editor never needs to replay one — this is the specific piece of "ahead of need" structure being deliberately retained, because it's cheap to keep and is exactly the seam a future richer editor would want (per ADR-009's stated migration path).
- `DocumentEditing` is not itself subject to Compliance Checklist scrutiny as "unnecessary structure" during Phase 1–2 of the migration — reviewers should not flag its existing shape as a violation of "don't build for an imagined future," since retaining already-built structure is a different decision than building new structure would be.
- If a richer editor is eventually built and doesn't end up needing `DocumentTransaction`'s current shape after all, removing the unused generality then is a normal, low-cost simplification — this ADR doesn't freeze the shape forever, it just declines to preemptively shrink it now on a hypothesis about what a not-yet-designed future editor will need.

## Why This Approach Is Preferred

Not every finding in the assessment calls for the same kind of correction. The write-path fragmentation (ADR-001) and service sprawl (ADR-002) were active sources of risk and confusion; `DocumentEditing` being "sized for a future editor" is neither — it's inert, correct, well-tested structure that costs nothing to leave alone and would cost real rework to shrink and later rebuild. This ADR is the explicit acknowledgment that "over-engineered relative to today's narrowest need" and "actively causing an architectural problem" are different findings, and only the second one justifies intervention in this migration.
