# UI Composition Investigation Report

Investigation of the current React/component composition layer for page UI: breadcrumbs, top bar, top bar menu, top bar actions, title area, and page body.

**Scope:** Composition only. No domain services, repositories, or data architecture unless directly involved in rendering.

---

## 1. Entry Point

Rendering begins in `apps/app/src/app/main.tsx`, which mounts `<App />` inside `StrictMode`.

**Full component hierarchy from app boot to page UI:**

```
main.tsx
└── App (apps/app/src/app/App.tsx)
    └── AppShell (apps/app/src/app/AppShell.tsx)
        └── AppLayout (apps/app/src/app/layouts/app-layout/AppLayout.tsx)
            ├── Sidebar (apps/app/src/app/layouts/sidebar/Sidebar.tsx)
            └── PageHost (apps/app/src/app/layouts/page/PageHost.tsx)
                └── [page-specific root — see §2]
                    └── Page (apps/app/src/app/layouts/page/Page.tsx)
                        ├── [topBar ReactNode]
                        ├── page__content
                        │   ├── page__header → [header ReactNode]
                        │   ├── page__tabs → [tabs ReactNode, if provided]
                        │   ├── page__body → [body ReactNode]
                        │   └── page__references → [references ReactNode, if provided]
                        └── PageCover (apps/app/src/app/layouts/page/cover/Page.Cover.tsx) [if coverImage provided]
```

**When a page/folder becomes active:**

1. `AppShell` holds the `Application` instance after vault load.
2. `AppLayout` subscribes to vault changes via `useVault(application.vault)` and renders `PageHost`.
3. `PageHost` reads workspace state via `useWorkspace(application.workspace)`:
   - `workspace.activeFolderId`
   - `workspace.activePageId`
4. `PageHost` resolves the active resource:
   - If `activeFolderId` is set → renders `FolderPage`
   - Else if `session` and `activePageId` exist → resolves page via `useActivePage`, then dispatches by `page.type`
   - Else → returns `null`
5. `PageHost` builds breadcrumbs and top bar, constructs a page model, and passes both to the page-specific root component.
6. Each page-specific root composes shared `Page` with `topBar`, `header`, and `body` slots.

**Files involved in the entry chain:**

| File | Role |
|---|---|
| `apps/app/src/app/main.tsx` | React DOM root |
| `apps/app/src/app/App.tsx` | Calls `useTheme`, renders `AppShell` |
| `apps/app/src/app/AppShell.tsx` | Opens vault, creates `Application`, renders `AppLayout` |
| `apps/app/src/app/layouts/app-layout/AppLayout.tsx` | Two-column layout: `Sidebar` + `PageHost` |
| `apps/app/src/app/layouts/page/PageHost.tsx` | Composition root for active page/folder |
| `apps/app/src/app/layouts/page/Page.tsx` | Shared page shell |

---

## 2. Page Composition

### Implemented page types

The `PageType` union in `apps/app/src/core/vault/models/Page.ts` defines: `'note' | 'daily-note'`.

`PageHost` also renders folders as a separate view (not a `PageType`).

**Tag, Tasks, Search, Archive:** No page root components exist for these. Not determinable from the current implementation as active page views.

---

### Note

| Layer | Component | File |
|---|---|---|
| Root | `NotePage` | `apps/app/src/features/notes/page/NotePage.tsx` |
| Shared shell | `Page` | `apps/app/src/app/layouts/page/Page.tsx` |
| Top bar (passed as prop) | `PageTopBar` → `Breadcrumbs` + `NoteTopBarActions` | built in `PageHost` via `buildTopBarMenu` |
| Header | `PageTitleSection` → `NotePageTitle` + `NotePageDescription` | |
| Body | `NoteBody` → `MarkdownEditor` → `PageBody` | |
| Cover (conditional) | `PageCover` | when `model.coverImage` is set |

**Props passed to `NotePage`:**

