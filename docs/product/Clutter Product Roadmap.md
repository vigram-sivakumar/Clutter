# Clutter Product Roadmap

## Purpose

This roadmap defines the product direction for Clutter after Architecture v1.1 is frozen.

The focus is building meaningful user workflows on top of a stable knowledge foundation.

---

# Product Vision

Clutter helps users capture, organize, understand, and act on their personal knowledge.

The product should feel:

- Simple
- Fast
- Reliable
- Local-first
- User-owned

---

# Development Principles

Before building features:

- Preserve Markdown ownership.
- Avoid duplicate sources of truth.
- Build on existing Vault capabilities.
- Prefer composable features over isolated tools.
- Solve user workflows, not individual UI screens.

---

# Product Arcs

## Arc 1 — Knowledge Navigation

Goal:

Make finding and understanding information effortless.

Focus areas:

- Folder navigation
- Breadcrumbs
- Favorites
- Recent pages
- Page discovery
- Backlinks foundation
- Navigation polish

Dependencies:

- Vault
- Page identity
- Folder model

---

## Arc 2 — Daily Notes

Goal:

Make daily capture a natural habit.

Focus areas:

- Daily note workflow
- Date navigation
- Templates
- Daily context
- Connections with tasks

Dependencies:

- Page model
- Templates
- Navigation

---

## Arc 3 — Tasks

Goal:

Turn captured thoughts into actionable work.

Focus areas:

- Task extraction
- Task views
- Task status
- Task navigation back to source
- Task organization

Dependencies:

- Markdown parsing
- Page relationships
- Projections

---

## Arc 4 — Templates

Goal:

Make repeated workflows effortless.

Focus areas:

- Template management
- Template insertion
- Daily note templates
- Custom workflows

Dependencies:

- Markdown files
- Page creation

---

## Arc 5 — Search and Discovery

Goal:

Help users find knowledge quickly.

Focus areas:

- Full-text search
- Filters
- Tags
- Related pages
- Knowledge graph exploration

Dependencies:

- Vault index
- Projections
- Page relationships

---

## Arc 6 — Product Polish

Goal:

Make Clutter feel production-ready.

Focus areas:

- Performance
- Accessibility
- Keyboard workflows
- Animations
- Import/export
- External sync improvements

---

# Current Priority

Start with:

## Arc 1 — Knowledge Navigation

Reason:

Navigation is the foundation for every other feature. Tasks, templates, search, and daily workflows all depend on users understanding where information lives.

Before implementation:

Complete the remaining foundation improvement:

- Runtime folder synchronization

Then begin Arc 1 feature development.
