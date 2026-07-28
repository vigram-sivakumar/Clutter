# Arc 5 — Architectural Boundary Questions

This follows the Arc 5 architecture review. It answers seven targeted boundary
questions plus a two-year litmus test, all grounded in the current repository
(not the design doc's aspirational sections). Where a question has no clean
answer today, that's stated explicitly rather than resolved by preference.

One clarification on the prior review before the questions: "don't invent
`CollectionPage` until a second Collection instance exists" was never meant to
gate the `TopBar`/`Description` de-duplication — that duplication is real
today, evidenced from one example is enough to prove *duplication*, and should
be fixed in Arc 5 regardless of what happens to `FolderPage`/`TagPage` later.
The two decisions are independent; only the second is gated on more evidence.

---

## 1. Are we organizing by domain or by presentation?

Both, today, at different levels — and that's evidenced in the code, not just
asserted:

- **Top level (`features/notes`, `features/daily-notes`):** organized by
  domain. This is where `toNotePageModel`/`toFolderPageModel` live, and where
  the actual difference between domains shows up — different Vault query
  surfaces (`page.metadata` vs `folder.metadata`), different available
  actions (`rename` exists on `NotePageModel`, not on `FolderPageModel`).
- **Inside each feature's `page/` folder:** organized by presentation slot
  (`*Body`, `*TopBar`, `*PageTitle`, `*PageDescription`) — mirroring
  `app/layouts/page`'s own slot breakdown one level down. This is exactly
  where the duplication lives, because the same slot is being re-declared
  per domain folder instead of being one shared component fed a model.

So the answer isn't "pick one axis" — it's **stop presentation-slot files from
being re-declared per domain folder**. The domain-first top level is doing
real work (it's where behavior actually differs) and should stay. The
presentation-slot duplication one level down should collapse into the
already-existing Layer-1 primitives in `app/layouts/page`, parameterized by
props. Reorganizing the top level around `Markdown`/`Collection` instead of
`Note`/`Folder` doesn't remove a coupling — it moves the same "which domain
provides this model" decision from a file name to a `type` field, and (per
Q6) that decision currently has real unresolved cases (Folder's relationship
to Page) that a rename would paper over rather than resolve.

## 2. Where should view models live?

They should stay where they are — colocated with the feature's page
component (`features/notes/page/note/NotePageModel.ts`, not in
`app/layouts/page`, not in `PageApplicationService`) — but the *pattern*
around them needs to change.

**Why not `app/layouts/page`:** that would make Layer 1 aware of
Note-vs-Folder shape differences, which is the exact thing the design doc's
"never `if (page.type === ...)` inside a primitive" rule exists to prevent.
**Why not `PageApplicationService`:** its job, as written, is session
lifecycle (open/close/get) — it has no knowledge of what a `NotePageModel`
needs to look like, and giving it that knowledge would make it grow a method
per page type, recreating the dispatch problem one layer down.

**What's actually wrong today:** the mappers are plain functions
(`toNotePageModel(page, session, vault, onOpenFolder)`) called inline inside
`PageHost` on every render, not hooks. That's not a style nit — it's a
correctness gap that will surface the moment editing is wired up:
`DocumentSession` has no subscription mechanism the way `Workspace` does
(`useWorkspace` subscribes to `Workspace.subscribe`; nothing subscribes to
`DocumentSession`). Once `commit()` is called for real, nothing will
re-render. The fix suggested in the prior review (`useNoteModel(session)`)
isn't just about locality — it's the seam where that subscription needs to be
added.

## 3. What actually constitutes a new page?

Looking at what genuinely differs between `NotePage`/`DailyNotePage`/`FolderPage`
today, three things vary and one doesn't:

| Axis | Note | DailyNote | Folder | Varies? |
|---|---|---|---|---|
| Body content shape | markdown string | markdown string | list of children | **yes** |
| Title editability | editable (`EditableText`) | derived (`<span>`) | derived (no `onCommit` prop at all) | **yes** |
| Attached to a `DocumentSession`? | yes | yes | no (no session; `FolderApplicationService` has no registry) | **yes** |
| TopBar/menu items | data only | data only | data only | **no — just data** |

Objective criteria, in order of weight: a new Page component is justified when
**the body's content shape differs** (markdown vs. list vs. a future
canvas/database — a rendering-shape difference, not a data-source
difference), **the editing/interaction model differs** (has a commit path vs.
derived-only), or **the lifecycle differs** (has a `DocumentSession` vs. not).
A new Page is *not* justified by different menu items, different icons, or
different breadcrumb sources — those are props on an existing primitive. By
this test, Folder earns its own Page today (fails both the body-shape and
the lifecycle test against Note); Tag or Favorites would need to be evaluated
against the same table once they're real pages, not assumed to pass or fail.

## 4. Can structure and content be formalized?

Yes, and it's already partially true in the code — `Page.tsx` takes
`topBar`/`header`/`tabs`/`body`/`references` as bare `ReactNode` props and
has zero imports from any feature folder. That's the structural layer,
already correctly forever-shared.

| Category | What's in it today | Owner |
|---|---|---|
| Structure | `Page`, `PageTopBar`, `PageTitleSection`, `PageTitle`, `PageDescription`, `PageBody`, `PageCover` | `app/layouts/page` — never imports a feature |
| Content | markdown string render, `FolderBody`'s `Entry` list, future canvas/database renderers | feature `page/` folders — knows its domain |

The formalization worth writing down isn't a new layer, it's a rule already
implied by the evidence: **structure components take `ReactNode`/primitive
props and never import from `features/*`; content components are the only
place a feature import is allowed.** `NoteTopBar` and `FolderTopBar`
currently violate this (they import `mock/*TopBarMenu.ts` directly) — that's
the same violation named in Q1 and the prior review, restated as a rule that
can be linted for, not just reviewed for.