- `model: NotePageModel` (from `toNotePageModel`)
- `topBar: ReactNode` (from `buildTopBarMenu`)

---

### Folder

| Layer | Component | File |
|---|---|---|
| Root | `FolderPage` | `apps/app/src/features/folder/page/FolderPage.tsx` |
| Shared shell | `Page` | `apps/app/src/app/layouts/page/Page.tsx` |
| Top bar (passed as prop) | `PageTopBar` → `Breadcrumbs` + `FolderTopBarActions` | built in `PageHost` via `buildTopBarMenu` |
| Header | `PageTitleSection` → `FolderPageTitle` + `FolderPageDescription` | |
| Body | `FolderBody` → `PageBody` → `Entry` (per child) | |
| References | `null` (explicitly passed) | |

**Props passed to `FolderPage`:**

- `model: FolderPageModel` (from `toFolderPageModel`)
- `topBar: ReactNode` (from `buildTopBarMenu`)

**Dispatch condition in `PageHost`:** `if (activeFolderId)` — checked before page dispatch.

---

### Daily Note

| Layer | Component | File |
|---|---|---|
| Root | `DailyNotePage` | `apps/app/src/features/daily-notes/page/DailyNotePage.tsx` |
| Shared shell | `Page` | `apps/app/src/app/layouts/page/Page.tsx` |
| Top bar (passed as prop) | `PageTopBar` → `Breadcrumbs` + `DailyNoteTopBarActions` | built in `PageHost` via `buildTopBarMenu` |
| Header | `PageTitleSection` → `DailyNotePageTitle` + `DailyNotePageDescription` | |
| Body | `DailyNoteBody` → `PageBody` | |
| Cover (conditional) | `PageCover` | when `model.coverImage` is set |

**Props passed to `DailyNotePage`:**

- `model: DailyNotePageModel` (from `toDailyNotePageModel`)
- `topBar: ReactNode` (from `buildTopBarMenu`)

**Dispatch condition in `PageHost`:** `switch (page.type) { case 'daily-note': ... }`

---

### Tag

Not implemented as a page view. Sidebar components exist (`Sidebar.Tags.tsx`, `Tag.tsx`) but no page composition path in `PageHost`.

---

### Tasks

Not implemented as a page view. Sidebar components exist (`Sidebar.Tasks.tsx`, `Task.tsx`) but no page composition path in `PageHost`.

---

### Search

Not implemented. No search page component found.

---

### Archive

Not implemented as a page view. Archive exists as a domain operation (`onArchive` in `PageHost`, triggered from `NoteTopBarActions` menu item `'archive'`). No `ArchivePage` component found.

---

### Empty / no active resource

When `!session || !activePageId` and no `activeFolderId`, `PageHost` returns `null`.

---

## 3. Breadcrumb Composition

### Where breadcrumbs are created

`buildBreadcrumbs()` in `apps/app/src/core/presentation/buildBreadcrumbs.ts`

### Who creates them

`PageHost` (`apps/app/src/app/layouts/page/PageHost.tsx`):

- Folder path (line 73): `buildBreadcrumbs(folder, vault, onOpenFolder)`
- Page path (line 90): `buildBreadcrumbs(page, vault, onOpenFolder)`

### Who owns them

`PageHost` creates the `Breadcrumb[]` array locally. No React state or context holds breadcrumbs. They are passed as props at render time.

### Who passes them

```
PageHost
  → buildTopBarMenu(resource, breadcrumbs, onArchive?)
    → PageTopBar({ breadcrumbs, trailing })
      → Breadcrumbs({ items: breadcrumbs })
```

### Which component renders them

`Breadcrumbs` (`apps/app/src/app/layouts/page/breadcrumb/Breadcrumbs.tsx`) renders individual items via `BreadcrumbItem` (`apps/app/src/app/layouts/page/breadcrumb/BreadcrumbItem.tsx`).

When there are collapsed middle items, `Breadcrumbs` also renders an overflow `Menu` / `MenuItem` inside an `Overlay`.

