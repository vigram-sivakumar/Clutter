# Naming Conventions

This document defines how files, folders, and exports are named in Clutter. These rules apply to all new code and should be adopted when touching existing code.

The goal is one clear rule per kind of artifact — not a mix of historical patterns.

---

## Quick Reference

| Kind             | Convention             | Example                                           |
| ---------------- | ---------------------- | ------------------------------------------------- |
| React component  | `PascalCase.tsx`       | `PageHost.tsx`                                    |
| Hook             | `use*.ts`              | `useActivePage.ts`                                |
| Builder          | `build*.ts` / `to*.ts` | `buildBreadcrumbs.ts`, `toCollectionPageModel.ts` |
| Registry         | `*Registry.ts`         | `topBarRegistry.ts`                               |
| Config           | `*.config.ts`          | `noteTopBarMenu.config.ts`                        |
| Model / type     | `PascalCase.ts`        | `CollectionPageModel.ts`                          |
| Helper           | `camelCase.ts`         | `groupByMonth.ts`, `findTodayNote.ts`             |
| Feature folder   | `kebab-case`           | `daily-notes/`                                    |
| Layout namespace | `Parent.Child.tsx`     | `Page.TopBar.tsx`                                 |
| CSS (component)  | Match component name   | `Page.css`, `Button.css`                          |

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

| Category       | Pattern               | Examples                                                       |
| -------------- | --------------------- | -------------------------------------------------------------- |
| Hooks          | `use*.ts`             | `useActivePage.ts`, `useVault.ts`                              |
| Builders       | `build*.ts`, `to*.ts` | `buildBreadcrumbs.ts`, `toCollectionPageModel.ts`              |
| Registries     | `*Registry.ts`        | `topBarRegistry.ts`, `iconRegistry.ts`                         |
| Helpers        | verb + noun           | `groupByMonth.ts`, `findTodayNote.ts`, `getDefaultPageIcon.ts` |
| Render helpers | `render*.tsx`         | `renderDailyNotesByMonth.tsx`                                  |

**Builders in layout:** `buildTopBarActions.tsx` builds trailing top bar actions (not a menu).

---

## 3. Models / Types → PascalCase

Always match the primary export. No kebab-case for model or type files.

```
CollectionPageModel.ts    →  CollectionPageModel
CollectionEntryModel.ts   →  CollectionEntryModel
NotePageModel.ts          →  NotePageModel
FavoriteItem.ts            →  FavoriteItem (notes feature DTO)
Breadcrumb.ts             →  Breadcrumb
```

A model file may also export its builder (e.g. `toNotePageModel` in `NotePageModel.ts`) or the builder may live in a separate `to*.ts` file — both are acceptable. Prefer one approach per feature.

Do not use kebab-case for model or type files:

```
FavoriteItem.ts      ✓
TagColors.ts         ✓
```

Previously non-conforming names (`navigation-item.ts`, `NavigationItem.ts`, `tag-colors.ts`) have been corrected.

Shortcut configs are **not** shared models — each feature owns its config array in `*.config.ts`. TypeScript infers the shape, or the feature defines a local type (e.g. `NotesShortcutId`).

---

## 4. Config Files → camelCase + `.config.ts`

```
noteTopBarMenu.config.ts
notesShortcuts.config.ts
folderTopBarMenu.config.ts
dailyNoteTopBarMenu.config.ts
```

The config filename describes what it configures. The export inside uses PascalCase or camelCase as appropriate for its shape.

---

## 5. Feature Folders

`features/` holds **application capabilities** — not layout primitives, not sidebar tabs exclusively.

| Kind | Examples | Exposed via |
|---|---|---|
| Product capability | `notes/`, `daily-notes/`, `tasks/`, `tags/`, `search/` | Sidebar tabs today (and other entry points later) |
| Shared capability | `markdown/`, `collection/` | Consumed by `PageHost` and product features — not navigable tabs |

```
features/
├── markdown/       # shared — editing capability
├── collection/     # shared — collection presentation builders
├── notes/          # product capability
├── daily-notes/
├── tasks/
├── tags/
└── search/
```

- Use **kebab-case** for multi-word feature folder names.
- Use **lowercase single word** for single-word features.

Do not use `features/*/navigation/` for sidebar shortcut rows — that collides with application navigation (`NavigationService`). Use `shortcuts/` instead (see section 6).

---

## 6. Internal Feature Structure

Every feature should roughly follow:

```
feature/
├── page/           # presentation models and builders (to*PageModel)
├── presentation/   # render builders (optional — may live in helpers/ today)
├── sidebar/        # sidebar panels and row components
├── shortcuts/      # sidebar shortcut rows for this feature (not NavigationService)
├── topbar/         # top bar actions and menu configs
├── helpers/        # pure data helpers (group, filter, query)
├── calendar/       # feature-specific sub-capabilities (e.g. daily-notes)
├── commands/       # feature-specific commands (future)
└── editor/         # e.g. markdown/editor/
```

Not every feature has every folder. That is fine. The rule is: **when a folder exists, it means the same thing everywhere.**

| Folder | Meaning |
|---|---|
| `page/` | Presentation models and builders consumed by `PageHost` |
| `presentation/` | Functions that transform data into renderable UI models or trees; thread callbacks, never import `NavigationService` |
| `sidebar/` | Sidebar panels and entry rows for this feature |
| `shortcuts/` | Shortcut rows at the top of a feature's sidebar tab (Inbox, All notes, calendar picker, etc.) |

Each feature with config-driven shortcuts follows:

```
shortcuts/
├── NotesShortcuts.tsx           # renders config + dispatches by id
├── notesShortcuts.config.ts     # static shortcut definitions (pure data)
└── buildNotesShortcutHandler.ts # switch on id → NavigationService calls
```

