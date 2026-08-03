# Autosave — Ownership Boundaries

**Status:** Research only. No code changes, no trigger tuning, no sequencing. This document answers exactly one question, eight times over: *which subsystem owns which piece of autosave, and why is that assignment stable for the next decade rather than a judgment call this year's implementation happens to land on.*

It is the companion to [`autosave-strategy-analysis.md`](./autosave-strategy-analysis.md) (product/architecture/impact research) — that document answers *what* the trigger model should be; this one answers *who is allowed to own each moving part*, so the eventual implementation has nowhere convenient to bolt a second owner onto, the way the pre-migration codebase's six-file page lifecycle did.

Every answer below is derived from an owner that **already exists** in `docs/architecture-specification.md`. Nothing here proposes a new subsystem, a new facade, or a new file — see the closing section for why that's not a coincidence.

---

## Summary table

| # | Question | Owner | Kind of ownership |
|---|---|---|---|
| 1 | Owns the autosave capability | `PageOperations` | Facade — policy and single call-site |
| 2 | Owns dirty state | `DocumentEditing` (`DocumentSession`) | Internal collaborator — in-memory state |
| 3 | Owns timers | `DocumentEditing` (`SaveCoordinator`) | Internal collaborator — mechanism |
| 4 | Decides *when* a save should happen | `PageOperations` | Facade — policy |
| 5 | Actually performs the save | Persistence Gate (`PagePersistenceCoordinator`) | Sole write path |
| 6 | Coordinates multiple dirty documents | `DocumentEditing` (query) + `PageOperations` (action) | Split: enumeration vs. orchestration |
| 7 | Handles shutdown/navigation flush triggers | Composition Root / navigation call sites (trigger) → `PageOperations` (logic) | Split: trigger point vs. behavior |
| 8 | Exposes save state to the UI | `DocumentEditing` (`DocumentSession.subscribe`/`.state`) via `PageOperations.getSession` | Existing, unchanged mechanism |

No row introduces a new subsystem. Every owner is a subsystem the specification already names, in the role it already assigns.

---

## 1. Which subsystem owns autosave?

**Owner: `PageOperations`.**

Autosave is not a new capability — it is new *timing* on an existing one. `PageOperations` already "own[s] the entire lifecycle of a page as a single capability surface" (spec §6), and "when does a save happen" is squarely inside that lifecycle, not adjacent to it. **Rule 1** ("Every capability has exactly one owning facade") is the direct test: a page has exactly one lifecycle owner today, and autosave doesn't create a second lifecycle — it changes how often the existing one's `save()` method gets called. Treating autosave as a capability that needs its own owner would fail the same test `ARCHITECTURE_RULES.md`'s "When a new service/facade is allowed" section already sets: a new facade is justified only for a *new aggregate* (Templates, Attachments), never for a new verb or new trigger on an aggregate `PageOperations` already owns.

This doesn't mean every mechanical piece lives inside `PageOperations` itself — it means `PageOperations` is the one place a future contributor, or a future plugin/automation API, reaches for "how does autosave work," the same way it's already the one place to reach for "how does save work" or "how does draft promotion work." Mechanism is delegated (Q2, Q3), the way disk I/O is already delegated to the Gate — delegation is not a second owner; **Rule 1**'s test is about who decides, not who executes every line.

**Why this doesn't need revisiting in 5-10 years:** any future page-lifecycle capability (rename-on-idle, AI-assisted autosave, a future "smart save" heuristic) is, by the same reasoning, still a verb on the page aggregate — it has exactly one place to go, permanently, for the same reason `create`/`archive`/`restore` do.

---

## 2. Which subsystem owns dirty state?

**Owner: `DocumentEditing`, specifically `DocumentSession`.**

Dirty state (`isDirty`, `currentRevision` vs. `savedRevision`) is Committed-stage, in-memory, edit-buffer state — exactly what spec §9 already assigns to `DocumentEditing`: "Own the live edit buffer, revision tracking, and save-lifecycle state... Owns in-memory edit state only." `DocumentSession.isDirty` already exists today, computed as `currentRevision !== savedRevision` (`DocumentSession.ts`). Nothing about autosave changes what dirty state *means* — it only changes how often `commit()` updates `currentRevision` (§1 of the companion analysis). Ownership doesn't move because the update *frequency* changes.