### Full prop flow

```
PageHost
  onOpenFolder = (id) => application.folderService.openFolder(id)
  breadcrumbs: Breadcrumb[] = buildBreadcrumbs(entry, vault, onOpenFolder)
    ↓
buildTopBarMenu(resource, breadcrumbs, onArchive?)
  ↓
PageTopBar
  props.breadcrumbs: Breadcrumb[]
  props.trailing: ReactNode
    ↓
Breadcrumbs
  props.items: Breadcrumb[]
    ↓
BreadcrumbItem (one or more)
  props: { id, title, icon, emoji, isIconOnly?, onClick? }
```

### Breadcrumb data shape

Defined in `apps/app/src/core/presentation/Breadcrumb.ts`:

```typescript
{ id, title, icon?, emoji?, onClick? }
```

Re-exported from `apps/app/src/app/layouts/page/breadcrumb/Breadcrumbs.tsx`.

---

## 4. Top Bar Composition

### Where the top bar is instantiated

`buildTopBarMenu()` in `apps/app/src/app/layouts/page/topbar/buildTopBarMenu.tsx` returns a `<PageTopBar />` element.

Called from `PageHost` in three places:

1. Folder (lines 71–74)
2. Note (line 97)
3. Daily Note (line 104)

### Which component owns it

`PageHost` constructs the top bar ReactNode and passes it as the `topBar` prop to page root components.

### Which component renders it

`Page` (`apps/app/src/app/layouts/page/Page.tsx`, line 25) renders `{topBar}` as the first child inside `page__document`.

The top bar element itself is `PageTopBar` (`apps/app/src/app/layouts/page/topbar/Page.TopBar.tsx`).

### How data reaches it

```
PageHost
  ├── buildBreadcrumbs(...) → breadcrumbs: Breadcrumb[]
  ├── onArchive (note only) → () => application.pageMutationService.archivePage(activePageId)
  └── buildTopBarMenu(resource, breadcrumbs, onArchive?)
        ├── getResourceType(resource) → 'folder' | 'note' | 'daily-note'
        ├── renderTopBarActions(resourceType, { onArchive }) → trailing ReactNode
        └── <PageTopBar breadcrumbs={breadcrumbs} trailing={trailing} />
              ↓ passed as topBar prop
NotePage | FolderPage | DailyNotePage
              ↓
Page topBar={topBar}
```

### PageTopBar structure

```tsx
<div className="topbar">
  <div className="topbar--leading">
    <Breadcrumbs items={breadcrumbs} />
  </div>
  <div className="topbar--trailing">{trailing}</div>
</div>
```

File: `apps/app/src/app/layouts/page/topbar/Page.TopBar.tsx`

---

## 5. Top Bar Actions

### Where actions originate

`topBarActionsRegistry` in `apps/app/src/app/layouts/page/topbar/topBarRegistry.tsx`:

| Resource type | Renderer | Component |
|---|---|---|
| `'folder'` | `() => <FolderTopBarActions />` | `apps/app/src/features/folder/topbar/FolderTopBarActions.tsx` |
| `'note'` | `(options) => <NoteTopBarActions onArchive={options?.onArchive} />` | `apps/app/src/features/notes/topbar/NoteTopBarActions.tsx` |
| `'daily-note'` | `() => <DailyNoteTopBarActions />` | `apps/app/src/features/daily-notes/topbar/DailyNoteTopBarActions.tsx` |

### How they are passed

```
PageHost
  → buildTopBarMenu(resource, breadcrumbs, onArchive?)
    → renderTopBarActions(resourceType, { onArchive })
      → topBarActionsRegistry[resourceType](options)
        → returned as trailing prop to PageTopBar
```

### Which component renders them

Each `*TopBarActions` component renders directly into `PageTopBar`'s `topbar--trailing` div.

All three `*TopBarActions` components render the same structural pattern:

