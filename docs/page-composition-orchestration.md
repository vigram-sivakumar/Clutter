# Page Composition Orchestration — Investigation

Report of how page UI orchestration exists today. Composition layer only.

---

## 1. Composition Entry

```
Workspace.activeFolderId / Workspace.activePageId
    ↓
App (apps/app/src/app/App.tsx)
    ↓
AppShell (apps/app/src/app/AppShell.tsx)
    ↓
AppLayout (apps/app/src/app/layouts/app-layout/AppLayout.tsx)
    ↓
PageHost (apps/app/src/app/layouts/page/PageHost.tsx)
    ↓
[conditional dispatch]
    ├── FolderPage (apps/app/src/features/folder/page/FolderPage.tsx)
    ├── NotePage (apps/app/src/features/notes/page/NotePage.tsx)
    ├── DailyNotePage (apps/app/src/features/daily-notes/page/DailyNotePage.tsx)
    └── null
    ↓
Page (apps/app/src/app/layouts/page/Page.tsx)
```

**Folder path:**

```
Workspace.activeFolderId
    ↓
PageHost
    ↓
FolderPage
    ↓
Page
```

**Note path:**

```
Workspace.activePageId + page.type === 'note'
    ↓
PageHost
    ↓
NotePage
    ↓
Page
```

**Daily Note path:**

```
Workspace.activePageId + page.type === 'daily-note'
    ↓
PageHost
    ↓
DailyNotePage
    ↓
Page
```

**No active resource:**

```
!activeFolderId && (!session || !activePageId)
    ↓
PageHost → null
```

---

## 2. PageHost Responsibilities

File: `apps/app/src/app/layouts/page/PageHost.tsx`

| Responsibility                    | Where                                                           | Produces                                 | Consumed by                                                                 |
| --------------------------------- | --------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| Subscribe to workspace changes    | line 31: `useWorkspace(application.workspace)`                  | Re-render trigger; `workspace` reference | PageHost render body                                                        |
| Read vault                        | line 32: `application.vault`                                    | `vault` reference                        | `useActivePage`, `vault.getFolder`, `buildBreadcrumbs`, `toFolderPageModel` |
| Read active page id               | line 34: `workspace.activePageId`                               | `activePageId`                           | `useActivePage`, `pageService.getSession`, `onArchive`, null-check branch   |
| Read active folder id             | line 35: `workspace.activeFolderId`                             | `activeFolderId`                         | Folder branch conditional                                                   |
| Resolve active page from vault    | line 36: `useActivePage(vault, activePageId)`                   | `page: Page \| undefined`                | Page branch, `buildBreadcrumbs`, `switch (page.type)`                       |
| Get document session              | lines 38–40: `application.pageService.getSession(activePageId)` | `rawSession`                             | `useDocumentSession`                                                        |
| Subscribe to document session     | line 44: `useDocumentSession(rawSession)`                       | `session`                                | Null-check branch, `toNotePageModel`, `toDailyNotePageModel`                |
| Define folder navigation callback | line 46: `onOpenFolder`                                         | `(id: string) => void`                   | `buildBreadcrumbs`, `toFolderPageModel`                                     |
| Define markdown update callback   | lines 47–49: `onUpdateMarkdown`                                 | `(pageId, markdown) => void`             | `toNotePageModel`                                                           |
| Define archive callback           | lines 51–57: `onArchive`                                        | `() => void`                             | `buildTopBarMenu` (note branch only)                                        |
| Resolve folder from vault         | line 60: `vault.getFolder(activeFolderId)`                      | `folder`                                 | `toFolderPageModel`, `buildTopBarMenu`, `buildBreadcrumbs`                  |
| Throw when folder missing         | lines 62–64                                                     | Error                                    | —                                                                           |
| Build folder page model           | lines 66–69: `toFolderPageModel(...)`                           | `FolderPageModel`                        | `FolderPage` (`model` prop)                                                 |
| Build folder breadcrumbs          | line 73: `buildBreadcrumbs(folder, vault, onOpenFolder)`        | `Breadcrumb[]`                           | `buildTopBarMenu`                                                           |
| Build folder top bar              | lines 71–74: `buildTopBarMenu(folder, breadcrumbs)`             | `ReactNode` (`PageTopBar`)               | `FolderPage` (`topBar` prop)                                                |
| Render folder page                | line 76: `<FolderPage model={model} topBar={topBar} />`         | Folder page UI tree                      | `AppLayout` main area                                                       |
| Return null when no session/page  | lines 79–81                                                     | `null`                                   | `AppLayout` main area                                                       |
| Throw when page missing           | lines 86–88                                                     | Error                                    | —                                                                           |
| Build page breadcrumbs            | line 90: `buildBreadcrumbs(page, vault, onOpenFolder)`          | `Breadcrumb[]`                           | `buildTopBarMenu`                                                           |
| Build note page model             | line 96: `toNotePageModel(page, session, onUpdateMarkdown)`     | `NotePageModel`                          | `NotePage` (`model` prop)                                                   |
| Build note top bar                | line 97: `buildTopBarMenu(page, breadcrumbs, onArchive)`        | `ReactNode` (`PageTopBar`)               | `NotePage` (`topBar` prop)                                                  |
| Render note page                  | line 99: `<NotePage model={model} topBar={topBar} />`           | Note page UI tree                        | `AppLayout` main area                                                       |
| Build daily note page model       | line 103: `toDailyNotePageModel(page, session)`                 | `DailyNotePageModel`                     | `DailyNotePage` (`model` prop)                                              |
| Build daily note top bar          | line 104: `buildTopBarMenu(page, breadcrumbs)`                  | `ReactNode` (`PageTopBar`)               | `DailyNotePage` (`topBar` prop)                                             |
| Render daily note page            | line 106: `<DailyNotePage model={model} topBar={topBar} />`     | Daily note page UI tree                  | `AppLayout` main area                                                       |
| Throw on unsupported page type    | lines 109–110                                                   | Error                                    | —                                                                           |

