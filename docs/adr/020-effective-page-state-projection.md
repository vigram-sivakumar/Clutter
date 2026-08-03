# ADR-020: Effective Page State — a reconciled read projection over `Vault` and `DocumentEditing`

**Status:** Accepted (design frozen; implementation may proceed against this contract)

## Context

Dogfooding surfaced a UI-lag report: creating a new Note/Daily Note doesn't appear in the sidebar until it's persisted, and editing a page's body while its title is blank doesn't update the sidebar label until the next save. The persistence pipeline (Committed → Durable → Reconciled, per `docs/durability-model.md`) is behaving exactly as specified — the gap is that every sidebar-tree component (`FolderTree`, `Sidebar.Notes`, `DailyNotesList`) reads exclusively through `VaultQuery`/`Vault`, and `Vault` is, by design (`ARCHITECTURE_RULES.md` rule 3; `architecture-target.md:52`, "May depend on: Vault Ingest... nothing else"), Durable-stage-only. It cannot and must not know about an open `DocumentSession` or an unpersisted draft.

This ADR records the investigation's conclusions as the frozen contract for closing that gap, without weakening any existing rule in `ARCHITECTURE_RULES.md` or any subsystem contract in `architecture-specification.md`.

## Decision

### 1. Naming and responsibility, independent of any consumer

The responsibility is: **for a given page id, reconcile what is Committed (an open `DocumentSession`/draft, if one exists) with what is Durable (a `Vault` entry, if one exists) into a single effective answer to "does this page currently exist, and what should it currently be called."** This is deliberately named around the domain fact being reconciled, not around any UI act ("presented") and not around `durability-model.md`'s Stage 3 term "Reconciled" (already claimed by `Sync`'s external-filesystem reconciliation — a different problem). Working name: **Effective Page State**.