- `Button` (favouriteOutline icon)
- `Button` (widthFill icon)
- `Button` (moreHorizontal icon) → opens `Overlay` containing `Menu` / `MenuItem`

### Page-specific action definitions

| Component | File | Receives props |
|---|---|---|
| `NoteTopBarActions` | `features/notes/topbar/NoteTopBarActions.tsx` | `onArchive?: () => void` |
| `FolderTopBarActions` | `features/folder/topbar/FolderTopBarActions.tsx` | none |
| `DailyNoteTopBarActions` | `features/daily-notes/topbar/DailyNoteTopBarActions.tsx` | none |

### Every current source of top bar actions

1. `NoteTopBarActions` — favourite button, width-fill button, overflow menu button
2. `FolderTopBarActions` — favourite button, width-fill button, overflow menu button
3. `DailyNoteTopBarActions` — favourite button, width-fill button, overflow menu button

The only action wired to a callback: in `NoteTopBarActions`, menu item `id === 'archive'` calls `onArchive?.()`.

---

## 6. Top Bar Menu

There is no standalone `TopBarMenu` component. Menu items are defined in config files and rendered inside each `*TopBarActions` overflow overlay.

### Where menu items originate

| Config file | Export | Used by |
|---|---|---|
| `features/notes/topbar/noteTopBarMenu.config.ts` | `noteTopBarMenu` | `NoteTopBarActions` |
| `features/folder/topbar/folderTopBarMenu.config.ts` | `folderTopBarMenu` | `FolderTopBarActions` |
| `features/daily-notes/topbar/dailyNoteTopBarMenu.config.ts` | `dailyNoteTopBarMenu` | `DailyNoteTopBarActions` |

### Who builds them

Static arrays in the config files. No runtime builder function.

### Who passes them

Each `*TopBarActions` component imports its config and maps items directly:

```tsx
{noteTopBarMenu.map((item) => (
  <MenuItem key={item.id} ...>{item.label}</MenuItem>
))}
```

No intermediate prop passing from `PageHost`.

### Who renders them

Inside each `*TopBarActions`:

- `Overlay` (anchored to the moreHorizontal `Button`)
  - `Menu size="medium"`
    - `MenuItem` per config entry, with `AppIcon` leading

Shared UI components used: `Menu`, `MenuItem`, `Overlay`, `Button`, `AppIcon` from `@components/*` and `@shared/icon`.

### Page-specific menu item lists

**Note** (`noteTopBarMenu`):

- add-a-description, duplicate, move-to, add-to-favorite, version-history, archive

**Folder** (`folderTopBarMenu`):

- add-a-description, move-to, add-to-favorite, archive

**Daily Note** (`dailyNoteTopBarMenu`):

- add-a-description, add-to-favorite, version-history, archive

### Separate breadcrumb overflow menu

`Breadcrumbs` (`apps/app/src/app/layouts/page/breadcrumb/Breadcrumbs.tsx`) renders its own `Overlay` + `Menu` + `MenuItem` for collapsed ancestor items. This is part of the top bar leading section, not the trailing actions menu.

---

## 7. Title Bar

No component named `TitleBar` exists in the codebase.

The title area is composed via the `header` slot of `Page`.

### Where the title area is rendered

`Page` (`apps/app/src/app/layouts/page/Page.tsx`, lines 27–28):

```tsx
{header && <header className="page__header">{header}</header>}
```

### Which component owns it

Each page-specific root component (`NotePage`, `FolderPage`, `DailyNotePage`) constructs and passes the `header` prop to `Page`.

### Page-specific title components

| Page | Title component | File |
|---|---|---|
| Note | `NotePageTitle` | `features/notes/page/NotePageTitle.tsx` |
| Folder | `FolderPageTitle` | `features/folder/page/FolderPageTitle.tsx` |
| Daily Note | `DailyNotePageTitle` | `features/daily-notes/page/DailyNotePageTitle.tsx` |

### Shared title components used

