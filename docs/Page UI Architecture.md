# Page UI Architecture

## Purpose

Every knowledge object in Clutter is presented through a common page layout.

The page system is composed of reusable UI primitives, feature-specific compositions, and page implementations. The layout itself remains consistent across page types; only the composed sections differ.

---

# Design Principles

- Every page shares the same structural layout.
- Generic components never know about page types.
- Page-specific behavior is introduced through composition, not conditional rendering.
- Layout primitives own structure, not business logic.
- Feature components compose primitives into complete page experiences.
- A page should describe **what** it contains, not **how** it renders.

---

# Architecture

```text
PageRenderer
│
├── Registry
│   └── page.type → Page Component
│
└── Page
    │
    ├── Header
    ├── Content
    └── References
```

`PageRenderer` is the only layer responsible for resolving a page type to its page component. Once a page is selected, it composes the shared layout from Header, Content, and References.

---

# Layer 1 — Primitives

Primitives are reusable UI building blocks.

They never know whether they are rendering a Note, Daily Note, Folder, or any future page type.

Examples:

```text
PageTitleSection
PageIcon
PageTitle
PageDescription
PageMetadata
PageNavigation
PageActions
```

Responsibilities:

- Own layout.
- Own spacing.
- Own accessibility.
- Never contain feature-specific behavior.

---

# Layer 2 — Compositions

Compositions assemble primitives into complete header experiences.

Examples:

```text
NoteHeader
DailyNoteHeader
FolderHeader
TagHeader
```

Responsibilities:

- Choose which primitives are displayed.
- Arrange primitives for a specific page type.
- Introduce page-specific interactions.

Compositions never modify primitive behavior.

---

# Layer 3 — Page Renderer

The page renderer is the only layer that understands page types.

Responsibilities:

- Resolve a page type to a page component.
- Delegate rendering through a registry rather than conditional rendering.
- Provide the composition root for the active page.

Example:

```text
page.type
    │
    ▼
Page Registry
    │
    ▼
NotePage
DailyNotePage
FolderPage
```

---

# Layer 4 — Pages

Pages assemble the complete experience.

Examples:

```text
NotePage
DailyNotePage
FolderPage
```

Example:

```text
NotePage
│
├── NoteHeader
├── MarkdownContent
└── ReferencesSection
```

---

# Shared Sections

## Header

Displays the identity of the current knowledge object.

Possible primitives include:

- Icon
- Title
- Description
- Metadata
- Navigation
- Actions

Each page chooses which primitives it requires.

## Content

Displays the primary representation of the page.

Examples:

- Markdown
- Folder View
- Canvas
- Database
- Timeline

The page layout does not depend on the content implementation.

## References

Displays inbound relationships to the current page.

Initially:

- Backlinks

Future:

- Mentions
- Embeds
- Graph relationships

Pages may choose not to render this section.

---

# Ownership

| Layer              | Responsibility                           |
| ------------------ | ---------------------------------------- |
| Page               | Compose the complete experience          |
| Header Composition | Assemble primitives for a page type      |
| Primitive          | Layout and interaction                   |
| Content            | Render the page's primary representation |
| References         | Display inbound relationships            |

---

# Design Rule

The only place that should know which page type is being rendered is the page composition itself.

```text
NotePage
    ↓
NoteHeader
    ↓
PageTitleSection
    ↓
PageTitle
```

Never:

```text
PageTitle
    ↓
if (page.type === 'daily-note')
```

---

## Composition Rule

Create a feature composition only when it introduces page-specific behaviour.

If two feature components differ only by the data they pass into a primitive, they should be collapsed into a single reusable component.

Examples:

- `NotePageTitle` and `DailyNotePageTitle` remain separate because they behave differently (editable vs. derived).
- Identical wrappers that simply forward different props should become a shared primitive rather than duplicate feature components.

---

# Current vs Future Primitives

## Current

- Page
- PageTitleSection
- PageTitle
- PageDescription
- PageBody
- PageReferences

## Planned

- PageIcon
- PageMetadata
- PageNavigation
- PageActions

