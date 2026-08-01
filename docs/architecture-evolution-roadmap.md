# Clutter — Architecture Evolution Roadmap

**Status of the base architecture: Architecture v1.0, frozen.** The six-phase migration (`docs/architecture-target.md`, `docs/architecture-specification.md`, ADR-001 through ADR-016) is complete. This document does not reopen it. Nothing here is a migration phase, and nothing here should be read as license to restructure a subsystem the migration already settled — see "Guiding Principles" below for exactly where the line is.

This is a planning document, not an implementation plan. Every item below needs its own pre-implementation pass through `docs/implementation-rules.md` — naming which rules apply, which invariants must hold, what the smallest correct change is — before any code is written. Nothing here is pre-approved for implementation.

---

## Purpose

Architecture v1.0 fixed one specific, historical problem: a capability like "mutate a page" had six independent, uncoordinated owners, three write paths, and no single file a contributor could read to understand what happens end-to-end. That problem is solved and should stay solved. This roadmap is about a different question: **given a codebase that now has exactly one owner per capability and exactly one write path, what does the next 10–30 years of building on top of it look like, without ever needing a second six-phase rescue?**

The answer this roadmap commits to: every new capability area below is designed to be *a new consumer of the existing capability facades*, or, where that's not enough, *a new facade following the exact same shape* (per `architecture-target.md`'s own Coding Rule 1: "before adding a new file, ask whether an existing facade already owns this"). None of the six sections below propose a new architectural *pattern* — they propose new *surfaces* and *subsystems* that plug into the pattern already frozen.

---

## Guiding Principles (carried forward, not reinvented)

These are `ARCHITECTURE_RULES.md`'s rules, restated as the acceptance criteria every item in this roadmap must satisfy before implementation:

1. **One owner per capability.** A Plugin SDK, a CLI, an MCP server, and a browser extension are five different *entry points* to the same capabilities `PageOperations`/`FolderOperations` already own — never five different *implementations* of "create a page."
2. **One write path.** Nothing proposed here writes to disk except through the Persistence Gate. A voice-capture pipeline that produces a page does so by calling `PageOperations.create()`, exactly like every other caller.
3. **Dependencies point downward.** New surfaces (Plugin SDK, Public API, CLI, MCP) sit *above* the application layer, calling into it the same way UI does today — never beside it with independent access to `Vault` or the Gate.
4. **New abstractions cite what they replace or what gap they close.** Every new subsystem proposed below names the specific gap in the frozen architecture that justifies it — an Action Registry isn't "cleaner," it's the thing that lets 6 different future consumers (CLI, MCP, plugins, automation, command palette, AI agents) share one definition of "what actions exist" instead of each reimplementing action dispatch.
5. **No capability ships half-done.** Same rule that governed every phase: a facade method with no caller, or a caller with no facade method, is not a shippable unit.

---

## How to Read This Document