| Component | File | Role |
|---|---|---|
| `PageTitleSection` | `app/layouts/page/header/Page.TitleSection.tsx` | Wrapper `<header className="page-title-section">` |
| `PageTitle` | `app/layouts/page/header/Page.Title.tsx` | Inner `<div className="page-title">` |
| `PageDescription` | `app/layouts/page/header/Page.Description.tsx` | Description area below title |
| `EditableText` | `@components/editable-text/EditableText` | Used in Note, Folder, Daily Note title/description where editable |

### Full rendering chain (example: Note)

```
NotePage
  header={
    <PageTitleSection>
      <NotePageTitle title={model.title} onCommit={model.rename} />
      <NotePageDescription description={model.description} onCommit={model.updateDescription} />
    </PageTitleSection>
  }
    ↓
Page header={header}
  → <header className="page__header">
      <PageTitleSection>
        <NotePageTitle>
          <PageTitle>
            <EditableText value={title} placeholder="Untitled Note" onCommit={onCommit} />
          </PageTitle>
        </NotePageTitle>
        <NotePageDescription>
          <PageDescription>
            <EditableText value={description} placeholder="Add a description" onCommit={onCommit} />
          </PageDescription>
        </NotePageDescription>
      </PageTitleSection>
    </header>
```

### Props passed per page type

**NotePageTitle:** `{ title: string, onCommit(title: string): void }`

**FolderPageTitle:** `{ title: string }` — renders plain text inside `PageTitle`

**DailyNotePageTitle:** `{ title: string }` — renders `<span>{title}</span>` inside `PageTitle`

**NotePageDescription / FolderPageDescription / DailyNotePageDescription:** `{ description: string, onCommit(description: string): void }`

---

## 8. Page Body

### Which component ultimately renders the page body

`Page` (`apps/app/src/app/layouts/page/Page.tsx`, line 29):

```tsx
{body && <main className="page__body">{body}</main>}
```

The inner content differs by page type.

### How different page types choose body components

Conditional rendering occurs in `PageHost`, not in `Page`:

```
PageHost
  if (activeFolderId) → FolderPage → FolderBody
  switch (page.type)
    case 'note'       → NotePage       → NoteBody
    case 'daily-note' → DailyNotePage  → DailyNoteBody
    default           → throw Error
```

Each page root passes its body as the `body` prop to `Page`.

### Body component chains

**Note:**

```
NotePage body={<NoteBody markdown={model.markdown} onCommit={handleCommit} />}
  → NoteBody (features/notes/page/NoteBody.tsx)
    → MarkdownEditor (features/notes/page/MarkdownEditor.tsx)
      → PageBody (app/layouts/page/body/Page.Body.tsx)
        → contentEditable div
```

**Folder:**

```
FolderPage body={<FolderBody children={model.children} />}
  → FolderBody (features/folder/page/FolderBody.tsx)
    → PageBody
      → Entry (per child, from @components/entry/Entry)
```

**Daily Note:**

```
DailyNotePage body={<DailyNoteBody markdown={model.markdown} />}
  → DailyNoteBody (features/daily-notes/page/DailyNoteBody.tsx)
    → PageBody
      → {markdown} (plain text)
```

### Shared body primitive

`PageBody` (`apps/app/src/app/layouts/page/body/Page.Body.tsx`) renders `<div className="page-content">`. Used by `MarkdownEditor`, `FolderBody`, and `DailyNoteBody`. Not used directly by `NoteBody` (delegates to `MarkdownEditor` which wraps `PageBody`).

---

## 9. Page-Specific Components

All page-specific UI components currently involved in page composition (excluding sidebar/navigation):

### Note

- `NotePage`
- `NotePageTitle`
- `NotePageDescription`
- `NoteBody`
- `MarkdownEditor`
- `NoteTopBarActions`
- `noteTopBarMenu` (config, not a component)

### Folder

- `FolderPage`
- `FolderPageTitle`
- `FolderPageDescription`
- `FolderBody`
- `FolderTopBarActions`
- `folderTopBarMenu` (config, not a component)

