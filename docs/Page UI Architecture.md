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
Page
│
├── Header
├── Content
└── References
```

Every page is composed from these three sections.

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

# Layer 3 — Pages

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
