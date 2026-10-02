# ADR-037: One Global Draft — `PageOperations` holds at most one unsaved draft

**Status:** Accepted (product decision, Vigram, 2026-10-03)

## Context

[ADR-017](./017-draft-page-lifecycle.md) made drafts in-memory-only and allowed several at once, with reuse rules layered on top: `findReusableDraftId` repurposed an empty Note draft, `draftIdByDeterministicPath` gave each Daily Note date its own draft, and `shouldRetainDraft` had to be consulted by every automatic transition to protect today's draft. Each rule existed to bound accumulation or protect an individual draft's identity, and each needed its own tests and guards.

## Decision

Clutter has **at most one unsaved draft, globally**, for Notes and Daily Notes alike — not one per folder, date, type or window.

1. `PageOperations` stores a single slot (`draft: { id, descriptor }`) instead of a map; `draftIdByDeterministicPath` and `findReusableDraftId` are removed.
2. Every entry point (`openDraft`, i.e. New Note and a folder's "+", and `openAtPath`, i.e. Daily Note dates) goes through one private method, `acquireDraft`:
   - no draft → mint one;
   - draft exists and is **empty** → retarget it in place (same id and session; descriptor replaced with the request's folder / date / type);
   - draft exists and **has content** → never repurposed: it is persisted first through the ordinary `save()` path (→ `persistDraft` → Gate), which frees the slot, then the requested destination opens as the new single draft. Only if that persist fails is the old draft reopened, since replacing it would destroy unsaved content.
3. If the requested Daily Note already exists in the Vault, `openAtPath` opens the real page and involves no draft.
4. Promotion is unchanged: `persistDraft` is still the only path from draft to Vault page, triggered by a committed body, title or metadata change, and it frees the slot. A persisted draft is then a normal Page, and a new draft may be created.
5. `persistDraft` now receives its descriptor explicitly, so eager `create()` never occupies or displaces the slot.

Unchanged, deliberately: all UI — New Note, folder "+", Daily Note and other creation controls stay enabled and behave as before (no disabling, no draft indicators); drafts stay outside `Vault`; no new subsystem or store; the abandonment/retention rules in `discardAbandonedDraft` (SaveError, history references, today's Daily Note retention); no new Gate operation kind.

## Consequences

- Supersedes ADR-017's per-draft reuse behavior and the "each date keeps its own draft" policy. Back/Forward history therefore holds the one draft id; retargeting it changes what that entry shows.
- Existing tests that asserted multiple concurrent drafts were rewritten to assert the single-draft invariant (`PageOperations.reusableDrafts.test.ts` is now its home).
- Navigation never blocks on the draft: an empty draft is retargeted, a contentful one is persisted and replaced.