---

## 3. Current Decision Points

All conditionals in `PageHost` (`apps/app/src/app/layouts/page/PageHost.tsx`):

| Condition                               | Rendered component |
| --------------------------------------- | ------------------ |
| `if (activeFolderId)`                   | `FolderPage`       |
| `if (!folder)` (inside folder branch)   | throws `Error`     |
| `if (!session \|\| !activePageId)`      | `null`             |
| `if (!page)`                            | throws `Error`     |
| `switch (page.type) case 'note':`       | `NotePage`         |
| `switch (page.type) case 'daily-note':` | `DailyNotePage`    |
| `switch (page.type) default:`           | throws `Error`     |

Nested conditional inside `onArchive` (line 52):

| Condition            | Rendered component          |
| -------------------- | --------------------------- |
| `if (!activePageId)` | `return` (no render change) |

---

## 4. What Page Receives

Shared component: `Page` (`apps/app/src/app/layouts/page/Page.tsx`)

```
Page
├── topBar
├── header
├── body
├── tabs
├── references
└── coverImage
```

| Slot         | Supplied by                                         | Value today                                                          |
| ------------ | --------------------------------------------------- | -------------------------------------------------------------------- |
| `topBar`     | `PageHost` → passed through page-specific component | `ReactNode` from `buildTopBarMenu`                                   |
| `header`     | `NotePage` / `FolderPage` / `DailyNotePage`         | `PageTitleSection` with page-specific title and description children |
| `body`       | `NotePage` / `FolderPage` / `DailyNotePage`         | `NoteBody` / `FolderBody` / `DailyNoteBody`                          |
| `tabs`       | —                                                   | not supplied by any page type                                        |
| `references` | `FolderPage` only                                   | `null`                                                               |
| `coverImage` | `NotePage`, `DailyNotePage`                         | `model.coverImage ?? undefined`                                      |

`FolderPage` does not pass `tabs`, `references` (renders nothing — `null` is falsy), or `coverImage`.

`NotePage` does not pass `tabs` or `references`.

`DailyNotePage` does not pass `tabs` or `references`.

---

## 5. Current Builders

Functions that construct UI composition before rendering:

### `buildBreadcrumbs`

- **File:** `apps/app/src/core/presentation/buildBreadcrumbs.ts`
- **Inputs:** `entry: Page | Folder`, `vault: Vault`, `onOpenFolder: (folderId: string) => void`
- **Output:** `Breadcrumb[]`
- **Caller:** `PageHost`

### `buildTopBarMenu`

- **File:** `apps/app/src/app/layouts/page/topbar/buildTopBarMenu.tsx`
- **Inputs:** `resource: Page | Folder`, `breadcrumbs: Breadcrumb[]`, `onArchive?: () => void`
- **Output:** `ReactNode` (`<PageTopBar />`)
- **Caller:** `PageHost`

### `renderTopBarActions`

- **File:** `apps/app/src/app/layouts/page/topbar/topBarRegistry.tsx`
- **Inputs:** `resourceType: PageType | 'folder'`, `options?: TopBarActionsOptions`
- **Output:** `ReactNode` (page-specific `*TopBarActions` component)
- **Caller:** `buildTopBarMenu`

