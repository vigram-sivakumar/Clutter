# Naming Conventions

This document defines how files, folders, and exports are named in Clutter. These rules apply to all new code and should be adopted when touching existing code.

The goal is one clear rule per kind of artifact — not a mix of historical patterns.

---

## Quick Reference

| Kind | Convention | Example |
|---|---|---|
| React component | `PascalCase.tsx` | `PageHost.tsx` |
| Hook | `use*.ts` | `useActivePage.ts` |
| Builder | `build*.ts` / `to*.ts` | `buildBreadcrumbs.ts`, `toCollectionPageModel.ts` |
| Registry | `*Registry.ts` | `topBarRegistry.ts` |
| Config | `*.config.ts` | `noteTopBarMenu.config.ts` |
| Model / type | `PascalCase.ts` | `CollectionPageModel.ts` |
| Helper | `camelCase.ts` | `groupByMonth.ts`, `findTodayNote.ts` |
| Feature folder | `kebab-case` | `daily-notes/` |
| Layout namespace | `Parent.Child.tsx` | `Page.TopBar.tsx` |
| CSS (component) | Match component name | `Page.css`, `Button.css` |

---

## 1. React Components → PascalCase

Always. The filename matches the primary exported component.

```
PageHost.tsx
Page.tsx
MarkdownEditor.tsx
CollectionBody.tsx
FolderTree.tsx
NoteTopBarActions.tsx
```

This is the default for any `.tsx` file whose primary export is a React component.

---

## 2. Hooks / Builders / Registries / Helpers → camelCase

Always. Lowercase start, camelCase throughout.

| Category | Pattern | Examples |
|---|---|---|
| Hooks | `use*.ts` | `useActivePage.ts`, `useVault.ts` |
| Builders | `build*.ts`, `to*.ts` | `buildBreadcrumbs.ts`, `toCollectionPageModel.ts` |
| Registries | `*Registry.ts` | `topBarRegistry.ts`, `iconRegistry.ts` |
| Helpers | verb + noun | `groupByMonth.ts`, `findTodayNote.ts`, `getDefaultPageIcon.ts` |
| Render helpers | `render*.tsx` | `renderDailyNotesByMonth.tsx` |

**Rename when touched:** `buildTopBarMenu.ts` → `buildTopBarActions.ts` (it builds actions, not a menu).

---

## 3. Models / Types → PascalCase

Always match the primary export. No kebab-case for model or type files.

```
CollectionPageModel.ts    →  CollectionPageModel
CollectionEntryModel.ts   →  CollectionEntryModel
NotePageModel.ts          →  NotePageModel
FavoriteEntry.ts          →  FavoriteEntry
Breadcrumb.ts             →  Breadcrumb
```

A model file may also export its builder (e.g. `toNotePageModel` in `NotePageModel.ts`) or the builder may live in a separate `to*.ts` file — both are acceptable. Prefer one approach per feature.

Do not use:

```
navigation-item.ts   ✗
tag-colors.ts        ✗  (use PascalCase or move to a constants file with a clear name)
```

---

## 4. Config Files → camelCase + `.config.ts`

```
noteTopBarMenu.config.ts
notesNavigation.config.ts
folderTopBarMenu.config.ts
dailyNoteTopBarMenu.config.ts
```

The config filename describes what it configures. The export inside uses PascalCase or camelCase as appropriate for its shape.

---

## 5. Feature Folders

Feature names represent **capabilities**, not entities, whenever possible.

```
features/
├── markdown/       # presentation capability
├── collection/     # presentation capability
├── notes/          # product capability
├── daily-notes/
├── folder/         # folder-specific behaviour (top bar, commands)
├── search/
├── tasks/
├── tags/
└── calendar/
```

- Use **kebab-case** for multi-word feature folder names.
- Use **lowercase single word** for single-word features.

### Presentation vs product capabilities

Two kinds of features coexist under `features/` today:

| Kind | Examples | Owns |
|---|---|---|
| Presentation capability | `markdown/`, `collection/` | How content is edited or listed |
| Product capability | `notes/`, `daily-notes/`, `tasks/`, `tags/` | A user-facing product experience |

They stay under one `features/` root for now. If the codebase grows substantially, a higher-level split may be introduced. Until then, the distinction is conceptual, not structural.

---

## 6. Internal Feature Structure

Every feature should roughly follow:

```
feature/
├── page/           # page presentation models and builders
├── sidebar/        # sidebar panels and row components
├── navigation/     # tab navigation for the feature
├── topbar/         # top bar actions and menu configs
├── helpers/        # feature-specific helpers
├── models/         # shared types used across the feature
├── commands/       # feature-specific commands (future)
└── editor/         # e.g. markdown/editor/ — capability-specific subfolders OK
```

Not every feature has every folder. That is fine. The rule is: **when a folder exists, it means the same thing everywhere.**

| Folder | Meaning |
|---|---|
| `page/` | Presentation models and builders consumed by `PageHost` |
| `sidebar/` | Sidebar panels and entry rows for this feature |
| `navigation/` | Navigation items shown in the sidebar tab |
| `topbar/` | Top bar actions and overflow menu config |
| `helpers/` | Pure functions used within the feature |
| `models/` | Types shared across sidebar, page, etc. |
| `commands/` | User actions / mutations owned by the feature |

---

## 7. Layout Namespaces → `Parent.Child.tsx`