## 5. Where should actions come from?

Not from the Application service, and not from a static import inside the
Layer-2 component (today's `noteTopBarMenu`/`folderTopBarMenu` imports) —
from the view-model mapper, alongside `rename`/`updateDescription`, which
already establishes this pattern.

Reasoning: enabling/disabling and labeling of an action frequently depends on
domain state the mapper already has and the component doesn't — e.g. "Add to
favorite" vs. "Remove from favorite" depends on `page.metadata.favorite`,
which `toNotePageModel` already reads. The Application service should own
*executing* the action (a `favoriteService.toggle(id)` call), the same way it
owns `openPage`/`closePage` today — but *which actions exist, in what order,
with what label* is a view concern, computed once per model build, not a
static per-feature file. This also gives you the seam a future plugin-provided
action would need without touching `PageTopBar` at all — it would just add an
entry to the `actions: ActionModel[]` array the mapper already produces.

## 6. Is there a missing abstraction above Folder?

There's a real hint, but it's not where the hypothesis first looked.

`PageMetadata` and `FolderMetadata` (`core/vault/models/`) already share
`icon`, `cover`, `description`, `favorite` almost verbatim — that's an
existing, measurable structural overlap between Page and Folder in the
domain model itself, not just in the UI. That's evidence *for* a shared
"named, decorated, navigable entity" concept existing somewhere.

But `Tag` doesn't participate in it. The vault-level `Tag`
(`core/vault/models/Tag.ts`) is `{ name: string }` — no icon, no description,
no favorite. The only richer `Tag` shape in the repo (`id`, `title`, `color`,
`isFavorite`) lives in `features/tags/models/Tag.ts` and isn't derived from
the Vault at all — it's a disconnected UI-mock model. So "Folder, Tag,
Favorites are the same kind of thing" is currently true for Folder-and-Page's
*metadata shape* and unverified for Tag, because Tag hasn't grown into that
shape in the domain yet.

**If yes, what should the abstraction be?** Not "Folder becomes a Page" (too
big a jump, and it's not what the shared fields suggest) — the safer,
narrower move the evidence actually supports is extracting the shared
metadata shape (`icon`/`cover`/`description`/`favorite`) into one interface
both `PageMetadata` and `FolderMetadata` extend, independent of whether
Folder ever becomes routable through the same Workspace slot as Page. That's
a small, low-risk change available now; the bigger identity question
(`activePageId`/`activeFolderId` → `activeEntityId`) stays open until Tag (or
another candidate) is built out enough in the domain model to confirm the
metadata overlap generalizes rather than coincides.

## 7. Arc 5 success criteria

Measurable, checkable at the end of the arc:

- **Duplication:** zero Layer-2 components that are byte-identical across
  page types except for an imported data module (today: `NoteTopBar`,
  `FolderTopBar`, `DailyNoteTopBar`; `NotePageDescription`,
  `FolderPageDescription`, `DailyNotePageDescription` — 6 files → 2).
- **Import direction:** no file under `app/layouts/page` imports from
  `features/*`, and no file under `features/*/page/*Body|*TopBar` (the
  presentation-slot files) imports a feature-local data module directly —
  data flows down from the mapper as props, per Q4's rule.
  Since ESLint's `no-restricted-imports` can express directional boundaries,
  encode this rule as a lint rule rather than leaving it as a convention to
  remember.
- **Specialization is justified, not incidental:** every remaining
  domain-specific Page/Body/Title component can point to one of the three
  axes in Q3's table as its reason for existing; anything that can't is
  either fixed or explicitly logged as accepted debt.
- **Models are live, not literals:** `PageHost` no longer discards `session`
  (`void session`); at least one page's `rename`/`updateDescription` calls
  through to `DocumentSession.commit()` instead of throwing
  `Not implemented`.
- **New-view cost is stated, not assumed:** for at least one theoretical new
  view (Tag, Favorites, or Recent — pick one, don't build all), write down
  concretely what files it would require under the post-Arc-5 architecture.
  That answer becomes the baseline the two-year litmus test (below) is
  checked against later, instead of a guess made today.
- **No premature abstraction:** `CollectionModel`/`CollectionPage` do not
  exist unless a second Collection-shaped page (beyond Folder) was actually
  built during the arc — the arc's job is removing incidental duplication,
  not manufacturing evidence for a merge.

## The two-year litmus test, answered honestly for today's code

If Tag became a real page tomorrow, using only what Arc 5 would have fixed:

- **TopBar, Description:** no new file — `PageTopBar`/`PageDescription` fed a
  model built by a new `toTagPageModel`. This part of the litmus test would
  already pass.
- **Title:** probably no new file either, unless Tag titles turn out
  editable (unknown yet — Tags are currently a `name`, not a user-authored
  title).
- **Body and the model mapper:** still a new file each, because Tag's body
  (a list of tagged pages) and its data source (`vault.tags()` +
  cross-referencing `TagOccurrence`) are genuinely different from both Note's
  markdown and Folder's child-list — by Q3's own criteria, this is a
  legitimate new Body, not incidental duplication.

Honest reading: after Arc 5, adding a new view stops requiring a new
`TopBar`/`Description` per view, but does not yet mean "only a data
provider" — the body renderer and the mapper are real, per-view work as long
as each new view's content shape is genuinely new. That's not a failure of
the architecture; collapsing those two would be exactly the premature
`CollectionModel` this document and the prior review both argue against
building on today's evidence. Whether it eventually collapses further is a
question for whenever a *second* list-shaped body (Tag, Favorites) actually
exists to compare against Folder's.
