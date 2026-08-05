# ADR-023: Membership Selector — the missing read-side classification layer

**Status:** Accepted (design frozen; implementation may proceed against this contract)

## Context

Two rounds of architectural audit (see the conversation record preceding this ADR; findings are summarized here rather than reproduced) traced three reported bugs — a Daily Note draft appearing in the Notes sidebar instead of Daily Notes, external folder deletions never reconciling, and the Workspace sidebar/Workspace page disagreeing about what folders belong to "Workspace" — back to their mechanisms. The folder-deletion bug is a separate, already-identified gap (`Vault` has no folder-removal mutation method) and is out of scope for this ADR. The other two share one root cause, confirmed by direct inspection:

- `features/notes/sidebar/FolderTree.tsx` decides which pages appear in the Notes sidebar by checking `folderId` alone, with no check of `page.type`.
- `features/daily-notes/sidebar/DailyNotesList.tsx` decides which pages appear in the Daily Notes sidebar by walking the `Daily Notes → year → month` folder hierarchy, also with no check of `page.type`.
- `VaultQuery.getVisibleRootFolders()` (filters `RESERVED_FOLDER_NAMES`) backs the sidebar's "Workspace" section, while `VaultQuery.getRootFolders()` (unfiltered) backs the Workspace collection page — two different answers to "what is Workspace," reachable from the same UI element.

Notably, this is not merely an unresolved product ambiguity — it is a **drift from an existing, accepted ADR's stated design**. [ADR-022](./022-workspace-favorites-active-view.md) §"How they fit the existing active-view model" originally stated that the Workspace collection page builds its model from `VaultQuery.getRootFolders()`/`getRootPages()`, describing this as *"the same query methods the sidebar's `FolderTree`/`FavoriteList` already call."* That claim was false as implemented: `FolderTree` called `getVisibleRootFolders()` (filtered), not `getRootFolders()` (unfiltered). ADR-022 already recorded *parity* as the intended state — this ADR does not reopen whether the two views should match, only resolves *which* answer they converge on. **Resolved during this ADR's own implementation** (see ADR-022's Phase 2 amendment): filtered wins — Workspace excludes reserved/system folders, matching `ReservedResources.ts`'s documented intent and the sidebar's pre-existing, unchanged behavior. The Membership Selector's `getWorkspaceFolders()` is the one place that answer now lives, consumed by both the sidebar and the Workspace page, so the same drift cannot recur silently a second time.

Each of these is a *different file independently answering the same business question* — "which feature does this page/folder belong to" — with no shared implementation and no shared owner. This is not a defect in `EffectivePageState` or `VaultQuery`: both were independently confirmed to be correctly layered, with no competing tree-builders or read paths at that level (per the same audit). The gap sits **above** them: `EffectivePageState` (ADR-020) reconciles Committed and Durable state into an answer for "does this page exist, what should it be called" — a question about a *single page's* identity and content. `VaultQuery` answers structural questions about `Vault`'s durable data. Neither was ever assigned — by `ARCHITECTURE_RULES.md`, `architecture-specification.md`, or any prior ADR — the responsibility of deciding *which product feature a page or folder belongs to*. `architecture-target.md`'s own Ownership Diagram, which enumerates every subsystem's sole-owned responsibility, has no row for this question. Rule 13 governs *how* a page-list reads its content; it does not govern *which pages a page-list should include*.

In the absence of an assigned owner, that decision was made inline, independently, in every consuming component — exactly the fragmentation pattern `ARCHITECTURE_RULES.md` rules 1 and 13 exist to prevent for writes and for content-reads, respectively, now recurring one layer over for *membership* reads.

This ADR names that responsibility, assigns it a single owner, and freezes its contract, following the same structural reasoning ADR-020 used for the Committed/Durable reconciliation gap.

## Decision

### 1. Naming and responsibility, independent of any consumer

The responsibility is: **for a given page or folder, and a given named product concept (Workspace, Notes, Daily Notes, Archive, a system/reserved folder), answer whether that page or folder is a member of that concept — deterministically, from the page's or folder's own identity, never from a consumer's ad hoc inspection of `folderId`, path, or folder hierarchy.** Working name: **Membership Selector**.

This is a *classification* responsibility, distinct from and complementary to `EffectivePageState`'s *reconciliation* responsibility. `EffectivePageState` answers "what is this page, right now" for one page at a time. The Membership Selector answers "does this page/folder count as belonging to X" for a named X, given what `EffectivePageState`/`VaultQuery` already say the page/folder is. It does not compete with either — it consumes their output as its only input.