Dot notation is **reserved for components that exist only as named parts of a composition root**. Do not use it for standalone components.

### Use dot notation

Page shell parts:

```
Page.Body.tsx
Page.TopBar.tsx
Page.Title.tsx
Page.Description.tsx
Page.TitleSection.tsx
Page.Cover.tsx
```

Sidebar shell parts:

```
Sidebar.Notes.tsx
Sidebar.DailyNotes.tsx
Sidebar.Tasks.tsx
Sidebar.Tags.tsx
Sidebar.Search.tsx
Sidebar.View.tsx
Section.Header.tsx
```

Co-located type/context files for a component:

```
EditableText.types.ts
Overlay.types.ts
Menu.context.tsx
```

### Do not use dot notation

Standalone components — even when they belong to a feature:

```
CollectionBody.tsx      ✓   not Collection.Body.tsx
MarkdownEditor.tsx      ✓   not Markdown.Editor.tsx
FolderTree.tsx          ✓   not Folder.Tree.tsx
PageHost.tsx            ✓   not Page.Host.tsx
```

---

## 8. App Layout Structure

Layout owns composition. Features own behaviour.

```
app/
└── layouts/
    ├── page/
    │   ├── Page.tsx
    │   ├── PageHost.tsx
    │   ├── body/           # PageBody, MarkdownBody, CollectionBody
    │   ├── header/         # Page.Title, Page.Description, …
    │   ├── topbar/         # Page.TopBar, registries, builders
    │   ├── breadcrumb/
    │   └── cover/
    ├── sidebar/
    └── app-layout/
```

- `PageHost` — orchestrator; chooses body type, builds props, renders `Page`.
- `Page` — shell; top bar, header, body slot, cover.
- `*Body` components in `body/` — layout primitives (`PageBody`, `MarkdownBody`, `CollectionBody`). Not feature implementations.

---

## 9. Core Layer

`core/` follows the same broad rules with domain-oriented naming:

| Kind | Pattern | Examples |
|---|---|---|
| Service | `*Service.ts` | `PageApplicationService.ts` |
| Model | `PascalCase.ts` | `Page.ts`, `Vault.ts`, `Folder.ts` |
| Builder | `*Builder.ts` | `PageBuilder.ts`, `VaultBuilder.ts` |
| Extractor | `*Extractor.ts` | `TagExtractor.ts` |
| Test | `{Subject}.test.ts` | `PageBuilder.test.ts` |

Presentation builders that are not domain logic live in `core/presentation/`:

```
core/presentation/
├── Breadcrumb.ts
├── buildBreadcrumbs.ts
└── getDefaultPageIcon.ts
```

---

## 10. Components (`components/`)

Shared, feature-agnostic UI primitives.

```
components/
├── button/
│   ├── Button.tsx
│   └── Button.css
├── entry/
│   ├── Entry.tsx
│   └── Entry.css
└── ...
```

- Component folder: **kebab-case** (`editable-text/`, `count-badge/`)
- Component file: **PascalCase** (`Button.tsx`)
- CSS file: **PascalCase**, matching the component (`Button.css`)

Do not use lowercase CSS filenames (`divider.css` → `Divider.css` when touched).

---

## 11. CSS

| Scope | Convention | Example |
|---|---|---|
| Component CSS | PascalCase, matches component | `Page.css`, `Entry.css` |
| Design system | lowercase | `tokens.css`, `theme.css`, `base.css` |

---

## 12. Import Aliases

Defined in `tsconfig.json`:

```
@app/*         → app/
@features/*    → features/
@core/*        → core/
@components/*  → components/
@shared/*      → shared/
```

Use aliases in imports. Do not use deep relative paths across layer boundaries.

---

## 13. File Name Must Match Primary Export

The filename should match the primary exported symbol.

| File | Export | Status |
|---|---|---|
| `PageHost.tsx` | `PageHost` | ✓ |
| `MarkdownEditor.tsx` | `MarkdownEditor` | ✓ |
| `Sidebar.Search.tsx` | `SearchPanel` | ✗ rename file or export |
| `buildTopBarMenu.tsx` | `buildTopBarMenu` | ✗ rename to `buildTopBarActions` |

---

## 14. Known Legacy Exceptions

These exist in the codebase and should be corrected when the file is next touched — not in a dedicated rename pass unless blocking.

| Current | Target |
|---|---|
| `buildTopBarMenu.tsx` | `buildTopBarActions.tsx` |
| `features/search/Sidebar.Search.tsx` exports `SearchPanel` | Align file name and export |
| `shared/models/navigation-item.ts` | `NavigationItem.ts` |
| `design-system/tag-colors.ts` | `TagColors.ts` or `tagColors.ts` in a constants module |
| `components/divider/divider.css` | `Divider.css` |
| `components/count-badge/count-badge.css` | `CountBadge.css` |
| `pages/Page.Note.tsx` | Delete (empty, unused) |
| `reconcileArchiveMetadata.ts` / `ArchiveMetadataReconciler.ts` | Consolidate naming |

---

## Principles

1. **Organize around behaviour, not entities.** Layouts compose; features behave.
2. **One convention per artifact kind.** No mixing PascalCase and kebab-case for the same role.
3. **Dot notation is for parts of a shell.** Not for standalone components.
4. **Filename = primary export.** Always.
5. **Adopt on touch.** Legacy names are fixed when the file is edited, not in bulk rename sweeps.