This is where **Rule 5** draws a boundary that matters for this question specifically: "whether the document has unsaved content" is not a business-policy decision (it doesn't vary by product rule, permission, or judgment call) — it's a structural fact derived from two revision pointers, the same category of thing Rule 5's amendment already carves out for the Gate's own dequeue-time structural checks ("this page is already archived," "this id already exists"). Structural state derivation belongs with whatever already owns the underlying state, not with the facade that makes policy decisions about it. `PageOperations` *reads* dirty state to decide things (Q4); it does not *compute* it — computing it a second time anywhere else (a UI-layer shadow copy, a `Workspace`-level flag) would be exactly the duplicate-ownership pattern `ARCHITECTURE_RULES.md`'s "How to detect duplicate ownership" guardrail flags: two places tracking the same fact is a fragmentation signal regardless of how small each copy is.

**Why this doesn't need revisiting in 5-10 years:** any future editor feature that needs to know "has this changed since it was last durable" — collaborative-editing conflict UI, a future "unsaved changes" badge in a tab strip, a future undo/redo indicator — reads `DocumentSession`, never recomputes the fact. One fact, one owner, arbitrarily many readers.

---

## 3. Which subsystem owns timers?

**Owner: `DocumentEditing`, specifically `SaveCoordinator`.**

`SaveCoordinator`'s own header comment already lists "Coordinate autosave" among its stated responsibilities (`SaveCoordinator.ts:6-11`) — this is the one place in the current codebase that already anticipates this exact question, unimplemented but pre-declared. Debounce/ceiling timers are mechanism, not policy: "has enough idle time passed since the last keystroke" is a fact about elapsed time, structurally identical in kind to the Gate's own dequeue-time structural checks that **Rule 5**'s amendment explicitly distinguishes from business policy — "a structural check never decides whether the product should allow this; it decides whether this already-decided operation is still valid to execute" (or here, whether it's time to consider firing it). A timer firing is not itself a decision to save; it's an input to `PageOperations`'s decision (Q4).

**Rule 4** ("Platform owns all OS-level filesystem and watcher interaction") is worth naming explicitly here for what it *doesn't* say: Platform's ownership is scoped to filesystem I/O and filesystem change notification, not general-purpose timing. A debounce timer measuring keystroke idle time has nothing to do with disk or watcher state — it operates entirely at editor-interaction timescale, before any write is even being considered. ADR-010 already drew this exact line when it rejected merging `DocumentEditing`'s revision-tracking into the Gate: "the Gate owns *how a write happens safely on disk*; `DocumentEditing` owns *in-memory edit-buffer state before a write is even requested*... Merging them would make the Gate stateful across UI-interaction timescales." A timer belongs with the collaborator that already owns UI-interaction-timescale state, for the identical reason.

Two subsystems were considered and rejected:
- **The Gate** — wrong timescale (disk-write timescale, not keystroke timescale); would violate ADR-010's already-settled boundary.
- **The UI layer (a React hook holding timer state)** — fails Q6/Q7 below: a purely component-local timer can't see "the user switched away from this tab entirely" or "the window lost focus," both of which need to reach *every* open session, not just the currently-rendered component's local state. A UI-local timer is also invisible to a future non-UI caller (a plugin, an automation surface) the way `SaveCoordinator`, as `PageOperations`'s internal collaborator, is not.

