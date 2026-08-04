# 10 — Product Architecture Assessment

Scope: forward-looking assessment of whether Clutter's current, frozen architecture can naturally
accommodate a set of plausible future product directions. This report deliberately does not re-derive
implementation detail already covered in `08-feature-architecture.md`; it cites that report and the
architecture docs/ADRs directly.

---

## Summary

The single most load-bearing fact for almost every question below is this: **`Workspace`, the one
subsystem that owns "what is the user currently looking at," has exactly two mutually-exclusive
scalar fields for that — `activePageId` and `activeFolderId` — and no concept of a filtered/virtual
"view."** This is not a guess: `docs/adr/014-phase4-composition-root-and-navigation-cleanup.md`
Decision 4 (Verified) records that **six** planned view-level navigation intents
(`openFavorites`/`openAllNotes`/`openAllTasks`/`openSomedayTasks`/`openCompletedTasks`/`openAllTags`)
were designed, found to require a `Workspace` state extension that doesn't exist, and **deleted
outright** rather than built, with the ADR explicitly stating the missing capability is "sized closer
to a phase of its own than a Phase 4 cleanup item."

That single gap is the direct blocker (Strong Evidence) for Smart Collections, Virtual folders, and —
more surprisingly — the previously-planned Favorites/Tasks/Tags filtered-view surfaces (Favorites
*items* exist and are fully wired per `08-feature-architecture.md`, but a dedicated "Favorites view"
as a navigable destination does not).

A second load-bearing fact: the whole stack — `Application.bootstrap(rootPath: string)`
(`apps/app/src/core/application/Application.ts:82`), one `Workspace`, one `Vault`, one
`PagePersistenceCoordinator` — is built around **exactly one vault, one filesystem root, one process**.
Multiple windows, multiple vaults/workspaces, and collaboration all run into this same single fact
from different angles, and ADR-006/ADR-007 independently confirm it was a *deliberate, named*
scoping decision (not an oversight) to defer exactly this kind of multi-instance/multi-backend
question until it's a committed requirement.

Cloud Sync and Version History are the two areas where the architecture has already done real,
explicit preparatory thinking — `docs/durability-model.md` names them as out-of-scope "gaps" with
precision, and `docs/adr/007-platform-abstraction-scope.md` explains exactly what was deliberately
*not* built to keep a future storage backend swap cheap. This is the strongest-prepared area of the
whole product-direction list.

---

## Current Architecture (as it constrains product direction)

Recap of the load-bearing structural facts, each cited to source:

1. **One process, one vault, one root path.** `Application.bootstrap(rootPath: string)`
   (`apps/app/src/core/application/Application.ts:82`) constructs one `LocalVaultProvider`, one
   `VaultInitializer`, one scan, one `Vault`. `docs/architecture-specification.md:39` states Vault is
   depended on by "Ingest, Persistence Gate, Sync" and nothing multi-instance is described anywhere in
   the twelve-subsystem list.
2. **`Workspace` is ephemeral, in-memory, per-process, not persisted.** ADR-006 (Verified,
   `docs/adr/006-workspace-separation.md`) confirms `.clutter/workspace.json` is written but never
   read, and states plainly: "Navigation state genuinely resets on every app restart until/unless
   persistence is deliberately built." ADR-006's amendment separately flags "future tab and panel
   state" as an anticipated-but-unbuilt extension.
3. **`Workspace` has no filtered/virtual-view concept**, only `activePageId`/`activeFolderId`,
   mutually exclusive (Verified via ADR-014 Decision 4, quoted above).
4. **Platform is intentionally minimal and single-backend**, by explicit decision (ADR-007,
   Verified): "No `StorageBackend` interface, no backend-selection mechanism, no auth scaffolding is
   built until a second backend is an actual, committed piece of work." The one investment made
   toward future backend-swapping is `VaultPath` confinement (Rule 10) — a real, cited, deliberate
   down payment, not nothing.
5. **Durability has exactly three stages — Committed, Durable, Reconciled — and explicitly no
   fourth.** `docs/durability-model.md`'s "Named gaps" section (Verified) lists **Recoverable**
   (undo/version history) and **Cloud-synced** as gaps "by design absence rather than by a stated,
   accepted trade-off," a distinction the document itself draws.