Each section below covers several capability areas. For each: **why it belongs after v1.0** (not before, and why it wasn't part of the migration), **architectural goals**, **dependencies** (on the frozen architecture and on other roadmap items), **relative size** (S/M/L/XL, roughly weeks/a month/a quarter/multiple quarters), and **risks or trade-offs**. A cross-section sequencing recommendation follows all six sections, since several items share prerequisites across sections.

---

## 1. Platform & Extensibility

### Why this belongs after v1.0

Every item in this section is an *entry point* — a new way to reach `PageOperations`, `FolderOperations`, `NavigationRouter`, and `VaultQuery`. Building any of them before the capability layer had a single, stable shape would have meant building against a moving target (exactly what Phase 1–2 fixed). Now that the shape is frozen, extension points can commit to it.

### Foundational: the Action Registry

Referenced in `architecture-target.md`'s own "Future Vision" note as deferred work: *"A possible Action System sitting ABOVE the capability layer... where interaction semantics become reusable while business logic remains owned by capabilities."* Nearly every other item in this section needs it, so it comes first.

**Architectural goal:** a registry mapping a stable action name (`"page.create"`, `"page.archive"`, `"folder.move"`) to (a) a facade method reference, (b) a parameter schema, (c) human-readable metadata (name, description) for discovery by a command palette, MCP, or an AI agent. The registry itself owns *no* business logic — it's a lookup table over `PageOperations`/`FolderOperations`/`NavigationRouter`, matching the Gate's own "owns *how*, never *whether*" split. A CLI command, an MCP tool, a command-palette entry, and an automation step all become "look up an action, validate params against its schema, call it" — one dispatch mechanism, not four.

**Dependencies:** none beyond the current facade layer. This is why it's foundational rather than gated on anything else.

**Size:** M. The registry itself is small; the real work is enumerating and schema-defining every action `PageOperations`/`FolderOperations`/`NavigationRouter` currently expose.

**Risks:** scope creep into a "rules engine" (explicitly forbidden by `ARCHITECTURE_RULES.md` rule 5's rationale) — the registry must stay a pure lookup/dispatch table, never a place business logic migrates to.

### Plugin SDK

**Why after v1.0:** a plugin author needs a *stable contract*, not direct access to `PageOperations` (whose internal shape can and should still evolve). Building this against Architecture v1.0's frozen facades, rather than mid-migration, means the SDK's first version won't need a breaking change the week after ship.

**Architectural goal:** a versioned `PluginAPI` interface — not the concrete `PageOperations`/`FolderOperations` classes themselves — that plugins depend on. The Composition Root constructs the real facades and wraps them behind this interface once; plugins receive only the interface, never a concrete class (the exact rule 6 discipline already enforced for UI, extended to a new consumer). SemVer applies to `PluginAPI`, not to internal classes — internal refactors (e.g., a future Gate operation-kind addition) are free as long as `PluginAPI`'s contract holds.

**Dependencies:** Action Registry (for capability discovery), a sandboxing/permission model (new — plugins are less trusted than first-party UI code, unlike everything built so far).

**Size:** XL. The interface design is moderate; sandboxing, lifecycle (install/update/uninstall/enable-disable), and a plugin manifest format are each their own substantial design efforts.

**Risks:** this is the single highest-commitment item in the roadmap — once third parties depend on `PluginAPI`, every breaking change has an external cost. Recommend shipping the *simplest possible* `PluginAPI` v1 (read-heavy, narrow write surface) and growing it, rather than trying to anticipate every future plugin need up front — directly the same "don't build speculative machinery" discipline ADR-004/ADR-011 already applied.

### Public API

**Why after v1.0:** this is `PluginAPI` exposed over a transport (local HTTP/IPC), for consumers that aren't in-process (browser extension, CLI running as a separate binary, external automation tools). It should be a thin translation layer over `PluginAPI` — no new business logic, matching the Gate's own translation-layer precedent.

**Dependencies:** `PluginAPI` (this *is* `PluginAPI`'s network-facing skin, not an independent design).

**Size:** M, once `PluginAPI` exists.

**Risks:** authentication/authorization for a locally-exposed API (even "local-only" surfaces need a real auth story — a same-machine process shouldn't be able to silently delete a user's vault by hitting an unauthenticated local port).

### MCP Integration

**Why after v1.0:** MCP tools are, structurally, Action Registry entries exposed via a specific protocol. Building this before the Action Registry exists means reimplementing action dispatch a second time, specifically for MCP — exactly the fragmentation problem v1.0 eliminated, recreated in a new surface.

**Architectural goal:** an MCP server that translates the Action Registry's entries into MCP tool definitions. Read-oriented tools (query pages, search, get backlinks) should ship before write-oriented tools (create, delete, move) — write actions taken by an AI agent need more deliberate safety design (see Section 6) than read actions do.

**Dependencies:** Action Registry, `PluginAPI` or `Public API` (MCP server is itself an API consumer, not a special case).

**Size:** M.

**Risks:** over-exposing capabilities — an MCP tool surface that lets an agent call `PageOperations.delete()` in a loop with no confirmation step is a product-safety problem, not just an architecture one. Flagged in detail in Section 6.

### CLI / Terminal Interface

**Why after v1.0, but notably *cheap* right now:** `Application.bootstrap()` (Phase 4) is already fully decoupled from React/Tauri's UI shell — it's a plain class. A headless CLI that constructs its own `Application` instance and calls facade methods directly needs almost no new architecture, just a new entry point and an argument-parsing layer. This is likely the cheapest item in the entire roadmap precisely *because* of work already done in Phase 4.

**Dependencies:** none strictly required (`Application.bootstrap()` alone is enough for a minimal CLI); Action Registry makes a *good* CLI (consistent command naming, discoverability) rather than a minimal one.

**Size:** S for a minimal CLI against existing facades; M once integrated with the Action Registry for a polished command set.

**Risks:** low. The main trade-off is whether the CLI talks to an already-running app instance (via Public API — needed if the desktop app should reflect CLI-made changes live) or runs fully headless (simpler, but a running desktop app and a CLI invocation could race on the same vault without the Gate's in-process queue coordinating them — needs a decision before implementation, not an assumption).

### Automation

**Why after v1.0:** multi-step, conditional action sequences are a natural consumer of the Action Registry once actions are composable, named, and schema-described.

**Architectural goal:** a workflow definition (trigger → sequence of actions, possibly with conditions) that executes via the Action Registry — the automation engine owns *sequencing*, never *what an individual step does* (that's still each action's own facade method).

**Dependencies:** Action Registry.

**Size:** L.

**Risks:** partial-failure semantics (if step 3 of 5 fails, what happens to steps 1–2's already-committed writes?) — this needs real design, not an implicit assumption; likely needs each action's result to be inspectable/loggable, possibly a "dry run" mode.

### Browser Extension / macOS Capture Extension

**Why after v1.0:** both are thin capture clients — they produce content and need to get it into the vault. Per rule 2, they cannot write vault files directly; they must go through the Gate, which for an out-of-process client means through the Public API.

**Dependencies:** Public API. Neither should be designed before Public API exists — building either first would create exactly the kind of second write path the whole migration eliminated.

**Size:** M each, once Public API exists.

**Risks:** offline/unreachable-app handling — if the desktop app isn't running, does capture queue locally and sync later, or fail? This is a real design question requiring its own small ADR when scheduled, not resolved here.

### Voice Capture / Meeting Ingestion

**Why after v1.0:** this is fundamentally an Ingest-adjacent concern (transforming raw input — audio — into page content) feeding into the existing `PageOperations.create()`, not a new write path.

**Architectural goal:** an ingestion adapter (audio → transcription → structured markdown) that produces content and calls `PageOperations.create()` exactly like any other creator — no new Gate operation kind needed, since the output is just markdown content.

**Dependencies:** none architectural; depends on a transcription capability (product/ML decision, not covered here).

**Size:** M–L depending on transcription approach (local model vs. API-based).

**Risks:** privacy/data-handling for audio content, likely the dominant design concern, not the vault integration itself.

---

## 2. Knowledge Platform

### Why this belongs after v1.0

`Vault.knowledgeGraph()`/`.embeds()` are already lazy, tested, and unconsumed (Phase 6/ADR-016) — the *mechanism* for this section already exists ahead of any UI. This section is about giving that mechanism real consumers, plus extending it toward search and AI-oriented indexing, while keeping parsing, indexing, querying, and presentation in their existing four separate layers (Ingest → Vault/knowledge → VaultQuery → UI) rather than inventing a fifth.

### Backlink/Reference Indexing

**Why after v1.0:** `KnowledgeGraphBuilder`/`LinkResolver`/`PageIndex` (`vault/knowledge/`) are already built and tested from the pre-migration codebase — ADR-004 explicitly kept them as a bet on exactly this future feature. This is the cheapest item in this entire section.

**Architectural goal:** define what "a backlink" means in product terms against the existing `KnowledgeGraph` structure (likely: pages whose `analysis.links` reference the current page), then expose it through `VaultQuery` — a new method like `getBacklinks(pageId): Page[]` or `getReferenceSummary(pageId): ReferenceSummary[]`, matching `Reference.tsx`'s existing prop shape so the UI-wiring step (below) is nearly mechanical.

**Dependencies:** none beyond what's already built.

**Size:** S–M.

### Reference UI Wiring

**Why after v1.0:** `Reference.tsx` was deliberately kept, not deleted, in Phase 6/ADR-016 specifically for this. This is the direct payoff of that decision.

**Architectural goal:** `Page.tsx`/`PageHost.tsx` call the new `VaultQuery` method and pass real data into `Reference.tsx` — no new component logic, since `Reference.tsx` is already a correct, tested presentation component waiting for real props.

**Dependencies:** Backlink/Reference Indexing (above).

**Size:** S.

### Knowledge Graph Evolution (graph visualization, richer link semantics)

**Why after v1.0:** a visual graph view is a genuinely new UI surface, not just wiring an existing component — it belongs after the basic backlink feature proves the data layer is right.

**Dependencies:** Backlink/Reference Indexing.

**Size:** L.

**Risks:** performance at scale (a large vault's full link graph rendered as a visual graph is a real rendering-performance problem, separate from the already-solved data-layer performance question).

### Semantic Search

**Why after v1.0:** this is a genuinely new kind of projection — not a re-derivation of existing extracted data (like tags/tasks/embeds), but a new artifact (embeddings) requiring a new generation step (calling an embedding model). It doesn't fit the existing `VaultProjectionBuilder` pattern cleanly and needs its own decision.

**Architectural goal, framed as an open question for its own future ADR:** does semantic search live as a new lazy `Vault` projection (same invalidate-on-mutation, rebuild-on-access shape as `knowledgeGraph()`/`embeds()`), or as its own peer subsystem (`vault/search/`) given embedding generation is a heavier, possibly-async, possibly-external-service-dependent operation that doesn't fit the "rebuild synchronously on next access" assumption the existing lazy-projection pattern makes? This roadmap does not resolve that — it flags it as the first real design decision semantic search needs, deliberately not answered here.

**Dependencies:** none architectural, but a real product decision on local-vs-API embedding generation, which affects the design above materially.

**Size:** L–XL.

**Risks:** the biggest new *kind* of complexity in this roadmap — sync/consistency between vault content and a potentially-async external embedding step is a different problem shape than anything the current lazy-projection pattern was designed for. Recommend a dedicated design spike (not full implementation) before committing to an approach.

### Future AI-Oriented Indexing

**Why after v1.0:** builds directly on whatever Semantic Search's infrastructure turns out to be (structured extraction, entity indexing, summarization) — sequencing after it, not before, avoids building a second indexing pipeline in parallel.

**Dependencies:** Semantic Search.

**Size:** L, highly dependent on Semantic Search's final shape.

---

## 3. Vault Evolution

### Why this belongs after v1.0

Every item here extends `Vault`, the Persistence Gate, or `Workspace` — the three most foundational, most-depended-upon subsystems in the frozen architecture. Extending them now, against a stable base, is safer than it would have been mid-migration, but each item still needs its own careful design pass given how much depends on these three.

### `.folder.md` Write Support

**Already precisely scoped in ADR-015:** read side (scanning, parsing, domain mapping onto `Folder.metadata`) is complete. Write side does not exist — no Gate operation kind, no `FolderOperations` method.

**Architectural goal:** a new `PersistenceOperation` kind (e.g., `{kind: 'update-folder-metadata', ...}`) and a matching `FolderOperations` method, following exactly the pattern `PageOperations.archive()`/`.restore()` already established — new write path avoided by construction, since it's the same Gate.

**Dependencies:** none beyond the existing Gate/FolderOperations shape.

**Size:** M.

### Root Metadata

**Open design question, not resolved here:** `Folder` currently requires an `id`/`parentId`/`path` the vault root doesn't have (`VaultBuilder`'s own code comment: "the root itself is not a navigable Folder in the domain model"). Two viable shapes exist — (a) model the root as a special, zero-parent pseudo-`Folder`, or (b) a separate `VaultMetadata`/root-level concept parallel to but distinct from `Folder`. This roadmap deliberately does not choose; it needs its own ADR when scheduled, informed by how `.folder.md` write support (above) actually ships.

**Dependencies:** `.folder.md` Write Support (informs which shape is less disruptive).

**Size:** M, but genuinely uncertain until the design question above is resolved — could be S if option (a) proves clean, could be L if it requires touching every `Folder`-typed call site.

### Progressive Adoption

**Already true on the read side** — the scanner already tolerates folders with no `.folder.md`. Write support (above) needs the same discipline: never force a `.folder.md` file into existence for a folder that has no metadata to store, matching the "folders without `.folder.md` remain valid" requirement.

**Dependencies:** `.folder.md` Write Support — this is a design constraint on that work, not a separate item.

**Size:** folded into `.folder.md` Write Support's estimate above.

### Folder Persistence (workspace-level, distinct from `.folder.md`)

**Clarifying a naming ambiguity:** this is *not* about `.folder.md` (folder content metadata, above) — it's about persisting `Workspace`-level UI state (which folders are expanded, sidebar width, etc.), the same `.clutter/workspace.json` extension point `architecture-specification.md` §10 already names as intentionally deferred: *"decide deliberately if/when this becomes a product requirement; don't half-build it speculatively."*

**Architectural goal:** a `WorkspaceSnapshot` serializer reading/writing through `VaultFileSystem` (not the Gate — this is app infrastructure, not Vault domain content, per the Gate's scope clarification from the Architecture v1.0 audit) at session boundaries.

**Dependencies:** none.

**Size:** S–M.

### Workspace Active-View Model

**The single most consequential item in this section.** `Workspace` currently models exactly two states (`activePageId`/`activeFolderId`, mutually exclusive by invariant) — no room for "viewing Favorites" or "viewing All Tasks." This is the exact gap that blocked the 6 `NavigationRouter` stubs deleted in Phase 4 (ADR-014), and directly unblocks several Section 4 product features (Favorites, future navigation improvements).

**Architectural goal:** replace the two-separate-optional-fields shape with a single tagged union — something like `activeView: { type: 'page'; id: string } | { type: 'folder'; id: string } | { type: 'filtered-view'; view: FilteredViewKind }` — requiring a real spec §10 amendment (an ADR, following the same process Phase 4 used to amend the Startup sequence when the frozen spec itself needed correcting).

**Dependencies:** none technically, but should be designed *with* Favorites/future-navigation in mind (Section 4) so it isn't redesigned again immediately after shipping.

**Size:** M for the `Workspace` change itself; each view it enables (Favorites, All Tasks, etc.) is separately sized in Section 4.

**Risks:** this is a spec amendment to a subsystem every other subsystem reads (`Workspace` is depended on by the application layer and UI per the frozen dependency diagram) — needs the same care Phase 4's Startup-sequence amendment got: verify it first, don't assume the two-state shape was arbitrary rather than deliberate before changing it.

---

## 4. Product Features

### Why these are product features, not architecture

Every item below either already has its architectural foundation built (just needs UI/product work) or depends on exactly one Section 1–3 item being done first. None require a new subsystem of their own.

| Feature | Architectural foundation | What's actually needed |
|---|---|---|
| **Rename** | Spec §5 already lists `{kind: 'rename', title}` as a `PersistenceOperation` member — the frozen contract already committed to this shape, it was just never built (ADR-011/012). | New Gate operation kind + `PageOperations.rename()`, following the spec's own already-written signature. **Size: S.** Lowest-risk item in this entire roadmap — the design decision is already made. |
| **Move destination picker** | `PageOperations.move()` has existed and been tested since Phase 3. | A folder-picker UI component — the first modal/dialog primitive in the component library (confirmed zero exist today). **Size: M**, entirely UI work. |
| **History** (back/forward) | `Controls.tsx`'s two buttons are the placeholder, already honestly `disabled` (Architecture v1.0 audit). | New `Workspace` navigation-history state (a stack, most likely) + wiring. **Size: M.** |
| **Favorites** | `VaultQuery.getFavoritePages()`/`.getFavoriteFolders()` already exist and match spec §3 exactly. | The Workspace Active-View Model (Section 3) — favorites has the query layer ready and nowhere to render into. **Size: S once the view model exists.** |
| **Sidebar collapse** | `Controls.tsx`'s sidebar-toggle button is the placeholder, already honestly `disabled`. | A `Workspace.sidebarCollapsed` boolean + wiring — does *not* need the Active-View Model, simpler than Favorites. **Size: S.** |
| **Templates** | The `Templates` reserved folder already exists (`ReservedResources.ts`). | A "create from template" flow — likely a `PageOperations.create()` option (`templateId?`) or a small adjacent method, plus UI. **Size: M.** |
| **Future navigation improvements** | Depends on Action Registry (Section 1) + Active-View Model (Section 3) existing for a coherent foundation. | Not yet specified — genuinely future work. **Size: unassessed**, deliberately not estimated further than "depends on the two prerequisites above." |

---

## 5. Developer Experience

### Why this belongs after v1.0

Every rule this section formalizes was already correct *policy* throughout the migration — code review carried the enforcement burden the whole time (explicitly, per every rule's own "How it is enforced" section: "Ideally backed by an ESLint... rule... this project has used ESLint architectural-boundary enforcement before, and should again"). Building the tooling now, against a frozen, stable target, avoids the churn of building lint rules against a shape still changing weekly.

### Architecture ESLint Rules / Dependency Enforcement

**Architectural goal:** mechanically enforce what code review has enforced by hand for all 16 phases/ADRs of this migration — rules 2, 3, 6, 7, and 10 specifically (Gate-only writes, Vault-mutation-only-from-Gate/Sync, no UI construction of application-layer services, downward-only dependencies, path logic confined to `VaultPath`). `docs/adr/015...`/`016...` both flagged this as deferred, never built.

**Size:** M for a first working config covering all 5 rules; ongoing maintenance cost as new folders are added.

**Risks:** low — this is enforcing already-agreed rules, not proposing new ones. The only real risk is false positives blocking legitimate work if the rule config is too strict too fast; recommend warn-not-error initially.

### Performance Tooling / Benchmarking

**Why now:** several architecture decisions in this migration (making `knowledgeGraph()`/`embeds()` lazy, keeping `tags()`/`tasks()` eager) were made on reasoned-but-unmeasured assumptions about cost. Now that the shape is stable, it's worth validating those assumptions with real numbers rather than continuing to reason from first principles.

**Architectural goal:** benchmark harness for vault-scan time at realistic scale (thousands of pages), Gate throughput under concurrent per-page operations, and lazy-projection rebuild cost — the three places this migration made a performance-motivated architectural call without measurement.

**Size:** M.

### Documentation Maintenance

**The meta-point worth stating plainly:** documentation rot was the root cause the original assessment found (`architecture-assessment.md`) — stale docs describing a codebase that no longer matched them, for months, unnoticed. This migration accumulated 16 ADRs precisely to avoid repeating that. As roadmap items above ship, the same discipline needs to continue: **every implemented roadmap item should get a divergence report, per `implementation-rules.md`'s existing process, the moment it diverges from what this document describes** — not left to accumulate silently the way the pre-migration docs did.

**Recommendation:** a periodic (e.g., per-quarter) ADR consolidation pass — not rewriting history, but reviewing whether any "Accepted" ADR needs a formal "Superseded by" marker as new decisions supersede old ones, keeping the ADR index navigable rather than an ever-growing flat list.

**Size:** ongoing, small recurring cost rather than a one-time project.

### Testing Improvements

**Architectural goal:** property-based testing for `Vault`'s own invariants (duplicate-id rejection, path/id map consistency — already the "highest-value tests in the whole codebase" per spec §3's own testing strategy, worth strengthening further); an integration test harness for the Composition Root's currently-untestable Tauri-backed parts (`Application.test.ts`'s own comment: `bootstrap()`'s Platform construction "cannot run under vitest" — true since before this migration and still true).

**Size:** M–L depending on how deep the Tauri-integration-testing investment goes.

---

## 6. AI Readiness

### Why this belongs after v1.0, and why it's last

AI agent integration is the capability area with the highest blast radius if the architecture underneath it is wrong — an agent operating through a fragmented, multi-write-path system (the pre-migration state) would have been actively dangerous, not just architecturally messy. Sequencing this after the capability layer is unified, and after Section 1's Action Registry exists, is a safety property, not just a convenience.

### What the Current Architecture Already Provides

Worth stating explicitly, since it's the actual answer to "how AI-ready is v1.0": every capability an agent would need to call already has exactly one owner, one write path, and (once the Action Registry exists) one discoverable, schema-described entry point. This is a materially better starting position than most codebases reach *after* trying to bolt on AI integration — the migration's actual payoff for this section is that there's nothing to untangle first.

### AI Agents / Tool Execution / MCP

**Covered architecturally in Section 1** (Action Registry, MCP Integration). The AI-specific concern layered on top: **write actions need a different trust posture than read actions.** A schema-described action is necessary but not sufficient for agent safety — recommend a distinct "requires confirmation" or "dry-run capable" flag on Action Registry entries, checked by the MCP/agent-facing layer specifically (not by `PageOperations` itself, which would be a rule-5 violation — business-policy-adjacent trust decisions belong in the entry point that serves the agent, not smuggled into the facade).

### Context Providers / Semantic Memory

**Depends on Section 2's Semantic Search and Backlink Indexing.** An agent's "context" for a vault is fundamentally a query over the same `VaultQuery` surface everything else uses, possibly extended with the semantic-search results Section 2 would add — not a separate memory subsystem. Recommend resisting the temptation to build a parallel "AI memory" index distinct from the Knowledge Platform's own indexing — that would be exactly the kind of duplicate-ownership problem (Rule 4: "never duplicate a business rule / index across files") this whole migration exists to prevent.

### Multi-Step Workflows

**Overlaps with Section 1's Automation**, with one additional, AI-specific risk worth flagging on its own: an agent chaining several write actions (e.g., "reorganize my notes") without a human-in-the-loop checkpoint is a product-safety question with architectural implications — likely needs a transaction-like grouping concept (a way to review or roll back a multi-step agent-initiated change as a unit) that neither the current Gate nor the proposed Action Registry provide today. **This is flagged as an open design question requiring its own dedicated design pass before AI-driven multi-step workflows ship — not something to improvise at implementation time.**

### Architectural Preparation Recommended *Before* AI Capabilities Are Built

In priority order:
1. **Action Registry** (Section 1) — without it, every AI integration reimplements action dispatch independently.
2. **A confirmation/dry-run concept for write actions** (above) — a genuine gap in the currently-planned architecture, not yet designed anywhere in this roadmap or the frozen spec.
3. **Section 2's Backlink Indexing + Semantic Search** — context quality for an agent is bounded by what the Knowledge Platform can actually surface.
4. **A rollback/grouping concept for multi-step changes** (above) — the least-defined item in this entire roadmap; recommend a dedicated design spike, not a sizing estimate, since the shape of the problem isn't yet clear enough to size.

---

## Cross-Section Dependency Map and Recommended Sequencing

Several items recur as prerequisites across sections. Rather than sequence section-by-section, sequence by actual dependency:

**Tier 0 — foundational, unlocks the most downstream work:**
- Action Registry (§1) — prerequisite for MCP, Automation, CLI polish, Future navigation, and all of §6.
- Workspace Active-View Model (§3) — prerequisite for Favorites and Future navigation improvements (§4).
- Architecture ESLint rules (§5) — no dependencies, safe to start anytime, best done early while the rule set is fresh from this migration.

**Tier 1 — cheap, already-unblocked product wins (no new subsystem, existing foundation ready):**
- Rename (§4) — spec already specifies the shape.
- Sidebar collapse (§4).
- Backlink/Reference Indexing + Reference UI Wiring (§2) — the data layer already exists.
- Move destination picker (§4) — backend ready, needs UI only.

**Tier 2 — platform surface (needs Tier 0's Action Registry):**
- `PluginAPI` (§1).
- `.folder.md` write support (§3) — independent of Tier 0, can run in parallel.

**Tier 3 — platform consumers (need Tier 2's `PluginAPI`):**
- Public API (§1).
- CLI, polished (§1) — minimal CLI is actually Tier 1-cheap; polish depends on Action Registry.
- MCP Integration (§1).

**Tier 4 — external/higher-risk consumers (need Tier 3's Public API):**
- Browser extension, macOS capture extension (§1).
- Automation (§1).
- Favorites, History (§4) — need Tier 0's Active-View Model.

**Tier 5 — largest, most open-ended investments:**
- Plugin SDK, full (§1).
- Semantic Search (§2) — needs its own design spike before sizing further.
- Knowledge Graph Evolution (§2).
- Root Metadata (§3) — needs `.folder.md` write support done first to inform the design choice.

**Tier 6 — AI, deliberately last:**
- MCP tool safety design, confirmation/dry-run concept (§6).
- Context providers / semantic memory (§6) — need Tier 5's Semantic Search.
- Multi-step workflow rollback design (§6) — the one item in this roadmap recommended as a design spike before any sizing commitment.

**Continuous, not gated on any tier:** Documentation maintenance, testing improvements, performance tooling/benchmarking (§5) — should run alongside every tier above, not wait for a "right time."

---

## What This Roadmap Deliberately Does Not Do

- It does not implement anything.
- It does not resolve the two flagged open design questions (Root Metadata's shape, Semantic Search's subsystem placement) — both need their own dedicated design pass, informed by decisions made closer to when they're actually scheduled.
- It does not commit to exact timelines — sizes are relative (S/M/L/XL), not scheduled, since a 10–30 year horizon makes calendar estimates meaningless this far out.
- It does not treat any item here as already approved for implementation. Each one still needs the same pre-implementation discipline (`implementation-rules.md` §1) this migration used for every commit across all 16 ADRs: name the phase or scope, name the affected subsystems, name the invariants, state the smallest correct change — before any code is written.
