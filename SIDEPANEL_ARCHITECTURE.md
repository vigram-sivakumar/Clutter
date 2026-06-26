# Side Panel Architecture

## Vision

Create a single, scalable side panel architecture that powers every panel in Clutter while keeping the design system completely independent of application logic.

Supported panels:

- Notes
- Tasks
- Tags
- Daily Notes (Journal view)
- Future panels

---

# Core Principles

1. Design system components never know about Notes, Folders, Tasks or Tags.
2. Application data is independent from UI state.
3. A single rendering pipeline should power every side panel.
4. Panels describe WHAT to render, not HOW to render it.
5. SidePanelItem is the single source of truth for rendering entity types.

---

# Architecture

```text
AppLayout
│
├── selectedItemId
├── activePanel
│
├── SidePanel
│   ├── Section
│   │   ├── UI State
│   │   └── Items
│   │
│   └── Section
│
└── PageLayout
```

## Design System

Reusable UI primitives only.

- ListItem
- ListGroup
- Caret
- Checkbox
- Divider
- Icons

These components never know what a Note, Folder or Task is.

---

# Rendering Pipeline

```text
Panel
    ↓
Section
    ↓
ListGroup
    ↓
SidePanelItem
    ↓
ListItem
```

Only SidePanelItem knows how each entity should be rendered.

---

# Entity Model

Entities are stored independently.

Every entity has its own identity.

Examples:

- Folder
- Note
- Task
- Tag
- Journal

Every entity should contain information such as:

- id
- type
- parentId
- favorite
- title

Entities never contain UI state.

Entities never contain nested children.

Children are discovered by querying:

```text
parentId === currentFolder.id
```

This allows the same entity to appear in multiple views.

---

## Terminology

To keep the architecture consistent:

- Journal is the entity.
- Daily Notes is the panel (view) that displays Journal entities.
- Favorites, Navigation and similar sections are views over entities, not separate entity types.

---

# Sections

A panel consists of predefined sections.

Example:

```text
Notes
├── Navigation
├── Favorites
└── Folders
```

Sections own:

- title
- configuration
- view state

Sections do NOT own entity data.

---

# Favorites

Favorites is NOT another hierarchy.

It is a filtered view of favorite entities.

Example:

```text
Folder A
├── Note 1 ★
├── Folder B ★
│   ├── Note 2
│   └── Note 3 ★
└── Note 4
```

Favorites renders:

```text
★ Note 1
★ Note 3
★ Folder B
    ├── Note 2
    └── ★ Note 3
```

Favorite folders become root entries.

Their children are loaded using parentId.

---

# View State

UI state never belongs to entities.

Examples:

- expanded folders
- collapsed folders
- selected item

## Selection

Owned by AppLayout.

```text
AppLayout
├── selectedItemId
└── activePanel
```

Selecting an item updates:

- SidePanel
- PageLayout

## Expanded State

Expanded state belongs to each Section.

This allows the same folder to be expanded in one section and collapsed in another.

---

# User Interaction

Clicking a row:

- Selects the entity
- Opens the page in PageLayout

Clicking the caret:

- Expands or collapses the folder
- Does not change selection

---

# Caret States

The Caret component supports:

- placeholder
- disabled
- collapsed
- expanded

Rotation is handled entirely in CSS.

---

# SidePanelItem

SidePanelItem is the only component responsible for rendering entity types.

Initially use a simple switch on item.type.

Supported types:

- navigation
- note
- folder
- task
- tag
- journal

Every case ultimately composes a ListItem.

Avoid creating separate renderer files until this component grows large enough to justify extraction.

---

# Implementation Order

1. Finalize entity interfaces.
2. Define Notes panel configuration.
3. Implement SidePanelItem (note and folder first).
4. Render Notes panel end-to-end.
5. Add Tasks.
6. Add Tags.
7. Add the Journal (Daily Notes) panel.
8. Replace local configuration with backend data.

At every stage, verify that new features fit into this architecture rather than changing the architecture to fit the feature.
