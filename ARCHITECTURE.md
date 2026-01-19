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

## 💾 Data Persistence Architecture

### **Current State (Phase 0)**

**Status:** In-memory only (notes, folders, tags)

The application currently has **two-tier persistence**:

#### Tier 1: Persisted (localStorage)

- ✅ `uiState` - Sidebar state, collapsed groups, calendar view
- ✅ `theme` - Dark/light mode preference
- ✅ `ordering` - Custom ordering for notes and folders

**Implementation:** Zustand `persist` middleware with localStorage

#### Tier 2: Not Persisted (memory only)

- ❌ `notes` - All note content and metadata
- ❌ `folders` - Folder structure
- ❌ `tags` - Tag definitions and metadata
- ❌ `currentDate` - Date tracking for daily notes

**Impact:** All user content is lost on app refresh/restart

### **Migration Plan**

#### Phase 1: localStorage Persistence (Short-term)

**Goal:** Quick win to prevent data loss during development

```typescript
// Add to packages/state/src/stores/notes.ts
import { persist } from 'zustand/middleware';

export const useNotesStore = create<NotesStore>()(
  persist(
    (set, get) => ({
      // ... store implementation
    }),
    {
      name: 'clutter-notes-storage',
      storage: /* same safe localStorage wrapper as uiState */
    }
  )
);
```

**Pros:**

- Quick to implement (follow uiState pattern)
- No backend changes needed
- Works immediately in browser and Tauri

**Cons:**

- Limited storage capacity (~5-10MB)
- No relational queries
- JSON serialization overhead
- Not suitable for large note collections

#### Phase 2: SQLite Backend (Medium-term)

**Goal:** Production-ready persistence with proper database

**Architecture:**

```
┌─────────────────────────────────────┐
│         React Frontend              │
│    (Zustand stores + UI)            │
└──────────────┬──────────────────────┘
               │
               │ Tauri Commands
               │ (IPC Bridge)
               ▼
┌─────────────────────────────────────┐
│       Tauri Rust Backend            │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   SQLite Database            │  │
│  │   - notes.db                 │  │
│  │   - Tables: notes, folders,  │  │
│  │     tags, tag_metadata       │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Implementation Steps:**

1. **Database Schema Design**
   - Define tables for notes, folders, tags, tag_metadata
   - Add indexes for common queries (search, date ranges)
   - Design relationships (foreign keys)

2. **Tauri Commands** (Rust backend)

   ```rust
   #[tauri::command]
   async fn get_all_notes() -> Result<Vec<Note>, String>

   #[tauri::command]
   async fn create_note(note: Note) -> Result<Note, String>

   #[tauri::command]
   async fn update_note(id: String, updates: NoteUpdates) -> Result<(), String>
   ```

3. **Store Refactoring** (TypeScript frontend)
   - Replace local state mutations with Tauri command calls
   - Add optimistic updates for better UX
   - Handle async operations and error states

4. **Migration**
   - Detect localStorage data on first SQLite launch
   - Automatically migrate to SQLite
   - Keep localStorage backup for rollback

**Pros:**

- Unlimited storage capacity
- Fast queries with indexes
- Relational data integrity
- Native file system access
- Foundation for advanced features

**Cons:**

- More complex implementation
- Requires Rust backend code
- Async operations (latency considerations)

#### Phase 3: Cloud Sync (Long-term)

**Goal:** Multi-device synchronization

- SQLite remains local source of truth
- Background sync to cloud backend
- Conflict resolution for concurrent edits
- Offline-first architecture

### **Design Principles**

1. **Local-First**
   - Local database is always authoritative
   - Cloud is backup/sync layer only
   - App works fully offline

2. **Optimistic Updates**
   - UI updates immediately
   - Background persistence
   - Rollback on errors

3. **Single Writer**
   - Each store owns its persistence logic
   - No cross-store transactions (simplicity over ACID)
   - Tags cache is derived state (recalculated on load)

4. **Migration Safety**
   - Always support data export before migrations
   - Automatic backups before schema changes
   - Rollback capability

### **Current Limitations**

See `KNOWN_ISSUES.md` for details on:

- Data loss on refresh (critical)
- No export/import functionality
- No backup mechanism

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

- `README.md` — Project overview and getting started
- `KNOWN_ISSUES.md` — Known issues and technical debt
- `DEV_SETUP.md` — Development workflow and troubleshooting
- `PROJECT_STRUCTURE.md` — Detailed file structure
- `packages/editor/types/EditorDocument.ts` — Editor's data contract
- `packages/ui/ARCHITECTURAL_EXCEPTIONS.md` — Tracked boundary exceptions
- `apps/desktop/adapters/` — Adapter layer between app and editor

---

**Last Updated:** January 19, 2026 - Added Data Persistence Architecture section