**Why this doesn't need revisiting in 5-10 years:** any future trigger this design didn't anticipate (a "save every N words" heuristic, a future AI-editing session's own commit cadence) is still elapsed-time-or-event-count bookkeeping at edit-buffer timescale — still `SaveCoordinator`'s job, for the same reason.

---

## 4. Which subsystem decides when a save should happen?

**Owner: `PageOperations`.**

This is the question **Rule 5** exists to answer precisely, and it is deliberately being kept distinct from Q3. A timer *firing* (Q3) is not the same event as a save *happening* — between them sits a policy decision: should this particular fired trigger actually result in a call to `save()`, given what's true about this specific page right now? `PageOperations.save()` already contains exactly this shape of decision today — the synchronous `vault.getPage(pageId)` check that decides whether an incoming save is an ordinary save or a draft-promotion (ADR-017 §4). That check is business policy (it depends on product rules about drafts, not on elapsed time), and Rule 5 places business policy "inside `PageOperations`/`FolderOperations`... The Persistence Gate, Vault Ingest, and Platform only ever decide *how* to carry out an operation that's already been decided."

The clean division this produces, stated once so it never has to be re-derived: **`SaveCoordinator` decides *when a trigger fires*; `PageOperations` decides *what happens once it does*.** This is the same shape as the Gate's own split between structural dequeue-time checks and `PageOperations`'s business-policy checks (Rule 5's amendment) — applied one layer higher, to the same pattern.

Concretely, this is where a future product decision like "a debounce-only trigger on a still-unpersisted draft should use a longer interval than an already-real page" (flagged as an open question in the companion analysis, §7 Risk 1) belongs: not as a different timer inside `SaveCoordinator`, but as a policy branch inside `PageOperations`'s decision of whether/how to act on a fired trigger — `SaveCoordinator` doesn't need to know what a draft is; `PageOperations` already does.

**Why this doesn't need revisiting in 5-10 years:** every future save-timing policy question (should autosave respect a "do not disturb while presenting" mode; should a very large document's autosave decision differ from a small one) is a business-policy question about *whether* to act on a trigger, which by construction has exactly one place to go.

---

## 5. Which subsystem actually performs the save?

**Owner: the Persistence Gate (`PagePersistenceCoordinator`).**

This is the one answer autosave changes nothing about, and it's worth stating precisely why, rather than assuming it. **Rule 2** ("Every page or folder write flows through the Persistence Gate") governs the write path itself, independent of what triggered the enqueue — the Gate's contract (spec §5) is "the only mechanism that writes a page/folder to disk and mutates the Vault," and that contract has no concept of *why* an operation was enqueued. A `save` operation enqueued from a blur handler and one enqueued from a debounce timer are, from the Gate's perspective, identical — `enqueue(pageId, { kind: 'save', content })`, serialized per-page exactly as today. This is precisely what makes Q1-Q4's answers safe: because the Gate is trigger-agnostic by construction, multiplying the number of triggers upstream of it (§1 of the companion analysis) adds callers, never adds write paths, and **Rule 2**'s guarantee — no two writes to the same page can race — holds exactly as strongly under five triggers as it does under one.

**Rule 4** is the supporting boundary underneath this one: the Gate itself doesn't touch a filesystem API directly either — it calls `VaultFileSystem.writeFile` (Platform's owned interface), so the actual OS-level write is, transitively, still Platform's exclusive concern regardless of how the Gate came to be enqueued.

**Why this doesn't need revisiting in 5-10 years:** this is the one answer the companion analysis already stress-tested against thirteen future features (§6 of that document) and found nothing that changes it — undo/redo, version history, plugins, attachments, and even a future richer editor all still funnel through the same one write path, because Rule 2 doesn't have a carve-out for "unless the write was autosave-triggered."

---

## 6. Which subsystem coordinates multiple dirty documents?

**Split ownership, deliberately: `DocumentEditing` enumerates, `PageOperations` orchestrates.**

This is the one question without a today-shipped answer, so it's worth being precise about why the split is the correct shape rather than picking one subsystem to own the whole thing.

