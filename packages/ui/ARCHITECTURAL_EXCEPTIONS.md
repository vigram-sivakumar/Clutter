# UI Package - Architectural Exceptions

## Overview

The UI package has strict boundaries enforced by ESLint:
- ✅ CAN import: `@clutter/domain`, `@clutter/state`, `@clutter/shared`
- ❌ CANNOT import: `@clutter/editor`, `apps`

This document tracks temporary exceptions to this rule.

## Current Exceptions

### 1. TipTapWrapper.tsx
**File:** `src/components/app-layout/pages/note/TipTapWrapper.tsx`

**Violation:** Imports multiple components from `@clutter/editor`

**Reason:** This is a composition/adapter component that wraps EditorCore with a string-based API for backward compatibility. It bridges the app layer and editor layer.

**Status:** Temporary - should move to `apps/desktop/adapters/` in Phase 5

**Resolution Plan:**
- Move to apps layer when composition pattern is finalized
- Keep as part of platform-specific implementation

---

### 2. useEditorContext.ts
**File:** `src/components/app-layout/pages/note/useEditorContext.ts`

**Violation:** Imports `EditorContextValue`, `EditorTag`, `EditorLinkedNote`, `EditorFolder` from `@clutter/editor`

**Reason:** This hook adapts Zustand stores into EditorContextValue. It's the boundary/adapter between app state and editor dependencies.

**Status:** Temporary - documented in code comments

**Resolution Plan:**
- Move to apps layer when Phase 5 splits shared → domain + state
- This is pure adapter logic that belongs in the composition layer

---

### 3. FloatingToolbar.tsx
**File:** `src/components/ui-primitives/FloatingToolbar.tsx`

**Violation:** Imports `addTagToBlock`, `isMultiBlockSelection` from `@clutter/editor`

**Reason:** Toolbar needs editor behavior utilities to interact with editor state. These are editor-specific operations.

**Status:** Temporary

**Resolution Plan:**
- Option A: Move FloatingToolbar to editor package (preferred)
- Option B: Move to apps layer as composition component
- Option C: Extract utilities to shared package (if they become generic)

---

## Enforcement

ESLint rule changed from `'warn'` to `'error'` as of Phase 2-4 completion.

Exceptions are documented with:
```javascript
/* eslint-disable no-restricted-imports */
```

Each exception includes inline documentation explaining why it exists and when it will be resolved.

---

## Migration Tracking

**Phase 4 (Complete):** Editor isolation complete
**Phase 5 (Planned):** Move adapter/composition components to apps layer

When Phase 5 is complete, all exceptions should be removed and this file can be deleted.

---

**Last Updated:** January 2026
