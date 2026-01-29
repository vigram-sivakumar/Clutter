# UI Package Structure

This document defines the organization rules for `@clutter/ui` components. These rules ensure architectural boundaries, maintainability, and clear ownership.

## Directory Structure

```
packages/ui/src/components/
├── app-layout/          Application-specific layouts and pages
├── ui-buttons/          Button components
├── ui-inputs/           Input components
├── ui-modals/           Dialog and modal components
└── ui-primitives/       Low-level, reusable UI primitives
```

---

## What Goes Where

### `ui-primitives/`

**Rule**: A component belongs in `ui-primitives` ONLY if:

1. **Zero app knowledge** - No imports from app state, routing, or domain logic
2. **Zero editor knowledge** - No imports from `@clutter/editor` or editor-specific utilities
3. **Publishable as standalone** - Could plausibly be extracted into a separate package

**Examples**:

- ✅ `FloatingContainer` - Generic floating positioning logic
- ✅ `FloatingMenu` - Reusable menu container
- ✅ `ContextMenu` - Generic context menu component
- ✅ `Dropdown*` - Dropdown primitives
- ❌ `FloatingToolbar` - Editor-specific, uses `isMultiBlockSelection` from editor

**Import rule**: `ui-primitives` can only import from:

- React
- Design tokens (`tokens/`, `hooks/useTheme`)
- Other `ui-primitives` components
- Standard libraries

### `ui-buttons/`, `ui-inputs/`, `ui-modals/`

**Purpose**: Specialized UI components built on primitives.

**Rule**: Can import from:

- `ui-primitives`
- Design tokens
- React and standard libraries

**Cannot import from**:

- `app-layout` (creates circular dependencies)
- `@clutter/editor` (wrong abstraction layer)

### `app-layout/`

**Purpose**: Application-specific layouts, pages, and domain-aware components.

**Rule**: This is the "app layer" - can import from:

- All `ui-*` folders
- App state (`@clutter/state`)
- Domain logic (`@clutter/domain`)
- `@clutter/editor` (for editor integration)

**Structure**:

```
app-layout/
├── layout/              App shell (Sidebar, TopBar, Container)
├── pages/               Page-level views (note, folder, tag, tasks, etc.)
└── shared/              Reusable page components (content-header, emoji, etc.)
```

**Organization principle**: Deep nesting is acceptable within bounded domains (e.g., `sidebar/`) when it prevents horizontal sprawl.

---

## Architectural Boundaries

### Package Dependencies (Must Follow)

```
app-layout/   →  Can import from ui-buttons, ui-inputs, ui-modals, ui-primitives
    ↓
ui-buttons/   →  Can import from ui-primitives
ui-inputs/    →  Can import from ui-primitives
ui-modals/    →  Can import from ui-primitives
    ↓
ui-primitives →  Self-contained (no other component imports)
```

### Cross-Package Rules

**Editor-specific UI belongs in `@clutter/editor`**:

- Example: `FloatingToolbar` lives in `packages/editor/components/ui/`
- Reason: Uses editor utilities like `isMultiBlockSelection`

**App-specific UI belongs in `app-layout`**:

- Example: `PageTitleSection`, `NoteEditor`
- Reason: Tightly coupled to app state and routing

---

## File Organization Best Practices

### 1. Index Files

Every folder must have an `index.ts` that exports public API:

```ts
export { ComponentName } from './ComponentName';
export type { ComponentProps } from './ComponentName';
```

### 2. Naming Conventions

- Component files: `PascalCase.tsx` (e.g., `Button.tsx`)
- Utility files: `camelCase.ts` (e.g., `colorUtils.ts`)
- Config/data files: `camelCase.ts` (e.g., `sidebarConfig.ts`)

### 3. Folder Depth

- **Vertical depth** (nested domains) is fine: `sidebar/items/SidebarItem.tsx`
- **Horizontal sprawl** (many loose files) is worse: avoid 20+ files in one folder

### 4. Imports

Prefer package imports over relative paths when crossing boundaries:

```ts
// Good
import { Button } from '@clutter/ui';

// Avoid (when crossing package boundaries)
import { Button } from '../../../ui/components/ui-buttons/Button';
```

---

## Historical Notes

### Replaced Components

- `RightClickContextMenu` → Replaced by `ContextMenu` (simpler API, no global context)
- Add notes here when components are deprecated/replaced to prevent re-implementation

### Architectural Migrations

- **FloatingToolbar**: Moved from `ui-primitives/` to `packages/editor/components/ui/` to fix cross-package dependency violation (uses editor utilities)

---

## When to Reorganize

**Don't reorganize unless**:

1. Circular dependencies appear
2. Import paths become unmanageable (>5 levels of `../`)
3. A component is in the wrong layer (violates rules above)
4. Team consensus that current structure impedes feature development

**The goal is not perfect structure, but navigable, maintainable code.**

---

## Questions?

If you're unsure where a component belongs, ask:

1. Does it know about the app? → `app-layout/`
2. Does it know about the editor? → `@clutter/editor`
3. Is it purely UI with no domain knowledge? → Check against `ui-primitives` rule
4. Is it a specialized UI component? → `ui-buttons/`, `ui-inputs/`, or `ui-modals/`

When in doubt, start in a more specific folder (`ui-buttons`) and extract to primitives later if needed.