- **Enumeration — "which sessions currently exist, and which are dirty" — belongs to `DocumentEditing`**, specifically `DocumentRegistry` (which already tracks every open `DocumentSession`, per spec §9's `open`/`get`/`close`) together with each session's own `isDirty` (Q2). This is not new ownership — it's the direct, structural consequence of Q2's answer: if `DocumentSession` owns whether *one* document is dirty, the set of *all* dirty documents is just a query over the registry that already holds every session, not a new fact requiring a new owner.
- **Orchestration — actually calling `save()` for each dirty session, in response to a cross-cutting event (window-focus-loss, app close) — belongs to `PageOperations`.** This is where **Rule 1** does real work: a "flush coordinator" or "shutdown service" that itself decided which pages to save and called into persistence on their behalf would be a second file that can trigger a page save outside `PageOperations` — precisely the fragmentation pattern Rule 1 exists to prevent (`ARCHITECTURE_RULES.md`'s own historical example: six files each owning a slice of "what can happen to a page"). Coordinating N saves is not architecturally different from coordinating one — `PageOperations` already is, and remains, the only place "save this page" is decided, whether it's asked to do that once or in a loop over every dirty session `DocumentEditing` reports.

Concretely: `PageOperations` (or a thin method on it, e.g. an internal `flushAll()` used by the two callers in Q7) asks `DocumentEditing`/`DocumentRegistry` "which sessions are dirty," then calls its own `save()` for each — the same public entry point every other trigger already converges on. No new subsystem, no new facade, and critically, no *second* decision-maker about whether/how a given page gets saved — the multi-document case reduces to N invocations of the already-single-owned single-document case.

**Why this doesn't need revisiting in 5-10 years:** a future multi-window feature (§6 of the companion analysis flags this as a named dependency to check, not solve, when scoped) still reduces to "enumerate dirty sessions, ask `PageOperations` to save each" — multi-window changes *what* needs enumerating (per-window vs. global), not *who* enumerates or *who* orchestrates.

---

## 7. Which subsystem handles application shutdown and navigation flushes?

**Split ownership, deliberately: the trigger point is structural (Composition Root for shutdown; the existing navigation call site for navigation); the flush logic is `PageOperations`, in both cases.**

This split is forced by **Rule 7** ("Dependencies point downward only"), not chosen for convenience. The dependency diagram (spec, `architecture-target.md`) places `Workspace` parallel to the Vault/Application stack, "depended on by the application layer and UI, depending on nothing" — `Workspace` has zero permitted outgoing dependencies. That single fact rules out one design that looks tempting at first glance: making `Workspace.closePage`/`openPage` themselves trigger a flush. `Workspace` cannot call `PageOperations.save()` — doing so would be an upward dependency (`Workspace` importing from the Application Layer, which sits above it in the diagram), a direct **Rule 7** violation, independent of whether the resulting code would otherwise "work." This is also why spec §10 states `Workspace`'s methods are "Synchronous, single-threaded — no async operations, no races possible" as an *invariant*, not an incidental property: introducing an async flush into `openPage`/`closePage` would break that invariant even before the dependency-direction problem is considered.

The consequence, stated precisely per subsystem:

- **Navigation flush:** the trigger point must be *above* `Workspace` — whichever caller already initiates a page switch (the UI action handler, or `PageOperations`/`NavigationRouter`'s own call sites that lead into `Workspace.openPage`) is responsible for calling into `PageOperations`'s flush logic (Q6) *before* the switch actually happens, then calling `Workspace.openPage` unchanged, exactly as today. This keeps `Workspace` untouched — no new method, no new invariant — and keeps the flush decision inside `PageOperations`, consistent with Q1/Q4/Q6.
- **Shutdown flush:** the trigger point is the Composition Root (`Application.close()`), which already owns the app-lifecycle sequence (spec §11: "`close()` stops the watcher and tears down subscriptions") and is the one place with legitimate authority to know "the app is closing" at all. But spec §11's own invariant is explicit that the Composition Root carries "No conditional business logic — the only branch allowed here is..." a narrow, already-named exception — so `Application.close()` cannot itself decide *how* to flush; it can only be the point that *calls* `PageOperations`'s flush logic (Q6), exactly as `Application.bootstrap()`/`open()` already call into `PageOperations` rather than reimplementing page-resolution logic inline (per the Startup sequence in the specification). **Rule 7** applies here too, in the ordinary direction: the Composition Root is permitted to depend on the Application Layer (it constructs and wires it, spec §11), so this call is a normal, already-precedented downward call — not a boundary exception, just an application of the same rule that ruled out `Workspace` doing it.

**Why this doesn't need revisiting in 5-10 years:** this split is a direct, mechanical consequence of the dependency diagram, not a preference — any future trigger that needs to flush pending saves (a future "sleep mode," a future explicit "save all" menu command) will, by the same reasoning, need its trigger point wherever that event is legitimately observable (UI action, OS hook, Composition Root) while its logic stays in `PageOperations`. The diagram doesn't change based on which event is triggering the flush, so the split doesn't either.

---

## 8. Which subsystem exposes save state to the UI?

**Owner: `DocumentEditing` (`DocumentSession.subscribe`/`.state`/`.isDirty`), reached through `PageOperations.getSession(pageId)`.**

This is the one answer that requires zero new design — it's already fully shipped, and autosave doesn't change it. `DocumentSession` already exposes `subscribe(listener)`, `.state` (the `Loading → Clean → Saving → Clean`/`SaveError` machine, spec §9), and `.isDirty`; `PageOperations.getSession(pageId)` is already public API (spec §6) for exactly this purpose. A "saving.../saved" UI indicator reads this today for blur-triggered saves and will read the identical interface for autosave-triggered ones — the state machine's meaning doesn't change, only how often it transitions (§3 of the companion analysis already makes this point for the durability-model mapping; it applies identically here for the UI-exposure question).

Two alternatives are worth naming as explicitly rejected, because they're the kind of shortcut that looks convenient mid-implementation:
- **`Workspace` exposing save state** — rejected outright by spec §10's own Ownership section: `Workspace` "must never own persisted product data or write logic," and save state is exactly that. This is also why `Workspace.refresh()`'s narrow, already-amended exception (ADR-006) explicitly does not apply here — refresh() covers state with no other observable owner; save state's owner (`DocumentSession`) already exists and is already reachable.
- **A new UI-layer store duplicating `DocumentSession.state`** — would be exactly the "two places tracking the same fact" duplication Q2 already rejects for dirty state specifically; save state is the same fact viewed from the UI side, not a different fact.

**Why this doesn't need revisiting in 5-10 years:** any future save-state consumer (a tab-strip dirty indicator, a future command-palette "unsaved documents" list, a future multi-window title bar) reads the same `DocumentSession` interface through the same `PageOperations.getSession` accessor — the exposure mechanism doesn't need to grow new surface area as new UI consumers appear, because it was never scoped to one specific piece of UI to begin with.

---

## Why none of this required a new subsystem

Every question above resolved to a subsystem `architecture-specification.md` already names, in a role that document already assigns it — `PageOperations` for policy, `DocumentEditing` for in-memory/timing mechanism, the Gate for the write itself, the Composition Root for lifecycle trigger points, `Workspace` explicitly excluded by its own frozen invariants. This isn't a coincidence produced by working backward from convenient answers — it's the direct, load-bearing consequence of two things already true before this analysis started:

1. **ADR-010's decision to keep `DocumentEditing` "unshrunk"** specifically anticipated a future need exactly this shape — `SaveCoordinator`'s own doc comment already named "Coordinate autosave" as a responsibility before any of this milestone's work began. Questions 2, 3, 6, and 8 are that anticipation being exercised, not new territory.
2. **ADR-017's Governing Principle and its promotion-trigger generalization** already established that "any committed, persistent, user-owned change... promotes a draft exactly once," converging every trigger on one shared helper inside `PageOperations`. Questions 1 and 4 are a direct application of a pattern that milestone already proved out for three triggers (body, title, metadata) to a fourth and fifth (timer, navigation) — the same shape, not a new one.

The one place this document identifies real, non-precedented design work is Q6/Q7's split (enumerate-then-orchestrate for multiple dirty documents; trigger-point-above-`Workspace` for navigation and shutdown) — and even there, the *shape* of the split is fully determined by Rules 1, 5, and 7 rather than being a free choice. That's the property this document set out to check: an ownership boundary that falls out of already-frozen rules, rather than one chosen for this feature and hoped to still make sense after the next 300 features, is the boundary that doesn't need revisiting in five or ten years.