6. **`Sync` (Reconciled stage) is local-filesystem-only and explicitly not cloud sync.**
   `docs/durability-model.md`, Stage 3: "Cloud sync is not this stage under a different name... a
   different problem (network partitions, multi-device conflicts, a genuine second source of truth)
   than this stage solves, even though both would be named 'sync' colloquially. Conflating the two in
   future design conversations is the specific confusion this document exists to prevent."
7. **No plugin/extension subsystem exists or is named anywhere** in the twelve-subsystem list in
   `docs/architecture-specification.md` or in `ARCHITECTURE_RULES.md`. Zero references to "plugin" as
   a code concept were found in `apps/app/src` (only ADR-018's reference to `DocumentEditing`'s
   internal engine, unrelated).
8. **No AI-feature scaffolding exists** — zero matches for AI/LLM/embedding-adjacent terms in
   `apps/app/src` beyond the domain-model "knowledge graph" (tags/tasks/embeds/aliases projections,
   ADR-004), which is a static, rule-based projection over page content, not a model-backed feature.
9. **Delete is permanent and unrecoverable** (`08-feature-architecture.md`'s Trash finding,
   corroborated by `docs/durability-model.md` Stage 2: "Once a delete operation completes, this stage
   provides no path back").
10. **`DocumentSession` retains only current + last-saved revision, no history log**
    (`docs/durability-model.md` Stage 1, "there is no history of prior revisions retained past the
    current and last-saved pointers").

---

## Evidence-Based Assessment Per Direction

### Workspaces (multiple vaults)

**Verdict: Requires rework. (Strong Evidence)**

`Application.bootstrap(rootPath)` takes exactly one root path and is called once by the Composition
Root per the two-phase construction model (ADR-008). Nothing in the twelve-subsystem list describes a
per-vault instance boundary distinct from the process boundary — `Vault`, `Workspace`, and the
Persistence Gate are all process-singleton by construction (`ARCHITECTURE_RULES.md` rule 11: "the only
file that constructs long-lived instances... Application.ts"). Supporting multiple concurrently-open
vaults would mean either (a) multiple `Application` instances in one process — plausible, since
`Application` is already the unit of construction, but nothing in the spec discusses two coexisting or
how `Workspace`/navigation would disambiguate which vault a shortcut targets — or (b) a new
vault-selection layer above `Application` entirely, which is explicitly the kind of new-subsystem
decision `docs/implementation-rules.md` §5 says must stop and escalate to an ADR before implementing.
Not a small addition; closer to a new top-level concern.

### Smart Collections

**Verdict: Requires rework, and the rework's shape is already documented. (Strong Evidence)**

This is the most concretely-answered question in this report, because Clutter already designed and
then deliberately deleted the exact predecessor feature. ADR-014 Decision 4's `openAllTasks` /
`openAllTags` / etc. **are** what "Smart Collections" would be — named, reusable, filtered views. The
ADR states the blocker precisely: "`Workspace`... has no 'active view' state to render a filtered list
into." Building Smart Collections requires exactly the `Workspace` §10 amendment ADR-014 named and
declined to build ad hoc. This is good news architecturally (the shape of the fix is already known and
narrow) and a real caution product-wise (it was tried once, at Phase-4 scope, and explicitly judged too
big for that phase).

Separately: `features/collection/`'s "Collection" concept (per `08-feature-architecture.md`) is
unrelated to Smart Collections — it's a folder-children list, single-`Folder`-sourced,
non-cross-folder, non-filtered. A Smart Collections feature reusing the word "Collection" would need a
different view-model entirely (a set of pages/folders not sourced from one parent), risking a
same-name-different-thing confusion inside the codebase in addition to the `Workspace` gap. Recommend
resolving the naming collision (see `08-feature-architecture.md`'s Alternative Designs #1) before this
work starts.

### Pinned pages

**Verdict: Small addition on existing rails; the harder part is the "pinned view," not "pin the page." (Likely)**

The *mechanism* to mark a page/folder "pinned" already exists in template form: `favorite: boolean` on
`PageMetadata`/`FolderMetadata`, written through `PageOperations.updateMetadata`'s existing four-key
patch (`apps/app/src/core/application/page/PageOperations.ts:44,803-818`). Adding a `pinned` field the
same way is a same-shape extension, not a new write path — genuinely low-risk, per Rule 1/12's
"extend, don't duplicate" pattern (and exactly the kind of change `docs/implementation-rules.md` §2
rule 4 endorses: extend an existing facade capability).

However, *surfacing* pinned pages as a dedicated, always-visible list (rather than reading them
inline, the way Favorites is read inline into the Notes sidebar tab today per
`apps/app/src/features/notes/helpers/getFavoriteItems.ts`) runs into the same `Workspace`
view-state question as Smart Collections only if it needs to be a navigable, filterable destination
of its own rather than a sidebar list — Favorites today is the latter (a list rendered *inside* an
existing tab, not a navigation target), and Pinned could ship the same way with no `Workspace` changes
at all.

### Virtual folders

**Verdict: Requires rework — deepest conflict with an existing invariant. (Strong Evidence)**

`toCollectionPageModel(folder: Folder, ...)` (`apps/app/src/features/collection/page/toCollectionPageModel.ts:50-55`)
is hard-typed to a real `Folder` domain object and reads its children via `VaultQuery.getChildFolders`/
`getChildPages`, both of which are structural (parent-id-based) queries per
`docs/architecture-specification.md`'s Vault Domain Model section. A virtual folder — a folder-shaped
view whose contents are a query result, not a filesystem parent-child relationship — is not
representable by the current `Folder` type at all without either (a) inventing a non-persisted
pseudo-`Folder`, which risks violating Rule 3 ("Vault is the sole authoritative in-memory domain
model... its mutation methods are called only by the Persistence Gate and Sync") if a virtual folder
needs any Vault-shaped identity, or (b) a wholly separate view-model path bypassing `Folder` entirely,
which is really "Smart Collections" under a different name (see above) rather than a distinct feature.
Recommend treating "Virtual folders" and "Smart Collections" as the same underlying architectural work
in any actual roadmap, not two separate line items.

### Plugins

**Verdict: Requires wholly new architecture — not addressed anywhere in current docs. (Verified absence, Hypothesis on shape)**

Zero mentions in the twelve-subsystem list, `ARCHITECTURE_RULES.md`, or any ADR. This is a bigger gap
than "not built yet" — it's not *named* as a future concern the way Cloud Sync and Version History
explicitly are in `docs/durability-model.md`. Per `docs/implementation-rules.md` §5 ("Implementing the
requested feature would require inventing a new architecture... stop, and produce a proposal following
the ADR format before implementing"), Plugins is squarely in that failure condition — it isn't a
"new aggregate" fitting the `*Operations` facade pattern (ADR-002's shape), it's a fundamentally
different kind of extensibility (third-party code with its own capability surface, security boundary,
and lifecycle) with no analog anywhere in the current twelve subsystems. This is the single
highest-uncertainty item in this report precisely because there is nothing to extrapolate from.

### AI features

**Verdict: Depends entirely on what kind. (Hypothesis)**

- A **static, rule-based feature over existing page content** (e.g., auto-suggested tags derived from
  text) fits the existing "disposable projection" pattern (Rule 8, `docs/architecture-specification.md`'s
  knowledge-graph/tags/tasks projections) — same shape as today's tag/task extraction, just a
  different extractor. Low risk, no new subsystem.
- A **model-backed feature requiring network calls, API keys, or async completions woven into the
  editor** (inline AI writing assistance, chat-with-your-notes) has no analog in the current
  twelve-subsystem list and would need to answer: which subsystem owns a network-dependent,
  potentially-failing, potentially-slow side effect touching `DocumentSession`'s buffer? `DocumentEditing`
  today is described (ADR-010, ADR-018) as decoupled from `Page` identity specifically to keep editing
  concerns narrow — bolting a network-calling AI feature into it would be a significant scope
  expansion of a subsystem ADR-010 deliberately kept narrow ("Retain DocumentEditing... unshrunk as an
  internal collaborator" — narrow by design, not by neglect).
- Storing AI-generated content (e.g., a persisted "AI summary" per page) is a metadata-extension
  question, same shape as Favorites/pinned — low risk if it's just another `PageMetadata` field.

### Cloud Sync

**Verdict: The clearest "no" today, with the clearest documented path to "yes" of anything in this list. (Verified via multiple docs)**

`docs/durability-model.md` names Cloud-synced as a gap explicitly and precisely distinguishes it from
today's `Sync` subsystem (local-filesystem reconciliation only, see Current Architecture point 6
above). ADR-007 independently confirms the deliberate choice not to build `StorageBackend` abstraction
speculatively, while making the one investment that keeps a future backend swap cheap (`VaultPath`
confinement, Rule 10). This is the one product direction where the architecture has done real,
explicit, cited preparatory work rather than silence — the risk is not architectural neglect but scope:
ADR-007 itself calls out that a real implementation needs "conflict resolution, offline queuing, auth
expiry" that "a fake implementation can't actually exercise," i.e., this is inherently large,
committed work whenever it starts, not a small feature.

### Collaboration (multi-user, real-time)

**Verdict: Requires wholly new architecture — most invasive item on this list. (Strong Evidence)**

`docs/durability-model.md` Stage 3 states plainly: "the self-write suppression mechanism solves one
specific problem... not the broader problem of two writers producing different content for the same
path in the same narrow window. That scenario has no defined outcome today." Real-time collaboration
*is* that scenario, continuously, by definition. The Persistence Gate's per-page serialized queue
(Rule 2/3) assumes a single local writer; multi-user collaboration needs either operational-transform/
CRDT-style merge semantics or a server-authoritative model, neither of which any current subsystem
attempts. This is the one item on this list that isn't "extend an existing subsystem" or even "add a
new subsystem alongside the existing ones" — it plausibly changes what "Durable" means (Stage 2's
guarantee is local-disk-only) for every page, which the durability-model document itself would need to
be re-derived against, not just extended.

### Version history

**Verdict: Requires a new stage, already named and scoped by the architecture's own docs. (Verified — best-prepared item alongside Cloud Sync)**

`docs/durability-model.md`'s "Named gaps" section states version history "would each be a new stage, or
a property added to an existing one" and explicitly cites `DocumentRevision`'s own documentation as
already naming undo/redo as "an anticipated consumer of the immutable-revision concept, not something
this stage currently provides" (Committed stage). This means the *data shape* (immutable
`DocumentRevision`s) that a version-history feature would consume already exists in the editing layer
— what's missing is retention (today only current + last-saved is kept) and a persistence path for
retained history through the Gate (Durable stage: "no retained history exists today; once a page is
replaced in Vault, its prior on-disk state is not kept anywhere by this stage"). This is real, scoped,
additive work with a named landing spot, not an unknown.

### Publishing (share a page/site publicly)

**Verdict: Not discussed anywhere; likely additive but unverified. (Hypothesis)**

No mention in any doc read during this investigation. If "publishing" means exporting/serving existing
page content read-only, it's plausibly a new, mostly-independent consumer of `VaultQuery` (read-only,
same access pattern already used by every feature) plus a rendering path — doesn't obviously conflict
with any Rule. If it implies a second, externally-reachable write surface (comments, edits from
viewers) it re-raises the Collaboration concerns above. Flagged as unverified because nothing in the
docs discusses it either way — this is the one item this report cannot ground in a specific citation of
absence or presence, unlike Plugins (confirmed absent) or Cloud Sync (confirmed as a named gap).

### Multiple windows

**Verdict: Conflicts with a documented singleton assumption; scoped smaller than Workspaces (multi-vault). (Strong Evidence)**

Two pieces of evidence point the same direction. First, `Application.ts:276-280` (Verified) contains a
comment: `SaveCoordinator... knows nothing about *why* it's being called (window close...)... needs to
import a platform/window API` — i.e., "window close" is already a known trigger point, suggesting
single-window-close handling exists, but nothing about *multiple simultaneously open* windows sharing
one `Vault`/`Workspace`. Second, ADR-006's amendment explicitly flags "future tab and panel state" as
an anticipated `Workspace` extension distinct from what exists today — multiple *panels within one
window* is named as a real anticipated direction; multiple *windows* is not named anywhere. A
tabs/panels feature (single process, single `Workspace`, extended with an list of open targets instead
of one scalar) looks like a natural, named-as-anticipated extension. A second OS-level *window*
sharing the same `Vault`/`Workspace` instance would need explicit concurrency thought for two UI trees
racing to read/write one `Workspace` — not discussed anywhere, and a smaller but real version of the
Workspaces (multi-vault) question above if each window is meant to show a different vault.

### Mobile

**Verdict: Largely orthogonal to the four core subsystems; real friction only at Platform. (Likely)**

The architecture's layering (`Platform → Vault Ingest → Vault Domain Model/Persistence Gate/Sync →
Application Layer → UI/Features`, `ARCHITECTURE_RULES.md` rule 7) is a reasonable shape for a second
UI surface in principle — `Platform` is already the isolated OS-integration boundary (Rule 4:
"Every read, write, directory listing, and change-notification touching the real filesystem happens
behind the VaultFileSystem/VaultFileSystemWatcher interfaces, implemented only inside platform/").
A mobile filesystem/sandbox model is a different `Platform` implementation in principle. The real
friction is unverified and platform-specific: whether `LocalVaultProvider`'s current Tauri-based
implementation (`docs/durability-model.md` Stage 2: "LocalVaultProvider.writeFile calls Tauri's
writeTextFile directly") has any assumption about desktop-style always-available background file
watching that a mobile OS's stricter lifecycle (background suspension, no persistent watcher) would
break — this wasn't verified in this investigation (Platform/Rust internals were out of this report's
`features/` scope) and is flagged as a Next Investigation Area.

---

## Strengths

- Cloud Sync and Version History are the two directions with genuine, cited, deliberate architectural
  preparation — not accidental readiness, but a documented decision to defer the expensive part while
  keeping the cheap containment work (path confinement, immutable revisions) done now. This is a real
  asset for a product roadmap prioritizing either.
- The Favorites/pinned-style "extend PageMetadata + updateMetadata" pattern is a proven, low-risk
  template for several small future features (pinned pages, AI-summary-as-metadata) that don't need
  new subsystems at all.
- The explicit ADR-014 record of *why* Smart-Collection-shaped features were deleted rather than
  half-built is unusually good architectural hygiene — a future implementer doesn't have to
  rediscover the `Workspace` gap by trial and error; it's already named, scoped, and blamed on the
  right subsystem.

---

## Weaknesses

- `Workspace`'s "one active page XOR one active folder, no filtered view" invariant is a single point
  of failure for three separate roadmap items (Smart Collections, Virtual folders, and a
  dedicated-destination version of Pinned pages) — a disproportionate amount of future product surface
  is gated on one subsystem's narrow current shape.
- Plugins has no architectural placeholder or even a "named gap" the way Cloud Sync/Version History
  do — if plugin support becomes a real requirement, it starts from zero design rather than an
  already-drafted extension point.
- No document in this codebase discusses Publishing or Mobile at all, positive or negative — for a
  frozen architecture whose stated goal is durability of the contract over time, these two are
  unscoped risk, not deferred-with-rationale risk like Cloud Sync.

---

## Hidden Assumptions

- **Everything in the twelve-subsystem list assumes exactly one human, one device, one moment of
  editing per page at a time.** This is never stated as a limitation anywhere — it's simply the shape
  every method signature takes (`PageOperations.commitEdit(pageId, markdown)`, one buffer, one
  writer). Collaboration and, to a lesser degree, Multiple windows both directly stress this
  unstated assumption.
- **"Reconciled" (Sync) is assumed to be the ceiling of external-change handling.** The durability
  model is careful to say Cloud Sync is a *different* stage, but nothing in the current design
  anticipates *how many* future stages might eventually sit between Reconciled and a hypothetical
  Cloud-synced stage (e.g., is Reconciled a prerequisite Cloud Sync builds on, or a parallel,
  independent mechanism?) — an open question, not answered by any doc read.

---

## Hidden Coupling

- Smart Collections, Virtual folders, and a dedicated Pinned-pages view are coupled to each other
  through their shared dependency on the same unbuilt `Workspace` capability — a roadmap that
  schedules them as three independent, differently-prioritized features risks three separate,
  divergent attempts to solve the same underlying gap unless explicitly recognized as one piece of
  foundational work first (directly echoing `docs/implementation-rules.md` §6's "when code should be
  merged instead of expanded" guardrail, here applied at the roadmap-planning level rather than the
  code level).
- Version History (a new Durable-stage capability) and Cloud Sync (a new post-Durable stage) both
  eventually touch the same `PagePersistenceCoordinator`/Gate — a roadmap sequencing Cloud Sync before
  Version History should account for the Gate needing to reason about "which revision is this
  external write reconciling against" for both features simultaneously, since both are, in the
  durability model's own terms, extensions of what happens after Durable.

---

## Behavior Analysis

Not separately applicable at this product-direction level of abstraction beyond what's captured per-
direction above; no additional runtime behavior was exercised for this report (static/documentary
analysis only, consistent with the scope of a forward-looking product assessment).

---

## UX Analysis

- Every direction gated on the `Workspace` view-state gap (Smart Collections, Virtual folders,
  dedicated Pinned view) would, if built without first fixing that gap, likely regress to the same
  workaround already rejected once — ad hoc, per-feature state bolted onto components rather than a
  real navigable destination — repeating exactly the "half-built machinery" pattern
  `docs/implementation-rules.md` §2 rule 13 and ADR-006 both warn against elsewhere in the codebase.
- A Trash/recoverable-delete feature (flagged in `08-feature-architecture.md`) is arguably a higher-
  priority near-term UX gap than several items on this list — permanent, no-confirmation-recoverable
  delete is a common source of user-trust damage in note-taking products, and today's architecture
  has zero soft-delete concept to build on (delete is a Gate operation kind identical in shape to
  archive but with no "undo" story at all).

---

## Product Analysis

- The single most useful thing this investigation surfaces for a product roadmap: **Smart Collections
  and Virtual folders are not two features, they're one architectural investment (the `Workspace`
  view-state extension) with two different UI treatments on top.** Scheduling them as unrelated
  backlog items risks doing the foundational work twice, or doing it once but only sized for whichever
  ships first, leaving the second half-supported.
- Cloud Sync and Version History are comparatively "shovel-ready" relative to the rest of this list —
  not free, but the architecture has already named the exact new stage each needs and has done the one
  piece of prep work (path confinement, immutable revisions) that make either cheaper to start later
  than it would have been without that prep.
- Plugins and Collaboration are the two items where a product commitment should trigger an ADR-writing
  exercise *before* any implementation estimate is trusted — both fail `docs/implementation-rules.md`
  §5's "implementing this would require inventing a new architecture" test, meaning any T-shirt-size
  estimate given today without that ADR is not grounded in the actual scope.

---

## Performance Analysis

- Not independently assessed at the product-direction level; `08-feature-architecture.md`'s
  Performance Analysis section (unmemoized collection/daily-notes list rendering) is the most
  concrete, current performance finding and is orthogonal to the directions in this report.
- Version History and Cloud Sync both plausibly increase steady-state I/O and memory footprint
  (retained revisions, reconciliation against a remote copy) in ways `docs/durability-model.md` does
  not currently budget for — flagged as a design input for whichever ADR eventually proposes either,
  not evaluated further here (out of this report's evidence base).

---

## Scalability Analysis

- The **one-vault, one-process, one-Workspace** assumption (Current Architecture point 1) is the
  ceiling on Workspaces/Multiple-windows scalability specifically — not a performance ceiling, a
  structural one (there's no code path for "which of N vaults does this shortcut apply to").
- The **Gate's per-page serialized queue** (Rule 2/3) is a scalability asset for the *existing*
  single-writer model (provably no same-page write races) but is precisely the thing Collaboration
  would need to generalize into a multi-writer merge model — today's biggest concurrency strength is
  tomorrow's biggest concurrency rework, if Collaboration is ever pursued.

---

## Alternative Designs

1. **Fund the `Workspace` view-state extension as its own explicitly-scoped phase before any of Smart
   Collections/Virtual folders/dedicated Pinned view is estimated individually** — directly following
   ADR-014's own recommendation ("a spec §10 amendment and its own rendered view, sized closer to a
   phase of its own").
2. **Treat Plugins and Collaboration as ADR-first work items on the roadmap**, not estimated features —
   i.e., the roadmap entry for either should read "write the ADR proposing the new architecture" as its
   own deliverable, distinct from and prior to "build the feature."
3. **Prioritize a Trash/soft-delete Gate operation kind ahead of, or alongside, the larger Version
   History work**, since it's a small, same-shape extension (mirrors `archive`'s existing shape) that
   closes a concrete, cited trust gap (`docs/durability-model.md`'s "no path back" statement) without
   waiting for the larger Committed→Durable history-retention design Version History would need.
4. **Explicitly name Cloud Sync's relationship to today's `Sync` (Reconciled stage) in a dedicated ADR
   before starting implementation**, per `docs/durability-model.md`'s own warning about the two being
   colloquially confusable — write the disambiguating ADR as a deliverable independent of and prior to
   any Cloud Sync implementation work.

---

## Trade-offs

- Funding the `Workspace` extension first (Alternative #1) delays whichever single feature (say,
  Pinned pages) could otherwise ship fastest standalone, in exchange for not re-solving the same
  problem three times — a real near-term-velocity vs. long-term-coherence trade-off or a product
  team to make deliberately, not by default.
- Treating Plugins/Collaboration as "ADR first" items protects against underestimating them but adds
  process overhead before any user-visible progress — appropriate given both fail the "would require
  inventing a new architecture" test, but worth naming as a cost, not just a safeguard.
- Prioritizing Trash ahead of full Version History delivers a smaller, faster user-trust win but does
  not by itself solve "recover an overwritten edit," only "recover a deleted page" — the two look
  similar to a user but are different architectural problems (Durable-stage delete-recovery vs.
  Committed-stage history-retention) and shipping one shouldn't be read as solving the other.

---

## Confidence Level

- **Verified**: the `Workspace` view-state gap and its ADR-014 documentation, the single-vault/single-
  process construction pattern, the durability-model's explicit Cloud-synced/Recoverable gap naming,
  ADR-007's deliberate non-build of multi-backend infrastructure, Plugins' total absence from all
  architecture docs, Collaboration's explicit "no defined outcome" statement in durability-model.md.
- **Strong Evidence**: Workspaces (multi-vault), Virtual folders, Multiple windows, and Collaboration
  each requiring architectural rework — each traced to a specific cited structural fact, though no
  ADR has evaluated these specific product directions directly (the report connects documented facts
  to un-discussed directions, which is the strongest form of evidence short of an ADR saying so
  explicitly).
- **Likely**: Pinned pages' small-addition framing, and Mobile's Platform-isolation argument — both
  reasoned from the architecture's stated design intent rather than from a document that discusses the
  specific direction.
- **Hypothesis**: AI features (depends entirely on which kind, not evaluated against a specific
  proposal) and Publishing (zero documentary evidence either way).
- **Unknown**: actual implementation cost/timeline for any item — this report assesses architectural
  fit, not effort sizing, and explicitly declines to estimate per implementation-rules.md's own
  caution against improvising scope for undesigned work.

---

## Next Investigation Areas

1. **Read `docs/architecture-specification.md` §10 (Workspace) in full** against ADR-006's amendment
   and ADR-014 Decision 4 to draft the actual shape of a `Workspace` view-state extension — this is the
   single highest-leverage next step, since it unblocks the assessment of three separate product
   directions at once.
2. **Investigate `VaultQuery`'s full method surface** (only `getChildFolders`/`getChildPages`/
   `getFavoriteFolders`/`getFavoritePages`/`tags()`/`getReservedFolder` were exercised via feature code
   in this investigation) to determine how much of the *query* half of Smart Collections already exists
   versus needs building alongside the `Workspace` half.
3. **Audit `platform/` and the Rust/Tauri side directly** (out of this report's `features/`-anchored
   scope) for the Mobile-direction question — specifically whether `VaultFileSystemWatcher`'s
   implementation has any always-on-background assumption incompatible with mobile OS lifecycle rules.
4. **Read ADR-018 (DocumentEditing identity decoupling) in full** — its stated motivation (decoupling
   editing sessions from `Page` identity) may be directly relevant to both Version History (multiple
   revisions needing distinct identity from the "current" page) and Collaboration (multiple concurrent
   editing sessions against one logical page) and was only read by title/reference in this
   investigation, not in full.
5. **Confirm whether any ESLint/tooling boundary enforcement referenced throughout `ARCHITECTURE_RULES.md`
   as "the target mechanical enforcement" is actually configured** — several of the constraints this
   report relies on (Rule 3's Vault-mutation confinement, Rule 6's UI-construction ban) are currently
   convention-enforced per `08-feature-architecture.md`'s findings, which matters for how much
   confidence a Plugins ADR could place on these boundaries holding under third-party code.