Flow:

```
Config → build*ShortcutHandler(navigation) → onShortcut(id) → *Shortcuts → Navigation
```

The shell passes `navigation` into the feature sidebar. The feature builds `onShortcut` internally. Shortcuts components call `onShortcut(shortcut.id)` — ids live only in the config; behavior lives only in the handler switch.
| `topbar/` | Top bar actions and overflow menu config |
| `helpers/` | Pure functions — grouping, filtering, querying; no navigation side effects |
| `commands/` | User actions / mutations owned by the feature |

### Helpers vs presentation builders

| Kind | Example | Owns navigation? |
|---|---|---|
| **Helper** | `groupByMonth.ts`, `findTodayNote.ts` | No — pure data |
| **Presentation builder** | `toCollectionPageModel.ts`, `renderDailyNotesByMonth.tsx` | No — accepts callbacks (`onOpen`, `onOpenNote`) |
| **Navigation intent** | `NavigationService.openNote()` | Yes — decides where the app goes |

Presentation builders expose callbacks like React components expose `onClick`. They do not perform navigation.

Shortcut handlers (`buildNotesShortcutHandler`, etc.) are the exception: they receive `NavigationService` as a parameter from the feature sidebar (which receives it from the shell). They map feature-local shortcut ids to navigation intents in one place — no id-switch in the shell.

### Callback wiring rule

Features and presentation code **never import `NavigationService`**. The shell wires callbacks:

```
UI (feature)
    ↓ callbacks (onOpen, onOpenNote, …)
NavigationService
    ↓
Application services (PageApplicationService, FolderApplicationService)
    ↓
Workspace
```

This keeps features testable without mocking application services.

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
Sidebar.View.tsx
Section.Header.tsx
```

Standalone feature components do not use dot notation even when rendered inside the sidebar:

```
SearchPanel.tsx      ✓   not Sidebar.Search.tsx
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

| Kind                   | Pattern             | Examples                                                      |
| ---------------------- | ------------------- | ------------------------------------------------------------- |
| Service                | `*Service.ts`       | `PageApplicationService.ts`                                   |
| Model                  | `PascalCase.ts`     | `Page.ts`, `Vault.ts`, `Folder.ts`                            |
| Builder                | `*Builder.ts`       | `PageBuilder.ts`, `VaultBuilder.ts`                           |
| Extractor / reconciler | `PascalCase.ts`     | `TagExtractor.ts`, `ArchiveMetadataReconciler.ts`             |
| Pure helper module     | `camelCase.ts`      | `reconcileArchiveMetadata.ts`, `persistSyncedPageDocument.ts` |
| Test                   | `{Subject}.test.ts` | `PageBuilder.test.ts`, `ArchiveMetadataReconciler.test.ts`    |

**Domain modules vs helper modules in `core/`:**

- **PascalCase** when the file is named after a domain concept and groups related operations — even if the exports are functions rather than a class. Example: `ArchiveMetadataReconciler.ts` exports `evaluateArchiveMetadataRepair`, `applyArchiveMetadataCorrection`.
- **camelCase** when the file is a single-purpose helper or orchestration entry point. Example: `reconcileArchiveMetadata.ts` calls into `ArchiveMetadataReconciler`.

This matches existing patterns like `PageBuilder.ts` (class) and `TagExtractor.ts` (domain-named module).

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

| Scope         | Convention                    | Example                               |
| ------------- | ----------------------------- | ------------------------------------- |
| Component CSS | PascalCase, matches component | `Page.css`, `Entry.css`               |
| Design system | lowercase                     | `tokens.css`, `theme.css`, `base.css` |

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

| File                           | Export                                         | Status |
| ------------------------------ | ---------------------------------------------- | ------ |
| `PageHost.tsx`                 | `PageHost`                                     | ✓      |
| `MarkdownEditor.tsx`           | `MarkdownEditor`                               | ✓      |
| `SearchPanel.tsx`              | `SearchPanel`                                  | ✓      |
| `buildTopBarActions.tsx`       | `buildTopBarActions`                           | ✓      |
| `buildNotesShortcutHandler.ts` | `buildNotesShortcutHandler`                    | ✓      |
| `TagColors.ts`                 | `TagColors`, `tagColorsFromPalette`            | ✓      |
| `ArchiveMetadataReconciler.ts` | domain functions + `ArchiveMetadataCorrection` | ✓      |

When a file exports multiple related functions under one domain name (e.g. `ArchiveMetadataReconciler.ts`), the PascalCase filename matches the domain concept — not any single function inside it.

---

## 14. Completed Renames (2026)

These legacy names were corrected in a naming-only refactor:

| Was                   | Now                      |
| --------------------- | ------------------------ |
| `buildTopBarMenu.tsx` | `buildTopBarActions.tsx` |
| `Sidebar.Search.tsx`  | `SearchPanel.tsx`        |
| `navigation-item.ts`  | removed — each feature owns `*Shortcuts.config.ts` |
| `tag-colors.ts`       | `TagColors.ts`           |
| `divider.css`         | `Divider.css`            |
| `count-badge.css`     | `CountBadge.css`         |

No dedicated rename pass is planned. Future violations should be fixed when the file is next touched.

---

## Principles

1. **Organize around behaviour, not entities.** Layouts compose; features behave.
2. **One convention per artifact kind.** No mixing PascalCase and kebab-case for the same role.
3. **Dot notation is for parts of a shell.** Not for standalone components.
4. **Filename = primary export.** Always.
5. **Adopt on touch.** Legacy names are fixed when the file is edited, not in bulk rename sweeps.