Planned primitives represent the intended evolution of the page system and should be introduced only when a concrete page type requires them.

# Architectural Review (2026-07-27)

Verified against the working tree (`Page.tsx`, `PageHost.tsx`, `NotePage`/`DailyNotePage` and their Title/Description/TopBar/Body components), not just this design doc. This section critiques the design above; it does not replace it.

## What's working

The Title/Description composition pattern is doing its job: `DailyNotePageTitle` (no `onCommit`, plain `<span>`) correctly diverges in behavior from `NotePageTitle` (editable via `EditableText`) — a real per-type difference expressed through composition, exactly as intended, with no conditional rendering inside any primitive.

## The missing piece: nothing dispatches on page type yet

The doc's own design rule says the page composition is the only layer that should know its page type — but _something_ still has to decide **which** page composition to render for the active page, and that responsibility doesn't exist anywhere today. `PageHost.tsx` fetches `activePageId` and a `DocumentSession` from the workspace, then discards both (`void session;`) and unconditionally renders `<DailyNotePage />`. Before more page types land, add a small dispatch registry (a `page.type → Component` map, not an if/switch chain) between `PageHost` and Layer 3 — this is also the seam a future plugin-provided page type would need.

## An emerging duplication: not every "Layer 2" component is actually Layer 2

`NoteTopBar` and `DailyNoteTopBar` are byte-for-byte identical implementations — the only difference is which feature's `mock/Breadcrumbs.ts`/`mock/TopBarMenu.ts` module each one imports. `NotePageDescription`/`DailyNotePageDescription` are likewise identical. These aren't per-type behavioral compositions; they're one shared primitive wearing duplicate coats, and the duplication is inside the wrong layer besides — Layer 2 is importing feature-specific data modules directly, when Layer 3 (the only layer meant to know the page type) should be passing that data down as props, the same way title/description already work correctly.

**The test to apply going forward:** if a Layer-2 component would be byte-for-byte identical for a second page type except for which data module it imports, it's a Layer-1 primitive missing a prop, not a Layer-2 composition. Collapse `TopBar`/`*PageDescription` into single data-parameterized primitives now, before Folder/Tag repeat the pattern a third and fourth time. Keep `*PageTitle` exactly as-is — it's the example of the pattern working.

## The page model doesn't exist yet, so its locality question is premature

Every current "model" (`NotePage`'s inline `{ title, description, rename() { console.log(...) } }`) is a disconnected literal recreated on render, not sourced from `Application`/`PageApplicationService`/`DocumentSession`. Once wired up, the right shape is: the underlying data stays application-level (one `DocumentSession` per page, already designed that way on the backend), but each Layer-3 page derives its own narrow, page-type-specific view of it locally (e.g. a `useNoteModel(session)` hook) rather than sharing one app-wide model object or reaching for Context. This keeps "pages own the model" true while not reinventing the source of truth per page.

## Context

Agree with using no Context for page data. The one legitimate future exception is transient, UI-only, cross-cutting state unrelated to page content (e.g. command-palette focus) — not needed today, `useOverlay`'s local-per-component state is correctly scoped as-is. Don't build this ahead of a real need.

## Doc/code drift to reconcile

This document describes primitives that don't exist in code yet (`PageIcon`, `PageMetadata`, `PageNavigation`, `PageActions`) and omits ones that do (`PageCover`/`coverImage`, the `tabs` slot on `Page.tsx`). Reconcile both directions the next time this doc is touched for a new page type, so it stays a description of what's built rather than a mix of built and aspirational.

## Not yet handled, but not currently broken by this design

- **Editing/commands** — every `onCommit` today is a `console.log` stub; nothing calls `DocumentSession.commit()`. The explicit-prop shape is already well-suited to wire to real commits without restructuring once that exists.
- **Multiple editors/split view** — no seam yet for one `DocumentSession` rendered in two `Page` instances at once. Not urgent; matches the backend's own deferred roadmap.
- **Properties/comments/AI** — the `references` slot and this doc's own list of future primitives already leave room; no restructuring needed when these land.
