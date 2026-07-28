# Arc 5 — Final Architecture Validation

This is the final validation pass before Arc 5 implementation begins. It does
not redesign anything. It re-verifies the two prior Arc 5 documents
(`Page UI Architecture.md`'s in-line review, and `Arc 5 Questions.md`)
against the repository, with a wider trace than either — specifically into
the persistence/editing path, which neither prior document exercised in
depth.

New evidence found in this pass that changes the picture: `SaveCoordinator
.beginSave()/completeSave()` do not write anything — the class's own comment
says "Actual file writing will be introduced later." `VaultFileSystem
.writeFile` is real and working, but its only caller is `DailyNoteService`
creating a brand-new file; nothing in the codebase ever writes an *edit*
back to disk. `IdentityResolver` derives a page's ID from its file path when
frontmatter has no `id` — which contradicts `Page`'s own doc comment ("This
identifier remains constant even if the page is renamed or moved") the
moment such a page is renamed. `FrontmatterSerializer` does naive
`key: value` string joining with no escaping and no array support. These are
stated up front because they drive most of the CRUD findings below.

---

## Philosophy vs. implementation, checked claim by claim

| Principle | Status | Evidence |
|---|---|---|
| Markdown is the source of truth | **Partially true** | True for read/build (`VaultScanner` → `VaultBuilder`). False for write — nothing persists an edit back to Markdown yet, so the in-memory `DocumentSession` is currently the only place anything typed exists, and it isn't durable. |
| Vault owns user knowledge | **True** | `Vault` is a pure immutable snapshot with no filesystem or UI coupling. |
| Workspace owns transient navigation state | **True** | `activePageId`/`activeFolderId`, `Observable`, no content — confirmed. |
| DocumentSession owns editing state | **Correct in shape, unused in practice** | `commit()`/`DocumentRevision`/`DocumentState` are well-designed, but nothing in the app calls `session.commit()` — every `onCommit` in every page model still `throw`s `Not implemented`. An unused correct abstraction hasn't been proven yet. |
| Business logic lives outside React | **True** | No component reaches into `Vault`/`VaultFileSystem` directly; `PageHost` is the only component touching `Application`. |
| Rendering should be as reusable as practical | **In progress** | Layer-1 primitives are reusable; Layer-2 (`TopBar`/`Description`) duplication is flagged (twice, across both prior documents) but not yet fixed in code. |
| Composition over duplication | **Mixed** | Title composition (editable vs. derived) is a real example of it working. TopBar/Description are duplication wearing composition's clothes. |
| Build abstractions from evidence, not prediction | **True so far** | Both prior reviews correctly resisted inventing `CollectionPage` from one example (Folder). This document finds no new evidence to accelerate that decision either. |

---

## Compared against mature desktop applications

VS Code's text-document model and Obsidian's vault abstraction separate the
same three things Clutter separates on paper: an immutable read model
(Vault), an editable buffer (DocumentSession), and a persistence coordinator
(SaveCoordinator). That's the right shape — Clutter is not reinventing
something those tools intentionally avoided.

Where they diverge: in VS Code, a `TextFileEditorModel` is always backed by
a real save pipeline from the moment it can go dirty — dirty-tracking and
persistence are introduced together, because a buffer that can go dirty but
never saves is a silent data-loss trap for whoever wires up typing next.
Clutter has built the dirty-tracking scaffolding (`DocumentState`, `isDirty`)
a full layer ahead of the thing that makes it safe (`SaveCoordinator` never
calls `writeFile`). That ordering is the inverse of how VS Code/Obsidian
sequenced it, and it's exactly why `EditableText`'s commit-on-blur already
fires real committed text into handlers that throw.

Also absent versus every app in that comparison set: none of them derive a
document's stable identity from a mutable path the way `IdentityResolver
.resolve()` falls back to `path` when frontmatter has no `id`. VS Code's
identity (URI) updates in lockstep with rename as a first-class operation;
Obsidian assigns a path-independent ID for exactly this reason. Clutter's
fallback is fine for a page whose frontmatter already carries an ID — but
it's a latent identity break the moment Rename or Move ships for any page
that doesn't (any page created by hand outside the app, or before `PageCreator`
is wired up universally).

---

## Rendering-by-model: where it holds, where it breaks

Confirmed still standing: collapsing `TopBar`/`Description` into model-driven
primitives is correct and low-risk, as concluded previously. New finding from
tracing the write path: rendering-by-model implicitly assumes a model is
cheap to recompute and side-effect-free — true for `title`/`description`
(pure string reads), false the moment an `actions: ActionModel[]` needs to
reflect `session.isDirty`, `session.state`, or an in-flight save.
`toNotePageModel` is called as a plain function inside `PageHost`, not a
subscribed hook — `Workspace` has `subscribe()`, `DocumentSession` does not.
A dirty indicator, save spinner, or conflict banner rendered from a model
built this way would never update. This isn't a hypothetical: it's the
mechanism every editing-status UI in the roadmap would need.

---

## Editing architecture — actual state, not intended state

| Responsibility | State |
|---|---|
| Typing | Not wired — `NoteBody` renders `markdown` as static text, not an editor. |
| Committing an edit | `DocumentSession.commit()` exists and is correct, but is never called. |
| Autosave / debounce | No timer or debounce utility exists anywhere in the repo. |
| Dirty state | Correctly modeled (`isDirty`), read by nothing. |
| Save failures / conflict | `DocumentState.Conflict`/`SaveError` are declared enum members with no transition into them anywhere. |
| Undo / redo, history | No code. `DocumentRevision` is structurally undo-friendly (immutable, numbered), but `DocumentSession` only retains `_currentRevision`/`_savedRevision`, not a history list — undo needs that list and it doesn't exist. |
| Reopening documents | `DocumentRegistry.open()` correctly returns an existing session instead of clobbering it. |
| Switching while dirty | **Real, reachable bug:** `PageApplicationService.closePage()` calls `documentRegistry.close(pageId)` unconditionally, with no dirty check. Closing a page with unsaved edits today silently discards them. |
| Multiple open documents | Data structures (`Workspace.openPageIds`, `DocumentRegistry` keyed by page ID) already support this — only a tabs/split UI is missing. The one area where the architecture is ahead of the feature, correctly. |

Would VS Code/Obsidian evolve toward this division of labor? Yes,
directionally — buffer/session vs. read-model vs. save-coordinator is the
right split. What they would not do is ship the state machine and the UI
affordance before the save path behind it exists. **Before Arc 5
implementation starts:** give `SaveCoordinator` a real `writeFile` call and
make `DocumentSession` observable, or every CRUD feature built afterward
inherits an editing foundation that looks finished and isn't.

---

## CRUD walkthrough

For each operation: participating layers, correct home for the logic, and
what's actually missing today (not what's intended).

- **Create Page** — `PageCreator` → `VaultFileSystem.writeFile` → Vault
  update → `Workspace.openPage`. *Gap:* `VaultBuilder` only runs once at
  startup; there is no "insert one page into an already-built `Vault`"
  method. Create requires either a full rebuild or a new `Vault.addPage()` —
  a real, currently nonexistent API.
- **Rename Page** — should touch `Page.name` and frontmatter, not `Page.id`.
  *Gap:* the `IdentityResolver` path-fallback (above) makes this unsafe for
  any page without a frontmatter `id` — Rename must backfill an `id` first,
  or the identity contract is already broken for that page.
- **Delete Page** — `VaultFileSystem` has no `deleteFile`/`remove` member at
  all. Not a missing implementation — a missing interface member.
- **Move Page** — changes `parentId` + `path`; `parentId` is resolved once
  at build time from directory structure in `VaultBuilder`, so Move needs
  the same Vault-mutation capability Create needs.
- **Duplicate Page** — composition of Create + Read; blocked by the same gap
  as Create.
- **Update Markdown** — the most complete path today:
  `DocumentTransaction` → `DocumentSession.commit()` →
  (missing) `SaveCoordinator.beginSave → writeFile → completeSave`. Closing
  the `SaveCoordinator` gap unblocks this and Autosave at the same time —
  they are the same gap wearing two names.
- **Update Metadata / Favorite / Archive / Restore** — frontmatter writes via
  `FrontmatterSerializer`. *Gap:* the serializer's naive `key: value` join
  will corrupt values containing `:` or newlines and cannot represent
  `tags: [a, b]` as an array — this surfaces the moment Tags follows
  Favorite through the same serializer.
- **Create/Rename/Delete/Move Folder** — same Vault-mutation gap as Page,
  plus: `FolderApplicationService` has no session concept at all — confirms
  the prior finding that Folder isn't a Page today, and Folder CRUD needs
  its own lifecycle story rather than reusing Page's.
- **Assign / Remove Tag** — `TagOccurrence` is derived from page content at
  build time by `TagExtractor`/`TagBuilder`, not stored as standalone
  assignable state. "Assign a tag" means editing the Markdown/frontmatter,
  then re-deriving the index — there is no `Vault.assignTag()` and there
  shouldn't be one that bypasses Markdown. This is a case where "Markdown is
  the source of truth" gives a clean, non-obvious answer.
- **Create Template** — no `PageType` value for `'template'` exists
  (`PageType = 'note' | 'daily-note'` only). Needs an explicit decision
  (new `PageType` vs. a metadata flag) made once, not left to the first
  implementer.
- **Autosave** — not a new layer; a debounce wrapper around the same
  `commit()` → `SaveCoordinator` path Update Markdown needs. Once that path
  is real, Autosave isn't a feature, it's a timer — a good sign.
- **Batch operations** — no multi-op transaction boundary exists at the
  Vault or filesystem level; each operation above is independent, so a batch
  delete of 50 pages today has no atomicity story. Not urgent, but should be
  named as unaddressed rather than assumed to fall out for free.

---

## Boundaries — validated or challenged

- **Domain vs. presentation, structure vs. content, ViewModel/action
  ownership** — validated by this deeper trace; no new evidence contradicts
  `Arc 5 Questions.md`. Still durable.
- **PageHost's responsibility** — challenged. It currently does three jobs
  (workspace read, model construction, dispatch) with no session
  subscription, and it silently discards `session` (`void session`). It
  needs the dispatch registry already recommended, and it needs to re-render
  on `DocumentSession` changes — otherwise every editing feature built on top
  inherits its staleness.
- **Page lifecycle** — not defined anywhere as a state machine for when a
  `DocumentSession` is created vs. reused vs. disposed under Move/Delete/
  rename-mid-edit. `DocumentRegistry.close()`'s missing dirty check (above)
  is a symptom of this boundary not being written down yet.

---

## Architectural invariants ("the constitution")

- **Every feature must reuse:** `Page`/`PageTopBar`/`PageTitle`/
  `PageDescription`/`PageBody` (Layer 1); the `Application` → service →
  `Vault`/`Workspace`/`DocumentSession` request flow; `VaultFileSystem` for
  all disk I/O (never a direct Tauri FS call from a feature).
- **Every feature may specialize:** its Body renderer, its view-model
  mapper, its action list contents, whether its Title is editable.
- **Never duplicated:** a Layer-2 wrapper whose only variance is which data
  module it imports.
- **Never moves between layers:** business logic stays out of React;
  persistence decisions stay in `SaveCoordinator`, not `DocumentSession`;
  identity resolution stays in `VaultBuilder`, not components.
- **A new feature should almost never require:** a new Layer-1 primitive, a
  new Application-layer request-flow shape, or a new `VaultFileSystem`
  method for something `readFile`/`writeFile` already covers.
- **A new feature will still currently require:** a new `to*Model` mapper,
  possibly a new Body, and — until the Vault-mutation gap is closed — some
  way to get its data into `Vault` at all.

---

## Future-feature test

An engineer implementing these in two years, using only what exists today:

- **Favorites** — `Page.metadata.favorite`/`Folder.metadata.favorite`
  already exist. Needs a query (`vault.getFavorites()`, mirroring
  `vault.notes()`), a view reusing `Entry` the way `FolderBody` does, and a
  toggle wired through a small new service calling a (currently missing)
  metadata-write path. `Page.tsx`, `PageHost`'s registry, and every Layer-1
  primitive stay untouched.
- **Archive / Restore** — same shape; the `Archive` reserved folder already
  exists on disk (`ReservedResources.ts`) — evidence this was already
  anticipated.
- **Recent** — a query sorted by `updatedAt` (already a field), same
  Entry-list body as Folder. Cheapest of the five.
- **Templates** — needs the `PageType` decision named above first. A real
  new domain concept, correctly out of scope for a rendering refactor to
  pre-solve.
- **Smart Collections** — needs a rule-evaluation layer (filter by tag and
  date range) that doesn't exist. Genuinely new domain logic, not a
  rendering-architecture gap.

Four of five require zero rendering-architecture changes — the stated Arc 5
goal is met for those. Templates and Smart Collections require new domain
concepts, which is expected and appropriate; a rendering architecture
shouldn't try to predict a rule engine that doesn't exist yet.

---

## Five-year review

**Will age well:** the Vault/Workspace/DocumentSession separation; the
demonstrated discipline (twice, across both prior documents) of refusing to
build `CollectionPage` from a single example; `VaultFileSystem` as an
interface rather than a direct Tauri dependency scattered through the app.

**Likely technical debt if unaddressed now:** the path-derived ID fallback
in `IdentityResolver` (silent identity breakage on rename — very hard to
debug once it's someone else's bug 18 months from now); the naive
frontmatter serializer (fine until the first array-valued field, i.e. Tags);
`DocumentRegistry.close()`'s missing dirty check (silent data loss,
reachable today, invisible only because nothing types text yet to lose).

**Premature, rightly avoided:** `CollectionPage`, `CollectionModel`, an
`activeEntityId` unification of Workspace — all correctly deferred; this
pass found no new evidence to accelerate them.

**Missing and worth naming now, not later:** a documented decision on
`PageType` extension for Template; a `Vault` mutation API (or an explicit
"Vault is rebuilt, never mutated" decision — either is fine, but it's
currently undecided by omission, not by design); `VaultFileSystem
.deleteFile`.

**What to change today to avoid regret:** close the `SaveCoordinator` →
`writeFile` gap and make `DocumentSession` observable *before* CRUD feature
work starts, not alongside the first feature that needs it. Every CRUD
operation above assumes a working write-and-re-render path; building five
features on top of a save path that's still a stub multiplies the eventual
fix instead of paying it once.

---

## Final assessment

If Arc 5 ships only the rendering de-duplication already recommended
(collapsing `TopBar`/`Description`, adding `PageHost`'s dispatch registry),
the rendering layer — the explicit subject of Arc 5 — is genuinely close to
done. But rendering was never the part of this codebase carrying the most
risk. The editing/persistence path (an unobserved `DocumentSession`, a
no-op `SaveCoordinator`, a path-fallback identity scheme that contradicts its
own documented invariant, an unescaped frontmatter serializer, no dirty-check
on close) is where a new engineer implementing "business capabilities" will
actually hit redesign work. That risk is currently invisible only because
nothing types text yet — it stops being invisible the moment the first
`onCommit` stops throwing.

**Maturity score: 5/10.** The rendering layer is trending toward an 8 once
the identified de-duplication lands. But architecture maturity has to be
scored on the whole system this validation was asked to cover, and the
editing/persistence foundation — the thing every CRUD feature in the roadmap
sits on top of — is still at prototype-with-known-gaps: a save path that
doesn't save, a session that doesn't notify, an identity scheme that doesn't
uphold its own contract, and a serializer that will corrupt the first
non-trivial field it's asked to write. None of these require redesigning the
rendering architecture, which is why they weren't visible from a UI-focused
review — but they need to be fixed before Arc 5 is called "done," or the
next five features (Favorites, Archive, Tags, Autosave, Templates) will each
independently rediscover the same three gaps.