### Daily Note

- `DailyNotePage`
- `DailyNotePageTitle`
- `DailyNotePageDescription`
- `DailyNoteBody`
- `DailyNoteTopBarActions`
- `dailyNoteTopBarMenu` (config, not a component)

### Shared layout components used across page types

- `Page`
- `PageTopBar`
- `PageTitleSection`
- `PageTitle`
- `PageDescription`
- `PageBody`
- `PageCover`
- `Breadcrumbs`
- `BreadcrumbItem`

---

## 10. Component Tree

### Note page (active page, type `'note'`)

```
App
└── AppShell
    └── AppLayout
        ├── Sidebar
        └── PageHost
            └── NotePage
                └── Page
                    ├── PageTopBar                          [topBar prop]
                    │   ├── Breadcrumbs
                    │   │   ├── BreadcrumbItem
                    │   │   ├── AppIcon (slash)
                    │   │   ├── BreadcrumbItem (overflow, if collapsed)
                    │   │   ├── BreadcrumbItem (current)
                    │   │   └── Overlay → Menu → MenuItem   [collapsed ancestors]
                    │   └── NoteTopBarActions               [trailing]
                    │       ├── Button (favouriteOutline)
                    │       ├── Button (widthFill)
                    │       ├── Button (moreHorizontal)
                    │       └── Overlay → Menu → MenuItem   [noteTopBarMenu items]
                    ├── header.page__header
                    │   └── PageTitleSection
                    │       ├── NotePageTitle
                    │       │   └── PageTitle
                    │       │       └── EditableText
                    │       └── NotePageDescription
                    │           └── PageDescription
                    │               └── EditableText
                    └── main.page__body
                        └── NoteBody
                            └── MarkdownEditor
                                └── PageBody
                                    └── div[contentEditable]
                    └── PageCover                           [if model.coverImage]
```

### Folder page (activeFolderId set)

```
App
└── AppShell
    └── AppLayout
        ├── Sidebar
        └── PageHost
            └── FolderPage
                └── Page
                    ├── PageTopBar
                    │   ├── Breadcrumbs
                    │   │   └── [same structure as Note]
                    │   └── FolderTopBarActions
                    │       ├── Button (favouriteOutline)
                    │       ├── Button (widthFill)
                    │       ├── Button (moreHorizontal)
                    │       └── Overlay → Menu → MenuItem   [folderTopBarMenu items]
                    ├── header.page__header
                    │   └── PageTitleSection
                    │       ├── FolderPageTitle
                    │       │   └── PageTitle
                    │       └── FolderPageDescription
                    │           └── PageDescription
                    │               └── EditableText
                    └── main.page__body
                        └── FolderBody
                            └── PageBody
                                └── Entry (× N)
                                    └── AppIcon
```

### Daily Note page (active page, type `'daily-note'`)

```
App
└── AppShell
    └── AppLayout
        ├── Sidebar
        └── PageHost
            └── DailyNotePage
                └── Page
                    ├── PageTopBar
                    │   ├── Breadcrumbs
                    │   │   └── [same structure as Note]
                    │   └── DailyNoteTopBarActions
                    │       ├── Button (favouriteOutline)
                    │       ├── Button (widthFill)
                    │       ├── Button (moreHorizontal)
                    │       └── Overlay → Menu → MenuItem   [dailyNoteTopBarMenu items]
                    ├── header.page__header
                    │   └── PageTitleSection
                    │       ├── DailyNotePageTitle
                    │       │   └── PageTitle
                    │       │       └── span
                    │       └── DailyNotePageDescription
                    │           └── PageDescription
                    │               └── EditableText
                    └── main.page__body
                        └── DailyNoteBody
                            └── PageBody
                                └── {markdown text}
                    └── PageCover                           [if model.coverImage]
```

### No active resource

```
App
└── AppShell
    └── AppLayout
        ├── Sidebar
        └── PageHost → null
```