---

## 6. Current Registries

### `topBarActionsRegistry`

- **File:** `apps/app/src/app/layouts/page/topbar/topBarRegistry.tsx`

| Key            | Returned component       |
| -------------- | ------------------------ |
| `'folder'`     | `FolderTopBarActions`    |
| `'note'`       | `NoteTopBarActions`      |
| `'daily-note'` | `DailyNoteTopBarActions` |

Accessed via `renderTopBarActions(resourceType, options)`.

No other registry is used in the page composition orchestration path.

---

## 7. Page-specific Composition

### Note

```
PageHost
    ↓
NotePage
    ↓
Page
```

| Slot         | Supplied                             |
| ------------ | ------------------------------------ |
| `topBar`     | yes (from `PageHost` via prop)       |
| `header`     | yes                                  |
| `body`       | yes                                  |
| `tabs`       | no                                   |
| `references` | no                                   |
| `coverImage` | yes (when `model.coverImage` is set) |

### Folder

```
PageHost
    ↓
FolderPage
    ↓
Page
```

| Slot         | Supplied                       |
| ------------ | ------------------------------ |
| `topBar`     | yes (from `PageHost` via prop) |
| `header`     | yes                            |
| `body`       | yes                            |
| `tabs`       | no                             |
| `references` | yes (`null`)                   |
| `coverImage` | no                             |

### Daily Note

```
PageHost
    ↓
DailyNotePage
    ↓
Page
```

| Slot         | Supplied                             |
| ------------ | ------------------------------------ |
| `topBar`     | yes (from `PageHost` via prop)       |
| `header`     | yes                                  |
| `body`       | yes                                  |
| `tabs`       | no                                   |
| `references` | no                                   |
| `coverImage` | yes (when `model.coverImage` is set) |

---

## 8. Shared Composition Pieces

Components from `apps/app/src/app/layouts/page/` shared by multiple page types:

| Component          | File                            | Used by                                                                         |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------- |
| `Page`             | `Page.tsx`                      | `NotePage`, `FolderPage`, `DailyNotePage`                                       |
| `PageTopBar`       | `topbar/Page.TopBar.tsx`        | All three (via `buildTopBarMenu` from `PageHost`)                               |
| `Breadcrumbs`      | `breadcrumb/Breadcrumbs.tsx`    | All three (inside `PageTopBar`)                                                 |
| `BreadcrumbItem`   | `breadcrumb/BreadcrumbItem.tsx` | All three (inside `Breadcrumbs`)                                                |
| `PageTitleSection` | `header/Page.TitleSection.tsx`  | `NotePage`, `FolderPage`, `DailyNotePage`                                       |
| `PageTitle`        | `header/Page.Title.tsx`         | All three (inside `*PageTitle`)                                                 |
| `PageDescription`  | `header/Page.Description.tsx`   | All three (inside `*PageDescription`)                                           |
| `PageBody`         | `body/Page.Body.tsx`            | All three (inside `FolderBody`, `DailyNoteBody`, `MarkdownEditor` → `NoteBody`) |
| `PageCover`        | `cover/Page.Cover.tsx`          | `NotePage`, `DailyNotePage`                                                     |

---

## 9. Page-specific Composition Pieces

### Page roots

- `NotePage` — `apps/app/src/features/notes/page/NotePage.tsx`
- `FolderPage` — `apps/app/src/features/folder/page/FolderPage.tsx`
- `DailyNotePage` — `apps/app/src/features/daily-notes/page/DailyNotePage.tsx`

### Title

- `NotePageTitle` — `apps/app/src/features/notes/page/NotePageTitle.tsx`
- `FolderPageTitle` — `apps/app/src/features/folder/page/FolderPageTitle.tsx`
- `DailyNotePageTitle` — `apps/app/src/features/daily-notes/page/DailyNotePageTitle.tsx`

### Description

- `NotePageDescription` — `apps/app/src/features/notes/page/NotePageDescription.tsx`
- `FolderPageDescription` — `apps/app/src/features/folder/page/FolderPageDescription.tsx`
- `DailyNotePageDescription` — `apps/app/src/features/daily-notes/page/DailyNotePageDescription.tsx`

### Body

- `NoteBody` — `apps/app/src/features/notes/page/NoteBody.tsx`
- `MarkdownEditor` — `apps/app/src/features/notes/page/MarkdownEditor.tsx`
- `FolderBody` — `apps/app/src/features/folder/page/FolderBody.tsx`
- `DailyNoteBody` — `apps/app/src/features/daily-notes/page/DailyNoteBody.tsx`