Every current and planned consumer (Sidebar, Favorites, Recent Notes, Tabs, Quick Switcher, Search's candidate/label half) depends on at least one of this responsibility's two facets — existence, or label — confirmed consumer-by-consumer during investigation. None needs anything beyond them; full-text search over unsaved body content is explicitly excluded (see Non-Goals).

### 2. Layer placement

**Application Layer**, alongside `PageOperations`/`NavigationRouter` — not beside `VaultQuery` in the Vault Domain Model layer, and not a broadened export of `DocumentEditing`.

This is a structural conclusion, not a preference. `VaultQuery` lives in the Vault Domain Model layer, whose only permitted dependency is Vault Ingest (`architecture-target.md:52`: "May depend on: Vault Ingest... nothing else"); `DocumentEditing`/`PageOperations` live one layer above, in the Application Layer. For `VaultQuery` to internally merge in Committed-stage state, it would have to import from a layer above its own — the exact violation `architecture-target.md:213` ("Nothing below the Application Layer line ever imports from above it") and `ARCHITECTURE_RULES.md` rule 7 name. No private-collaborator indirection changes this: the layer a dependency originates from doesn't change by hiding it behind an internal class.

`DocumentEditing`'s own public surface stays as narrow as today (`architecture-specification.md:481`, "internal to `application/` — not exported outside it"). Nothing about this ADR broadens `DocumentRegistry`/`DocumentSession` exposure to UI/Features; the new object reads sessions via `PageOperations.getSession()` (already public, already read-only) and re-exposes only presentation-safe derived fields, never the session object itself.

### 3. Merge contract — four attribute categories, not per-field rules

A field's category is determined by whether `DocumentTransaction`/`DraftInfo` currently carries it — not by a hand-maintained list — so a future field inherits the correct rule automatically as `DocumentEditing`'s "richer editor" extension point (`architecture-specification.md:527`) grows, without requiring an ADR amendment.

| Category | Members today | Rule |
|---|---|---|
| **Identity** | `id`, `type` | Single source at any moment (set once at creation, shared `PageCreator` per `implementation-rules.md` rule 4). No precedence needed. |
| **Durable-structural** | `parentId`/path, `metadata.status` (archived), favorite flag, tags/tasks/links/embeds | Always `Vault`-sourced when a `Vault` entry exists; drawn from `DraftInfo`'s narrower set (`folderId`, `type`) when it doesn't. No Committed counterpart exists for these, by design. |
| **Committed-tracked label inputs** | filename/title (`DraftInfo.title`, pre-promotion only — no live path exists for a persisted page since `rename()` is unimplemented, `architecture-specification.md:340`), body markdown (`DocumentSession`, both pre- and post-promotion, via `commitEdit`) | Live value wins over `Vault`'s when a session/draft holds a newer copy. `getPageDisplayLabel`'s existing precedence chain (`getPageDisplayLabel.ts:31`) is re-run against these reconciled per-field inputs, not against the raw `Vault.Page` object. |
| **No-Committed-stage metadata** | `description`, every `EditablePageMetadata` field | **Excluded from "live" by construction.** `updateMetadata()` writes straight to the Gate for both persisted pages (`PageOperations.ts:638-642`) and drafts (`PageOperations.ts:667`) — no session step exists. This object provides no earlier-than-Durable value for these fields today. See Non-Goals. |

Identity/dedup rule: the projection is **keyed by page id as a map**, never built by concatenating a `Vault` list and a drafts list. This is what makes the promotion window (`persistDraft()`: `Vault.addPage` fires, then `this.drafts.delete(id)` at `PageOperations.ts:784`) resolve to exactly one entry rather than a transient duplicate — a property of the data structure, not a dedup step bolted on after.

### 4. Invalidation

Three existing signals, no new observable required for any current or planned consumer:

| Signal | Covers |
|---|---|
| `Vault.subscribe` | Every Durable-stage transition: promotion completing, save, archive, restore, delete, move, folder create/move, and Sync-driven external changes (Sync mutates `Vault` through the same methods the Gate uses, so no special-casing is needed). |
| `Workspace.subscribe` | Draft opened (`openDraft`/`openAtPath` call `workspace.openPage`), draft closed without saving (`close()` calls `workspace.closePage`, then `drafts.delete`), non-promoting draft title edits (`updateDraftTitle`'s `workspace.refresh()`, `PageOperations.ts:318`). |
| Per-open-id `DocumentSession.subscribe` | Live body-content commits (`commitEdit`) while a session is open, for the Committed-tracked body-fallback label. |

**Named caveat, not a silent coupling:** `Workspace.subscribe` is used here only because it is *currently the sole observable proxy* for `DocumentSession` existence — `DocumentRegistry` has no `subscribe`/`notify` of its own (`architecture-specification.md:481-494`). Every existing call site happens to pair `documentRegistry.open`/`close` with `workspace.openPage`/`closePage` (`PageOperations.ts:172-173, 202-203, 255-256, 330-331, 846/854`), but nothing in `DocumentEditing`'s or `Workspace`'s spec states this pairing as an invariant — it is a call-site convention inside `PageOperations`, not a contract. **The conceptual dependency is on `DocumentSession` existence; the implementation dependency on `Workspace` is an accepted, temporary proxy.** A future capability that opens a session without opening a workspace tab would silently escape this projection's subscription tracking. The correct long-term fix — `DocumentRegistry` gaining its own `subscribe`/`notify`, symmetric with `Vault.subscribe` — is named here as a future extension point, not designed or scheduled by this ADR (it would itself require amending `DocumentEditing`'s frozen public API, per `implementation-rules.md` §5).

### 5. Lifecycle

- **Construction:** Composition Root only (`ARCHITECTURE_RULES.md` rule 10), inside `Application.attachVault()`, after `query`, `workspace`, and `pageOperations` all exist (`Application.ts:142,145,199`) — same ordering discipline already used for `NavigationRouter` (`Application.ts:210`).
- **Disposal:** a `.dispose()` method, called once from `Application.close()`'s existing teardown sequence (`Application.ts:285-305`), following the precedent of `this.vaultSyncService.dispose()` (`Application.ts:294`). Must run **before** `this.documentRegistry.clear()` (`Application.ts:304`) — the same ordering constraint `flushAll()` already documents for itself (`PageOperations.ts:479-484`): once sessions are disposed/cleared, further interaction with them is inert.
- **Dynamic `DocumentSession` subscription management:** owned by the projection itself, reactively, off `Workspace.subscribe` (per the named caveat above) — diffing the current open-id set against its own tracked subscriptions on each notification, subscribing newly-open ids via `PageOperations.getSession()`, unsubscribing newly-closed ones.

### 6. Ownership verification

No new ownership conflict is introduced:
- `Workspace` still solely decides which ids are open; the projection only observes that fact via `subscribe()`, the same read-only relationship `AppLayout`'s existing `useWorkspace`/`useVault` hooks already have (`AppLayout.tsx:14`). `Workspace`'s frozen six-method API and "Internal collaborators: None" (`architecture-specification.md:557`) are unchanged — it gains no new method and no new dependency.
- `PageOperations` still solely creates/destroys `DocumentSession`s and owns `drafts`/promotion policy. The projection never calls `documentRegistry.open`/`close`, and never calls `session.commit()`/`beginSave()`/`markSaved()`/`markSaveFailed()` — only the already-public `getSession()`/`getDraft()` and `session.subscribe()`/read-only revision access. "Who may bring a session into existence" and "who's currently listening to one that already exists" are distinct capabilities; `ARCHITECTURE_RULES.md` rule 2 is not implicated.

### 7. Invariant: owns subscriptions, never becomes a source of truth

Every value the projection produces must be derivable, at any instant, purely as a function of `Vault`, `PageOperations.getDraft()`, and any currently-open `DocumentSession`'s current revision. Any internal caching (e.g., memoizing a folder's list between renders) is a cache of a value reconstructible from those three sources, never an independent store — if it could ever diverge from what those sources currently say, that is a bug in the cache, not a legitimate fourth answer. This mirrors `Vault`'s own zero-independent-state discipline (`architecture-specification.md:207`) and `VaultQuery`'s existing statelessness (`VaultQuery.ts:33`), applied to the one object in the architecture that reads from three sources instead of one — exactly the position most at risk of quietly becoming a second, competing source of truth, which `ARCHITECTURE_RULES.md` rules 1 and 3 exist to prevent.