### 2. Layer placement

**Application Layer**, alongside `PageOperations`/`NavigationRouter`/`EffectivePageState` — the same placement ADR-020 established for `EffectivePageState`, and for the identical structural reason. A page's `type` for an unpersisted draft is only observable through `EffectivePageState`/`PageOperations.getDraft()` (Committed-stage data); a decision that needs that value cannot live in `VaultQuery`'s layer, which by `architecture-target.md`'s dependency rule may depend on nothing but Vault Ingest. Placing the Membership Selector below `EffectivePageState` would either exclude drafts from correct classification (reproducing the exact bug this ADR exists to close — a Daily Note draft is misclassified precisely because its `folderId` is a Durable-structural fallback, not because its `type` is unknown) or require importing from a layer above, the violation ADR-020 §2 already rejected once under the name "Option A."

The Membership Selector therefore sits **between `EffectivePageState`/`VaultQuery` and View Models** in the read pipeline, depending on both, depended on by neither.

### 3. Distinguishing the six responsibilities

| Layer | Answers | Must never answer |
|---|---|---|
| **Vault** | What pages/folders exist; their identity, storage, and relationships (`id`, `type`, `parentId`/path) | Anything about *why* those relationships matter to a feature |
| **VaultQuery** | Structural projections over `Vault`'s durable state (folder hierarchy; the two durable-only exceptions, favorite/archived membership, per rule 13) | Which product feature a folder belongs to; whether a folder is "visible" in a feature sense |
| **EffectivePageState** | For one page id: does it currently exist (Committed or Durable), what should it be called/shown as | Which sidebar/feature that page belongs in; any question spanning more than one page's identity fields plus a named product concept |
| **Membership Selector (this ADR)** | For a page or folder plus a named product concept: is it a member | Existence, identity, content, formatting, ordering, storage, mutation |
| **View Models** (`toCollectionPageModel`, sidebar models) | Given already-decided membership plus already-reconciled content, what to render: order, grouping labels, icons | Whether a given page/folder belongs in the model at all |
| **React Components** | Presentation of a prepared model | Filtering, grouping, ownership, visibility, navigation-tree construction |

### 4. What business questions this layer owns

Every question of the shape "does this page/folder belong to feature X," including but not limited to:

- Is this folder part of Workspace (resolving the two competing definitions found in the audit into one)?
- Is this page a Daily Note, for sidebar-placement purposes (as opposed to `entry.type === 'daily-note'` checks already done correctly elsewhere for presentation, e.g. breadcrumbs — this ADR generalizes that correct pattern to membership, not just labeling)?
- Is this folder a system/reserved folder, and by which of the strictness levels the audit found (name-only vs. name+path vs. presentation-eligible)? This ADR requires these to collapse to **one** answer, sourced from `ReservedResources`/`Vault.isReservedFolder`, never re-derived by name alone at a call site.
- Does this page belong under Notes (the complement of every other named membership — a page is a Note if no other feature claims it, not because its `folderId` happens to be null)?
- Is this page archived, *in the feature-visibility sense* used to decide whether it should be excluded from a given list — distinct from `Vault`'s raw `metadata.status` field, which remains `VaultQuery`'s exposed primitive; the Membership Selector is where a list-inclusion policy built on that primitive is decided once, not the four independent places the audit found re-checking `status === 'archived'`.

Each such question gets exactly one implementation in this layer. A second implementation of the same question, anywhere else in the codebase, is the regression signature for this ADR (see Invariants).

### 5. What this layer must never own