### Top bar actions

- `NoteTopBarActions` — `apps/app/src/features/notes/topbar/NoteTopBarActions.tsx`
- `FolderTopBarActions` — `apps/app/src/features/folder/topbar/FolderTopBarActions.tsx`
- `DailyNoteTopBarActions` — `apps/app/src/features/daily-notes/topbar/DailyNoteTopBarActions.tsx`

### Top bar menu configs

- `noteTopBarMenu` — `apps/app/src/features/notes/topbar/noteTopBarMenu.config.ts`
- `folderTopBarMenu` — `apps/app/src/features/folder/topbar/folderTopBarMenu.config.ts`
- `dailyNoteTopBarMenu` — `apps/app/src/features/daily-notes/topbar/dailyNoteTopBarMenu.config.ts`

---

## 10. Final Summary

```
Workspace.activeFolderId / Workspace.activePageId
        ↓
AppLayout
        ↓
PageHost
        │
        ├── hooks
        │   ├── useWorkspace
        │   ├── useActivePage
        │   └── useDocumentSession
        │
        ├── callbacks
        │   ├── onOpenFolder
        │   ├── onUpdateMarkdown
        │   └── onArchive
        │
        ├── model builders (called by PageHost, consumed by page-specific components)
        │   ├── toFolderPageModel
        │   ├── toNotePageModel
        │   └── toDailyNotePageModel
        │
        ├── UI builders
        │   ├── buildBreadcrumbs
        │   └── buildTopBarMenu
        │       └── renderTopBarActions
        │
        ├── registries
        │   └── topBarActionsRegistry
        │       ├── folder → FolderTopBarActions
        │       ├── note → NoteTopBarActions
        │       └── daily-note → DailyNoteTopBarActions
        │
        └── conditionals
            ├── if (activeFolderId) → FolderPage
            ├── if (!session || !activePageId) → null
            └── switch (page.type)
                ├── 'note' → NotePage
                └── 'daily-note' → DailyNotePage
        ↓
Page-specific component
        │
        ├── FolderPage
        │   ├── topBar ← PageHost
        │   ├── header ← PageTitleSection + FolderPageTitle + FolderPageDescription
        │   ├── body ← FolderBody
        │   └── references ← null
        │
        ├── NotePage
        │   ├── topBar ← PageHost
        │   ├── header ← PageTitleSection + NotePageTitle + NotePageDescription
        │   ├── body ← NoteBody → MarkdownEditor
        │   └── coverImage ← model
        │
        └── DailyNotePage
            ├── topBar ← PageHost
            ├── header ← PageTitleSection + DailyNotePageTitle + DailyNotePageDescription
            ├── body ← DailyNoteBody
            └── coverImage ← model
        ↓
Page
        ├── topBar → PageTopBar → Breadcrumbs + *TopBarActions
        ├── header → page__header
        ├── tabs → (unused)
        ├── body → page__body
        ├── references → page__references (FolderPage passes null)
        └── coverImage → PageCover
```

## What Actually Varies Today

The current orchestration ultimately produces a shared `Page`. The page-specific roots (`NotePage`, `FolderPage`, and `DailyNotePage`) primarily differ in the content they supply to `Page`'s slots.

### Shared page shell

The following components are shared regardless of the active resource:

- `Page`
- `PageTopBar`
- `Breadcrumbs`
- `PageTitleSection`
- `PageTitle`
- `PageDescription`
- `PageBody`
- `PageCover`

### Variation points

#### Top bar

Varies by:

- breadcrumb data
- trailing actions component
- overflow menu configuration
- optional archive callback (note only)

The `PageTopBar` component itself is shared.

#### Header

Varies by:

- title component
- description component

The surrounding `PageTitleSection` remains the same.

#### Body

Varies by:

- note editor
- folder contents
- daily note content

The surrounding page layout remains the same.

#### Optional page slots

Current usage:

| Slot       | Note | Folder | Daily Note |
| ---------- | ---- | ------ | ---------- |
| coverImage | ✓    | —      | ✓          |
| references | —    | `null` | —          |
| tabs       | —    | —      | —          |

## Composition Inputs Observed Today

The current composition is driven by these UI inputs:

- page model
- breadcrumbs
- top bar menu
- top bar actions
- header title
- header description
- page body
- cover image
- references
- tabs (currently unused)

These are the only UI pieces observed to vary across the current page implementations. Everything else is rendered through the shared page composition.
