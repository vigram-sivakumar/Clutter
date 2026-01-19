# Clutter Notes - Architecture

## 🏗️ Package Architecture

Clutter Notes uses a monorepo structure with strict architectural boundaries enforced by ESLint.

```
apps/
├── desktop/          # Tauri desktop app
└── web/              # Web app

packages/
├── domain/           # Pure types & constants (no dependencies)
├── state/            # Zustand stores (depends on: domain)
├── shared/           # Utilities & hooks (depends on: domain, state)
├── editor/           # Isolated editor engine (no app dependencies)
└── ui/               # Presentational components (depends on: domain, state, shared)
```

---

## 🔒 Architectural Boundaries

### **Enforced by ESLint** (`no-restricted-imports`)

Each package has explicit import rules to prevent architectural drift:

### 1️⃣ **domain** — Pure Types & Constants

- **Can import from:** ❌ Nothing
- **Cannot import from:** ❌ state, shared, editor, ui, apps
- **Purpose:** Pure type definitions and constants with zero dependencies
- **Example:** `Note`, `Folder`, `Tag`, `CLUTTERED_FOLDER_ID`

### 2️⃣ **state** — Zustand Stores

- **Can import from:** ✅ domain
- **Cannot import from:** ❌ shared, editor, ui, apps
- **Purpose:** Global application state management
- **Example:** `useNotesStore`, `useTagsStore`, `useFoldersStore`

### 3️⃣ **shared** — Utilities & Hooks

- **Can import from:** ✅ domain, state
- **Cannot import from:** ❌ editor, ui, apps
- **Purpose:** Reusable utilities and React hooks
- **Example:** `sortByOrder`, `useTheme`, `useConfirmation`

### 4️⃣ **editor** — Isolated Editor Engine

- **Can import from:** ✅ ui (presentational primitives only: icons, buttons, design tokens)
- **Cannot import from:** ❌ domain, state, shared (enforced as **errors**)
- **Purpose:** TipTap-based editor with plugins and behaviors
- **Status:** ✅ **Fully isolated from app logic (domain/state)**
  - App dependencies injected via `EditorProvider`
  - UI dependencies allowed for presentational components (pragmatic isolation)

### 5️⃣ **ui** — Presentational Components

- **Can import from:** ✅ domain, state, editor (for composition)
- **Cannot import from:** None (top-level consumer)
- **Purpose:** Reusable UI components and design system
- **Example:** `AppSidebar`, `ListItem`, `TagPill`, `FloatingToolbar`

### 6️⃣ **apps** — Composition Layer

- **Can import from:** ✅ domain, state, shared, editor, ui
- **Purpose:** Compose packages into complete applications
- **Responsibilities:**
  - Routing
  - Platform-specific concerns (Tauri, web)
  - Adapter layer (e.g., `noteToEditorDocument`)

---

## 📋 Dependency Graph

```
domain (pure types)
  ↓
state (Zustand stores)
  ↓
shared (utils & hooks)
  ↓
ui (components)
  ↓
apps (composition)

editor (isolated)
  ↑
apps (inject dependencies)
```

---

## 🎯 Design Principles

### **1. Dependency Inversion**

- Lower-level packages (domain, state) don't know about higher-level packages (ui, apps)
- Editor is isolated and receives dependencies via context/props

### **2. Single Responsibility**

- `domain`: Types only
- `state`: State management only
- `shared`: Generic utilities only
- `editor`: Editing behavior only
- `ui`: Presentation only
- `apps`: Composition only

### **3. Explicit Public APIs**

- Each package exports through `index.ts`
- Deep imports (e.g., `@clutter/ui/internal/...`) are discouraged

### **4. Testability**

- Pure functions in `shared` are easy to test
- Stores in `state` can be tested in isolation
- Editor can be tested without app state

---

## 🚨 Boundary Violations

If you see an ESLint error like:

```
❌ domain cannot import from other packages. It must remain pure (types & constants only).
```

This means you're violating an architectural boundary. To fix:

1. **Move the code to the correct package**
   - If it's a type → `domain`
   - If it's state → `state`
   - If it's a utility → `shared`
   - If it's UI → `ui`

2. **Use dependency injection**
   - If editor needs app state → inject via `EditorProvider`
   - If a component needs state → use Zustand hooks

3. **Refactor the dependency**
   - If `domain` needs a utility → move the utility to `domain`
   - If `state` needs a utility → move it to `domain` or keep it in `state`

---

## ✅ Completed: Editor Isolation (Phase 2-4)

### **Editor Extraction & Isolation - COMPLETE**

The editor package is now **fully isolated from app logic**:

1. ✅ **Phase 2:** `EditorProvider` created for dependency injection
2. ✅ **Phase 3:** Removed all `@clutter/domain`, `@clutter/state`, and `@clutter/shared` imports
3. ✅ **Phase 4:** ESLint rules changed from `warn` to `error` for domain/state/shared
4. ✅ **Pragmatic UI Boundary:** Editor imports UI presentational primitives (icons, buttons, tokens)

**Result:**

- ✅ Fully isolated from app state and business logic
- ✅ Reusable in any context (desktop, web, mobile)
- ✅ Testable without mocking app state
- ✅ Ready for collaborative editing
- ✅ Pragmatic: Uses shared design system (no duplication)

---

## ✅ Completed: UI Package Boundary Enforcement (Phase 4.5)

### **UI → Editor Boundary Enforcement - COMPLETE**

The UI package boundary rule has been upgraded from `'warn'` to `'error'`:

1. ✅ **ESLint Rule:** Changed from warning to error level in `packages/ui/.eslintrc.js`
2. ✅ **Documented Exceptions:** Three temporary exceptions documented with inline comments:
   - `TipTapWrapper.tsx` - Composition/adapter component (should move to apps/)
   - `useEditorContext.ts` - State adapter hook (should move to apps/)
   - `FloatingToolbar.tsx` - Editor behavior component (should move to editor/ or apps/)
3. ✅ **Exception Tracking:** Created `packages/ui/ARCHITECTURAL_EXCEPTIONS.md` to track migration plan
4. ✅ **Verification:** ESLint enforces boundary with zero violations outside documented exceptions

**Result:**

- ✅ Architectural boundaries enforced at build time (error level)
- ✅ All exceptions documented with migration plans
- ✅ Clear separation: UI = presentational, Apps = composition
- ✅ Ready for Phase 5: Move adapters to apps layer

**Migration Path (Phase 5):**
- Move `TipTapWrapper.tsx` → `apps/desktop/adapters/`
- Move `useEditorContext.ts` → `apps/desktop/adapters/`
- Move `FloatingToolbar.tsx` → `@clutter/editor` or `apps/desktop/components/`

---

## 🔒 Transaction Mutation Ownership

### **Critical Architectural Rule**

**Only `@clutter/editor` may manipulate ProseMirror transactions.**

This rule ensures data integrity, prevents attribute loss, and maintains clear boundaries between presentation and behavior layers.

### **What This Means**

**✅ Editor Package (`@clutter/editor`):**

- ✅ May create and mutate ProseMirror transactions
- ✅ May call `tr.setNodeMarkup`, `tr.delete`, `tr.insert`, etc.
- ✅ May import from `@tiptap/pm/state`, `@tiptap/pm/model`
- ✅ Must use centralized functions: `updateBlockAttrs()`, `createBlock()`

**❌ UI Package (`@clutter/ui`):**

- ❌ May NOT manipulate ProseMirror transactions directly
- ❌ May NOT call `tr.setNodeMarkup` or other transaction methods
- ❌ May NOT import from `@tiptap/pm/state`
- ✅ Must call editor commands or APIs only
- ✅ Stays in React/presentation layer

**❌ Other Packages (`@clutter/domain`, `@clutter/state`, `@clutter/shared`):**

- ❌ May NOT import ProseMirror types or manipulate transactions
- ✅ Define pure types and business logic only

### **Enforcement**

1. **Centralized Mutation APIs:**
   - `updateBlockAttrs()` - Single source of truth for attribute updates
   - `createBlock()` - Single source of truth for block creation
   - No raw `setNodeMarkup` calls outside these functions (except documented exceptions)

2. **ESLint Boundaries:**
   - Editor cannot import from `domain`, `state`, `shared`
   - UI can import from editor for commands/types only
   - Transaction manipulation only in editor package

3. **Code Review:**
   - Any `setNodeMarkup` call triggers review
   - Any `@tiptap/pm` import outside editor triggers review

### **Why This Matters**

**Without this rule:**

- ❌ Attribute loss (especially `blockId`)
- ❌ Invariant violations scattered across packages
- ❌ Difficult debugging (who changed what?)
- ❌ Architecture drift over time

**With this rule:**

- ✅ Single source of truth for mutations
- ✅ Invariants enforced centrally
- ✅ Clear ownership and debugging
- ✅ Stable, predictable behavior

---

## 🔍 Checking Boundaries

```bash
# Run ESLint to check all boundaries
npm run lint

# Check a specific package
npx eslint packages/domain --ext .ts,.tsx

# See all boundary violations
npx eslint packages --ext .ts,.tsx | grep "no-restricted-imports"
```

---

## 📚 Related Documents

- `PROJECT_STRUCTURE.md` — Detailed file structure
- `packages/editor/types/EditorDocument.ts` — Editor's data contract
- `apps/desktop/adapters/` — Adapter layer between app and editor

---

**Last Updated:** Phase 4.5 Complete (UI Boundary Enforcement) - January 2026