- **Storage or identity** (`Vault`'s job) — the Membership Selector never holds a page/folder id map of its own and is not a place a page could exist that `Vault` doesn't know about.
- **Committed/Durable reconciliation** (`EffectivePageState`'s job, per ADR-020) — the Membership Selector does not decide what a page is called or whether a draft has been promoted; it consumes `EffectivePageState`'s already-reconciled `type`/`folderId`/`isDraft` fields as given.
- **Mutation, or any write-path decision** (`PageOperations`/`FolderOperations`/the Persistence Gate's job) — a "should this page be allowed to archive" validity question stays exactly where ADR-002/rule 5 already put it; the Membership Selector only ever asks "does this page currently count as a member," never "should it."
- **Presentation formatting, ordering, or icon/label selection** (View Models' job) — sibling ordering for a draft-only entry (already named as an open product decision in ADR-020 §3/Non-Goals) stays a View Model concern; the Membership Selector supplies the *set*, never the *order*.
- **Rendering** (React components' job, unchanged).
- **A general-purpose "business rules" catch-all.** This layer is scoped exclusively to membership/classification questions. A future business rule that isn't of the shape "does X belong to Y" (e.g., validation, permissions) does not belong here — it belongs in the relevant capability facade, per rule 5, unchanged by this ADR.

### 6. Updated read pipeline

```
Filesystem
    ↓
Vault                     — identity, storage, relationships. "What exists."
    ↓
VaultQuery                — structural projections over durable Vault state:
                             folder hierarchy, and the two durable-only
                             exceptions (favorite/archived membership).
    ↓
EffectivePageState          — reconciles Committed (draft/session) with Durable
  (ADR-020, unchanged)       (Vault) state, per page id. "Does this exist, what
                             is it called." Feature-agnostic.
    ↓
Membership Selector          — NEW (this ADR). For a page/folder plus a named
  (this ADR)                 product concept, decides inclusion: Workspace,
                             Notes, Daily Notes, Archive-visibility, system-
                             folder status. One implementation per question.
                             Pure function of Vault/VaultQuery/EffectivePageState
                             output — no independent state.
    ↓
View Model                  — toCollectionPageModel-style: transforms an
                             already-decided membership set plus already-
                             reconciled content into a presentation shape
                             (grouping, order, icons, labels). Decides nothing.
    ↓
React Component              — renders the prepared model. No filtering,
                             grouping, ownership, or navigation-tree logic.
```

`EffectivePageState`'s position, contract, and field set (per ADR-020's M3 amendment: `id`, `type`, `folderId`, `isDraft`, `name`, `description`, `markdown`, `icon`) are unchanged by this pipeline update — the Membership Selector is inserted as a new stage after it, not folded into it.

### 7. Design principles and invariants

- **One business question, one implementation.** Every "does X belong to Y" question named in §4 has exactly one function/answer in the Membership Selector; no consumer may re-derive the same answer independently. A second, independently-written implementation of a membership question anywhere else in the codebase is this ADR's regression signature — the same shape as rule 1's "second general-purpose creator" signature, applied to reads instead of writes.
- **Classification is identity-driven, never topology-driven.** Per the stated architectural principle "page identity determines ownership, not folder hierarchy," every membership decision must be expressible as a function of `type` (and, for folders, reserved/system status from `ReservedResources`), never as a function of `folderId`/path/hierarchy alone. Folder-hierarchy traversal (e.g. "walk the Daily Notes folder to find its pages") is not eliminated by this ADR where it is genuinely a structural query (`VaultQuery`'s job) — what changes is that a page's *inclusion* in a feature is decided by its `type` first, with folder location used only for genuinely structural purposes (e.g. where to render it within a tree the page already qualified for), never as the qualification test itself.
- **Purity and derivability, matching ADR-020 §7's discipline.** Every value the Membership Selector produces must be derivable, at any instant, purely as a function of its declared inputs (`Vault`/`VaultQuery`/`EffectivePageState`/`ReservedResources`). It holds no state that could diverge from those sources — the same "never becomes a source of truth" invariant ADR-020 established for `EffectivePageState`, applied here to prevent this new layer from becoming a fourth place page/folder facts are recorded.
- **No consumer reimplements a membership decision.** Any component or view model that currently computes membership inline (the audit named `FolderTree.tsx` and `DailyNotesList.tsx` specifically) is expected to be migrated to call this layer instead, as a consumer migration — not a new violation each time it's postponed, mirroring how rule 13 itself treated `DailyNotesList.tsx`/`toCollectionPageModel.ts` as "known, tracked instances predating this rule" rather than active violations at the moment that rule was written. This ADR does not mandate an immediate migration; it freezes where the correct answer must eventually live.
- **New membership questions are additive, not exceptions.** A future feature needing a new "does X belong to Y" answer (e.g., a future Templates or Search feature asking "is this page a template") adds a new, narrow function to this layer — never a new ad hoc check inline in a component, and never a new competing selector subsystem elsewhere.
- **The layer answers membership only, never validity or ordering.** Restated from §5 as an invariant, not just a scope note: if a proposed addition to this layer would decide *whether an operation should be allowed* or *in what order/format results display*, it belongs elsewhere (`PageOperations`/`FolderOperations` or the relevant View Model, respectively), and does not belong here regardless of how convenient the placement seems under deadline.

## Alignment with the existing architecture and ADR-020

This ADR **extends** rule 13 and ADR-020 rather than amending or replacing either. Rule 13 already establishes that page-list UIs must read *content* through `EffectivePageState`, not `Vault`/`VaultQuery` directly; this ADR adds the sibling rule that page-list UIs must read *inclusion* through the Membership Selector, not by inspecting `folderId`/path themselves. Both rules now jointly define what a compliant page-list component looks like: it decides nothing, receiving membership from one place and content from another, neither of which it may bypass.

`EffectivePageState`'s public contract, field set, invariants, and lifecycle (ADR-020 §§1–7, and the pre-implementation and M3 amendments) are **unchanged**. The Membership Selector depends on `EffectivePageState`'s existing, frozen output; it does not require `EffectivePageState` to grow new fields, and per ADR-020's own explicit boundary ("must not grow to mirror `Page` field-for-field... a future field is added only when a shipped consumer demonstrably needs it"), membership questions are specifically the kind of need that boundary was designed to deflect into a separate layer rather than accepted as a reason to widen `EffectivePage`. This ADR is that separate layer.

`VaultQuery`'s read surface for folders is otherwise unchanged: `getRootFolders()`/`getChildFolders()` remain the correct structural primitives. `getVisibleRootFolders()` — the one method that answered a business question ("is this folder workspace-visible") rather than a structural one — is retired; its logic and its test coverage moved to `MembershipSelector.getWorkspaceFolders()`/`isWorkspaceFolder()`, per this ADR's own §4 ("is this folder part of Workspace" is a Membership Selector question, not a `VaultQuery` one). Both the sidebar's `FolderTree` and the Workspace collection page (`toCollectionPageModel`) now consume that one implementation, closing the drift identified in the Context section.

## Alternatives Considered

**A — Fold membership rules into `EffectivePageState`.** Rejected. `EffectivePage`'s field set was deliberately fixed and bounded by ADR-020's M3 amendment specifically to prevent it from growing into a catch-all; membership questions are open-ended (new product features add new questions indefinitely) in a way ADR-020's four attribute categories were never designed to absorb. Doing this would also mix two different kinds of correctness — reconciliation correctness (is this value the current one) and classification correctness (does this value qualify) — inside one contract, which is exactly the kind of merged responsibility rule 1 (one capability, one owner) argues against on the write side and this ADR argues against on the read side.

**B — Fold membership rules into `VaultQuery`.** Rejected, for the same structural reason ADR-020 §2 rejected its own "Option A": `VaultQuery`'s layer is permitted to depend on nothing but Vault Ingest. Membership decisions need a draft's `type`, which is only observable through `EffectivePageState`/`PageOperations.getDraft()` — a layer above `VaultQuery`. Hiding that dependency behind a private collaborator inside `VaultQuery` doesn't change which layer it originates from, per the identical reasoning ADR-020 already applied.

**C — Leave membership decisions distributed in each consuming component (status quo).** Rejected — this is the mechanism the audit identified as the actual bug. `FolderTree.tsx` and `DailyNotesList.tsx` already demonstrate that independent, per-component membership logic diverges (silently and without either author knowing about the other's rule) the moment more than one consumer needs the same answer.

**D — Fold membership rules into per-consumer View Models** (`toCollectionPageModel`, sidebar models, one rule per screen). Rejected. Membership questions are cross-cutting — "is this a Daily Note" must be answered identically by the sidebar today and by Search/Quick Switcher/a future Tabs feature tomorrow (all named as anticipated `EffectivePageState` consumers in ADR-020 §1). Placing the rule in a per-screen View Model would relocate the duplication one layer up rather than eliminate it — the same failure mode ADR-020 itself rejected under "Option A" reasoning, restated here for a different pair of layers.

## Non-Goals (explicit exclusions, not silent gaps)

- **Does not relitigate ADR-022's Workspace/Favorites design.** ADR-022 already specified that the sidebar and the Workspace page must agree on Workspace-folder membership; this ADR's implementation resolved the specific filtered-vs-unfiltered question in ADR-022's favor of matching the sidebar's existing behavior (see ADR-022's Phase 2 amendment) and gave that answer a single implementation. If a future product decision *does* want to change what Workspace means, that remains a product decision made through a future ADR amendment, same as any other frozen contract here.
- **Does not address folder deletion.** The missing `Vault.removeFolder()`/sync-side folder-delete handling identified in the same audit is an unrelated write-side/sync-side gap, not a read-model classification question, and needs its own future ADR.
- **Does not specify function names, signatures, file locations, or any other implementation detail.** Per this ADR's own scope, those are implementation-rules.md-governed decisions made at build time, not frozen here.
- **Does not mandate immediate migration** of `FolderTree.tsx`/`DailyNotesList.tsx`/`toCollectionPageModel.ts` off their current inline logic. This ADR freezes where the correct answer must live going forward; migrating existing call sites is implementation work subject to normal prioritization, not a requirement of this document.
- **Does not change `Vault`, `VaultQuery`, or `EffectivePageState`'s public contracts.** All three are extended-from, not modified.

## Consequences

- "What belongs in Workspace," "what belongs in Daily Notes," "what belongs in Notes," and "what is a system folder" each gain exactly one authoritative answer, ending the pattern the audit found of each sidebar/view independently reinventing its own membership rule.
- `architecture-target.md`'s Ownership Diagram gains one new row ("Which feature a page/folder belongs to" → Membership Selector), closing the gap this ADR's Context section identified in that diagram.
- Every future page-list-shaped feature (Search, Quick Switcher, Tabs, Recent Notes — all already named as anticipated consumers in ADR-020) inherits a single place to ask membership questions, rather than needing to rediscover and re-derive the same rules `FolderTree`/`DailyNotesList` each worked out independently.
- No existing frozen contract (`Vault`, `VaultQuery`, `EffectivePageState`, `PageOperations`/`FolderOperations`) changes shape. This ADR is purely additive, in the same sense ADR-020 was additive to the architecture that preceded it.

## Amendment (Phase 5 implementation review): archive-membership duplication was mostly already resolved, not four duplicates

The originating audit's §4/§2.4 grouped four `page.metadata.status === 'archived'` call sites (`VaultQuery.getArchivedPages()`, `PageOperations.ts:654,730`, `TaskOperations.ts:94`) as duplicated "is this page archived" logic, implying Phase 5 would consolidate all four through the Membership Selector. Attempting that consolidation during implementation found the grouping conflated two different categories the audit's own methodology (and `ARCHITECTURE_RULES.md` rule 5's amendment) already distinguishes elsewhere:

- **Display/membership**: `VaultQuery.getArchivedPages()` — "is this page archived, for the purpose of a list that should exclude it." This is exactly what `MembershipSelector.isArchivedPage()` already wraps, delegating rather than duplicating, since Phase 1.
- **Write-path structural precondition**: `PageOperations.ts:654,730` ("can't archive/restore a page whose status disagrees with the requested transition") and `TaskOperations.ts:94` ("can't mutate a task on a page that's currently archived — restore it first") are evaluated at the moment of mutation, inside their owning facade, exactly matching rule 5's amendment: *"a structural precondition check evaluated at dequeue time inside the Gate is not [a rule-5] violation; a facade re-implementing that same check earlier, synchronously, in a way that can go stale before its enqueued operation runs, is a correctness bug even though it looks like 'proper' rule-5 placement."* `TaskOperations.ts:94`'s own existing comment already names this precedent (line 103-106, citing `MoveService`'s occupied-path check). Routing these through `MembershipSelector` — a read-side, no-independent-state classification layer with no place in the write-path's serialized queue — would introduce exactly the staleness bug that amendment warns against: a snapshot read before enqueue that can go stale before the enqueued operation actually runs.

**Resolution:** no code change. The apparent "four duplicates" were one real duplicate (already resolved by Phase 1's `MembershipSelector.isArchivedPage()`/`getArchivedPages()` delegating to `VaultQuery`) plus three correctly-placed, independently-necessary write-path guards that must remain exactly where they are. `PagePersistenceCoordinator.ts:361,388` and `ArchiveMetadataReconciler.ts:44` (found during this review, not in the original audit's list) are the same category — Gate/Sync-internal structural checks — and are also correctly left untouched for the identical reason.

This is recorded here rather than left as a silent no-op so a future reader doesn't rediscover the same four call sites and re-attempt a consolidation rule 5's amendment already forbids.

## Why This Approach Is Preferred

It is the only option of the four considered that closes the gap without either bloating an existing frozen contract past its documented boundary (Options A/B) or leaving the duplication in place merely relocated (Options C/D). It mirrors ADR-020's own precedent exactly: a real, named gap in the read-side architecture, closed by a new, narrow Application-Layer subsystem with a scoped input contract and an explicit "must never own" boundary — not a redesign of anything already working, and not a new general-purpose place for business logic to accumulate.