## Alternatives Considered

**A — Extend `VaultQuery` in place** (UI keeps depending on exactly one query object; `VaultQuery` internally composes durable + committed state via a private collaborator). Rejected: not a judgment call but a layering violation — `VaultQuery`'s layer is permitted to depend on nothing but Vault Ingest (`architecture-target.md:52`), and `DocumentEditing`/`PageOperations` sit above it. Hiding the forbidden import behind a private collaborator doesn't change which layer it originates from.

**B — Broaden `DocumentRegistry`/`DocumentSession` exposure to UI/Features directly.** Rejected: `DocumentSession`'s API carries editing-lifecycle methods (`commit`, `beginSave`, `markSaved`, `markSaveFailed`) with real invariants (`SaveCoordinator`'s stale-completion guard); exposing it to five unrelated presentation surfaces couples them to `DocumentEditing`'s internal shape and creates a live foot-gun (a Search component could theoretically call `session.commit()`). `DocumentEditing`'s "internal to `application/`" marking stays intact.

**C — Host the merge on `PageOperations` or `NavigationRouter` directly**, avoiding a new file per `implementation-rules.md` rule 14. Rejected: both are shape mismatches against a frozen contract, not neutral defaults. `PageOperations`'s public API is exclusively single-id lifecycle operations; `NavigationRouter`'s is exclusively void-returning navigation intents whose own worked example (`architecture-specification.md:471`) shows it deliberately *not* returning data. Bolting a list/tree-shaped read method onto either changes an existing frozen contract's shape (`ARCHITECTURE_RULES.md` rule 7) — the same category of cost as a new object, just disguised as reuse. A new, narrow object is the more honest version of the same amount of change, justified under rule 6 by a real, named gap: no existing Application-Layer facade has a list/tree-shaped read contract.

## Non-Goals (explicit exclusions, not silent gaps)

- **Does not fix the `description`/metadata-lag symptom.** `updateMetadata()` has no Committed stage today (see Category 4). Giving metadata a live stage is a distinct, separately-scoped future decision — it would change `DocumentEditing`'s/`PageOperations`'s frozen contracts and needs its own ADR. This ADR must not be read as closing that reported symptom.
- **Does not decide sibling ordering** for a draft-only entry relative to its persisted siblings (interleaved by title vs. pinned-newest-first). A real product decision, deferred to implementation-time product input, not assumed.
- **Does not include full-text search** over unsaved body content — the projection supplies candidate identity/label only; ranking/matching logic for Quick Switcher/Search is a separate, later layer.
- **Does not give `DocumentRegistry` its own subscribe/notify** — named as a future extension point (§4) but not designed or scheduled here.
- **Does not implement `rename()`** for persisted pages — title remains Committed-tracked only pre-promotion, per existing spec (`architecture-specification.md:340`).

