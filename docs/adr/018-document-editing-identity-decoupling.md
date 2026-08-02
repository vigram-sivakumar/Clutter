# ADR-018: Decouple `DocumentEditing` from `Page` — Identity-Free Editing Sessions

**Status:** Accepted (design frozen; implementation may proceed against this contract, per [ADR-017](./017-draft-page-lifecycle.md)'s dependency on it)

## Context

`DocumentEditing` (spec §9) is documented as owning "the live edit buffer, revision tracking, and save-lifecycle state" — nothing about domain identity. In practice, the shipped code couples it to `Page` at its edges:

- [`DocumentRegistry.open(page: Page): DocumentSession`](apps/app/src/core/engine/DocumentRegistry.ts) — takes a full domain `Page`, not the `(pageId: string, initialContent: string)` spec §9 itself already specifies. The shipped signature is itself a pre-existing, unnoticed divergence from the frozen spec text.
- [`DocumentSession`](apps/app/src/core/engine/DocumentSession.ts)'s constructor stores `this._page = page` and reads `page.source.markdown`; `.page` is exposed as a getter.
- [`SaveCoordinator`](apps/app/src/core/engine/SaveCoordinator.ts) keys its `activeSaves` map by `session.page.id` in five places.

This surfaced as Finding 1 of ADR-017's implementation-readiness review: `PageOperations.openDraft()` cannot open a `DocumentSession` for a not-yet-persisted page, because no code path today creates a session without a real `Page`. But the fix is not specific to drafts. Every other value object `DocumentEditing` already owns — `DocumentTransaction`, `DocumentRevision` — is already a pure function of markdown strings, with no `Page` reference at all. `Page`'s own doc-comment is explicit that it is a Vault-domain concept ("durable runtime identity... part of the Vault's knowledge model... does not represent an open document or an editing session") — editing and domain identity are already declared, in this codebase's own words, to be different concerns. The coupling is a narrow, removable accident at three call sites, not a structural property of the engine.

This ADR evaluates and decides the shape of `DocumentEditing`'s core abstraction on its own architectural merit — ownership, lifecycle, type safety, and fit for templates, AI, plugins, and collaboration over the long term — independent of the draft lifecycle that surfaced it.

## Evaluation Summary

Three designs were compared:

**A — Synthetic `Page` for anything without a real one.** Fabricate a placeholder `Page` (generated id, empty `metadata`/`analysis`, no real `path`) and pass it through unchanged. Rejected: makes `Page`'s own documented contract ("part of the Vault's knowledge model") false for some instances with no type-level signal; requires inventing an undocumented lifecycle event to swap the placeholder for the real `Page` after persistence, discontinuous in exactly the way collaborative editing and AI-proposal features would be most sensitive to; deepens rather than repairs the existing spec divergence.

**B — Decouple entirely.** `DocumentSession` and `DocumentRegistry` own only an opaque `id: string` and markdown content — no reference to `Page` or any domain type. Anything needing domain metadata (title, path, type, persisted-or-not) resolves it separately, from `Vault` if the id resolves there, from a lightweight non-persisted descriptor if not.

**C — A `Page | Draft` union.** A new, thinner `Draft` type; `DocumentSession` holds a discriminated union of the two. Rejected: safer than A (no lying about type) but still pulls domain knowledge into an engine layer spec §9 says shouldn't need it, doesn't stop growing (AI proposals are less-formed than a `Draft`, templates fit awkwardly), and keeps A's identity-discontinuity problem in softened form.

Full comparison across ownership, lifecycle, type safety, and fit for templates/AI/plugins/collaboration/testing is in the table below.

| | A — synthetic `Page` | B — opaque `id` (adopted) | C — `Page \| Draft` union |
|---|---|---|---|
| Ownership | blurred; new mutation surface needed | clean; matches spec §9 exactly | domain knowledge leaks into engine |
| Lifecycle | new, undocumented identity-swap transition | unchanged from today's spec | same swap problem, type-checked |
| Type safety | weakest — `Page`'s contract silently false | strongest — never false | medium — discriminant-dependent |
| Templates | fabricate a fake Page | free — just different seed markdown | awkward — new field or variant |
| AI proposals | needs deeper fakery than a draft | free — just another transaction | needs a third union variant |
| Plugins | foot-gun — a `Page` that might be fake | honest buffer + optional real identity | safer than A, still branchy |
| Collaboration | identity swap breaks convergence mid-session | stable id for the whole session | same swap risk, softened |
| Testing | test doubles must fabricate full `Page` shape | test doubles need only an id + string | test doubles need a discriminant too |
| Spec conformance | deepens existing divergence from §9 | corrects the existing divergence | new type not in current spec at all |

## Decision

Adopt **Design B**.

1. `DocumentSession`'s constructor becomes `(id: string, initialMarkdown: string)`. It no longer imports `Page` from `vault/models` at all. `.page` is removed; a plain `.id` getter replaces it.
2. `DocumentRegistry.open(id: string, initialContent: string): DocumentSession` — matches spec §9's already-stated signature exactly; this is a correction toward the frozen spec, not a new decision requiring a spec amendment for this method.
3. `SaveCoordinator`'s five `session.page.id` lookups become `session.id` — mechanical, no behavioral change for already-persisted pages.
4. Callers that need domain metadata alongside a session (title, path, type, whether the id is backed by a real `Vault` page) resolve it independently at the call site — `vault.getPage(id)` when it exists, or a small, separately-owned descriptor when it doesn't (defined and owned by whichever facade needs it — `PageOperations` for drafts, per ADR-017 — not by `DocumentEditing`). `toResourcePageModel` already takes `page: Page` and `session: DocumentSession` as independent parameters and never reads `session.page` — no change needed there.
5. `architecture-specification.md` §9 is corrected to match this shipped, now-conformant signature (removing the pre-existing, undocumented divergence), once accepted.

## Relationship to ADR-017

[ADR-017](./017-draft-page-lifecycle.md) (Draft Page Lifecycle) depends on this decision — `PageOperations.openDraft()` requires a `DocumentSession` that can exist without a backing `Vault` page, which this ADR is what makes possible. This ADR does not depend on ADR-017: it corrects an existing, pre-existing divergence between `DocumentEditing`'s shipped code and its own frozen spec text, and stands independently as the shape `DocumentEditing`'s core abstraction should have regardless of whether drafts ever ship, because it is also what templates, AI-proposed edits, plugin-exposed documents, collaborative editing, and test doubles will each build on. ADR-017 should reference this ADR for its `DocumentEditing` interaction (Section 3/6) rather than restate it.

## Alternatives Considered

See the Evaluation Summary above (Designs A and C) for the full comparison; summarized rationale:

- **A (synthetic `Page`)** — rejected for type dishonesty against `Page`'s own documented contract, an invented lifecycle event with no precedent in `DocumentState`'s state machine, and the worst fit of the three for AI/collaboration, which are the features most sensitive to a stable identity for the life of a session.
- **C (`Page | Draft` union)** — rejected because it still gives `DocumentEditing` a second domain concept to reason about that spec §9 already says belongs one layer up, and the union doesn't stop growing as more not-yet-real editing targets (AI proposals, templates) arrive.

## Consequences

- `core/engine/` (`DocumentSession`, `DocumentRegistry`, `SaveCoordinator`) has zero imports from `vault/models` after this change — a clean, mechanically-verifiable layering property, not just an intended one.
- `PageOperations` (and any future facade with the same need) becomes responsible for pairing a session with domain metadata when both exist — a small, explicit responsibility it already partially has (it already reads `Vault` for its own purposes; this adds one more read, not a new capability).
- Test doubles for `DocumentSession`/`DocumentRegistry` no longer need to construct a full `Page` shape — a real, if secondary, testing-ergonomics improvement across the whole editing-engine test suite.
- Templates, AI-proposed edits, a future plugin-exposed "current document," and future collaborative editing all compose with this shape without requiring any further change to `DocumentEditing` itself — each is "propose a `DocumentTransaction` against an id," which this design already does without qualification.
- `architecture-specification.md` §9 changes from divergent-but-undocumented to conformant — a strict improvement in spec accuracy with no behavior change for any already-persisted-page code path.

## Why This Approach Is Preferred

It answers the same standing question every prior ADR in this series has used to judge itself: does this keep exactly one thing owning exactly one concern? Yes — `DocumentEditing` goes from "owns a buffer, but also secretly requires a Vault-authoritative domain object to exist" to owning only what spec §9 already said it should own. It's also the option that requires the least invention: no new type, no new lifecycle event, no new union to keep exhaustive as the product grows — just the removal of a coupling that was never load-bearing in the first place, verified by the fact that `DocumentTransaction` and `DocumentRevision`, the two value objects doing the actual work of "editing," never needed `Page` to begin with.