## Consequences

- Sidebar, and every future consumer built the same way, stop needing to merge multiple sources themselves — a single owning read surface exists for "what should currently be shown," symmetric with `PageOperations` already being the single owning write surface for "what should happen to a page."
- `Vault`, `VaultQuery`, `DocumentEditing`, and `Workspace`'s public contracts are all unchanged by this ADR — the new object is additive, constructed and disposed at the Composition Root like every other Application-Layer subsystem.
- The `Workspace`-as-proxy caveat is a known, accepted, documented gap, not a defect — but it does mean a future feature that opens a `DocumentSession` outside the `PageOperations` call sites audited here would silently bypass this projection until `DocumentRegistry` gains its own observable.

## Why This Approach Is Preferred

It is the only option of the three considered that adds a genuinely new capability (a list/tree-shaped, two-source read) without either violating the frozen dependency diagram (Option A) or widening an existing subsystem's exported surface past its documented boundary (Option B, Option C). It generalizes correctly to future fields and future consumers via the attribute-category rule and the id-keyed merge structure, rather than requiring a fifth reported symptom to trigger a fifth special case.

## Amendment (pre-implementation): ordering strategy and derivation model

Raised during implementation-roadmap review, before any code was written — both clarify §3/§7 rather than change them.

**Ordering is a named, swappable strategy, not an inline rule.** §3's merge contract intentionally left sibling ordering for a draft-only entry as an open product decision (see Non-Goals). The implementation must not bake a specific placement rule into the merge logic itself — it takes an injectable ordering strategy, following the exact precedent `VaultQuery`'s own `FolderSortMode`/`FOLDER_SORT_COMPARATORS` already established (`VaultQuery.ts:18-27`, itself commented as "named and swappable rather than inlined... a future mode is an additive entry here... not a rewrite"). The shipped default strategy — **preserve today's durable ordering exactly, append draft-only entries after it** — is chosen because it is the only option that changes nothing about existing (`Vault`-only) output and therefore cannot itself constitute the deferred product decision; it is provisional and superseding it later is an additive strategy swap, not a rewrite of the projection.

**Derivation model: on-demand, not an eagerly-maintained map.** §7's invariant ("owns subscriptions, never becomes a source of truth... every projected value must remain derivable") is satisfied more directly by computing each read fresh from `Vault`, `PageOperations.getDraft()`/`getSession()`, and `Workspace`, on every call, than by maintaining an incrementally-updated `id → entry` cache that each of §4's invalidation events would need its own bespoke update logic to keep correct. No incremental-update logic means no diff-application bugs and no risk of a stale entry surviving an event its handler didn't anticipate — the failure mode an eagerly-maintained cache would uniquely introduce. Given today's file counts, this mirrors `VaultQuery`'s own fully stateless read-per-call shape (`VaultQuery.ts:33`) rather than `Vault`'s separate, justified choice to eagerly rebuild its `tags()`/`tasks()` projections on mutation (`architecture-specification.md:207`, "a correctness-over-performance choice that stays, given current file counts") — that choice was made for projections read by many callers on every render; this projection's per-call cost (filtering a folder's children, resolving a handful of fields per id) doesn't yet meet that bar. If a demonstrated performance need appears later, adding a cache is a swappable internal implementation detail behind the same public shape, not a contract change.

This does not mean zero internal state: §5 already requires tracking which ids are currently subscribed to (for `DocumentSession` subscribe/unsubscribe management as `Workspace`'s open-id set changes). That identity-level bookkeeping — a set of ids, not a set of computed values — is subscription plumbing, not a projected value, and was already anticipated by §5; it is not a second, smaller cache introduced to work around this amendment. No other state is retained. Enumerating "which ids might currently have a draft/session" has no other source in today's API (`PageOperations` exposes only per-id `getDraft`/`getSession`, and `Workspace` exposes only per-id `isPageOpen`, `architecture-specification.md:330-338,543-554`) — so this bookkeeping set, mirrored directly from `Workspace.openPage`/`closePage` calls as they're observed, is the only place that information can come from, not a convenience the implementation chose to add.
