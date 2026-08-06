# Clutter Testing Guide

This document establishes conventions for Clutter's test infrastructure. Follow these patterns as the test suite grows.

## Quick Start

```bash
# Run all e2e tests
npm run test:e2e

# Run a specific test file
npm run test:e2e -- sidebar.spec.ts

# Run tests in headed mode (see the browser)
npm run test:e2e -- --headed

# Run tests with UI (interactive mode)
npm run test:e2e -- --ui

# Debug a specific test
npm run test:e2e -- sidebar.spec.ts --debug
```

## Test Structure

```
e2e/
├── specs/              ← Test files (*.spec.ts)
├── seeds/              ← Workspace seed builders (setup data)
├── surfaces/           ← Surface Objects (UI abstraction)
├── helpers/            ← Utility functions
└── playwright.config.ts
```

### 1. Seeds (Workspace Setup)

Seeds are TypeScript builders that set up deterministic starting state. Use seeds instead of building test data inline.

**When to use a seed:**
- Every test should start with a known, reproducible vault state
- Use `empty` for most tests (fresh start)
- Use `nestedFolders` for sidebar/tree tests
- Use `largeVault` for performance testing

**How to use:**
```typescript
import { seed } from '../seeds';

test('can create a folder', async ({ page }) => {
  await loadApp(page);
  await seed(page, 'empty');  // Fresh vault, no files
  
  // Now test...
});
```

**Creating a new seed:**
1. Add a builder function in `e2e/seeds/{name}.ts`
2. Export it in `e2e/seeds/index.ts`
3. Register it in the `seeds` map
4. Document what state it creates in a comment

### 2. Surface Objects (UI Abstraction)

Surface Objects encapsulate interactions with a UI area (sidebar, editor, navigation). Tests call methods like `sidebar.createFolder()` instead of using raw Playwright selectors.

**Key principle:** Tests should never use `page.locator(...)` directly. All Playwright logic lives in Surface Objects.

**When to create a new Surface:**
- A new feature area is added to the UI
- Multiple tests interact with the same UI region
- The abstraction is reusable across multiple tests

**Surface Object pattern:**
```typescript
export class Sidebar {
  constructor(private page: Page) {}

  // Encapsulate Playwright selectors
  private get root(): Locator {
    return this.page.locator(`[data-testid="${testIds.sidebar.root}"]`);
  }

  // Expose semantic actions
  async createFolder(name: string): Promise<void> {
    await this.page.locator(...).click();
    // Handle the dialog, etc.
  }

  // Expose read operations for assertions
  async isFolderVisible(folderId: string): Promise<boolean> {
    return this.page.locator(...).isVisible();
  }
}
```

**Test code using Surface Objects:**
```typescript
const sidebar = new Sidebar(page);
await sidebar.createFolder('My Project');
await expect(sidebar.isFolderVisible(folderId)).toBeTruthy();
```

### 3. Test IDs (Stable Selectors)

All interactive elements must have stable `data-testid` attributes defined in `src/devtools/testIds.ts`.

**Why centralized test IDs?**
- One source of truth — components and tests use the same constants
- Survives CSS and layout changes
- Easy to refactor selectors globally
- Prevents typos and mismatches

**How to add a test ID to a component:**

1. Define it in `src/devtools/testIds.ts`:
```typescript
export const testIds = {
  sidebar: {
    createFolderButton: 'sidebar.createFolderButton',
  },
};
```

2. Use it in the component:
```typescript
import { testIds } from '../devtools/testIds';

export function Sidebar() {
  return <button data-testid={testIds.sidebar.createFolderButton}>+ Folder</button>;
}
```

3. Use it in tests:
```typescript
import { testIds } from '../../src/devtools/testIds';

await page.locator(`[data-testid="${testIds.sidebar.createFolderButton}"]`).click();
```

**Naming convention:**
```
{surface}.{element}

sidebar.createFolderButton
editor.activeNote
navigation.backButton
dialogs.confirmDeleteButton
```

### 4. Test Helpers

Helpers are utility functions for common operations. Three categories:

#### wait.ts — Synchronization helpers
Wait for specific UI states instead of using `await page.waitForTimeout(1000)`.

```typescript
await waitForAppReady(page);
await waitForAutosave(page);
await waitForFolderInSidebar(page, folderId);
```

#### expectations.ts — Higher-level assertions
Semantic assertions that encapsulate common checks.

```typescript
await expectFolderVisible(page, folderId);
await expectNoteTitle(page, 'My Note');
await expectFolderCount(page, 3);
```

#### app.ts — App-level operations
Loading, resetting, and reloading the app.

```typescript
await loadApp(page);
await resetAppState(page);
```

## Writing a Test

### Template

```typescript
import { test, expect } from '@playwright/test';
import { Sidebar } from '../surfaces/Sidebar';
import { Editor } from '../surfaces/Editor';
import { seed } from '../seeds';
import { loadApp, waitForAutosave, expectFolderVisible } from '../helpers';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Load the app
    await loadApp(page);
    
    // 2. Seed test data
    await seed(page, 'empty');
  });

  test('describes what you are testing', async ({ page }) => {
    // 3. Create surface objects
    const sidebar = new Sidebar(page);
    const editor = new Editor(page);

    // 4. Act (perform the user action)
    await sidebar.createFolder('My Project');

    // 5. Assert (check the result)
    await expectFolderVisible(page, 'folderId');
    
    // 6. If the action triggers a save, wait for it
    await waitForAutosave(page);
  });
});
```

### Best Practices

**✅ Do:**
- Use Surface Objects and helpers
- One semantic action per test
- Name tests as "can X" or "displays Y"
- Use `beforeEach` to set up common state
- Import test IDs from `testIds.ts`
- Wait for async operations (autosave, file I/O)

**❌ Don't:**
- Use raw `page.locator()` in tests
- Use `setTimeout` or `await page.waitForTimeout()`
- Put multiple assertions in one test
- Import components directly into tests
- Hard-code CSS selectors
- Test implementation details (internal state)

## Devtools API (window.__clutter_devtools)

The devtools API provides test-only access to app state. It's optional and only available when `VITE_DEVTOOLS=true` (set in `playwright.config.ts`).

**Available in Phase 1:**
```typescript
window.__clutter_devtools.workspace.reset();  // Clear nav state
window.__clutter_devtools.workspace.clear();  // Delete vault files
```

**Future (Phase 2):**
```typescript
window.__clutter_devtools.vault.getPages();      // Read pages
window.__clutter_devtools.document.getContent(); // Read active doc
```

## Debugging Tests

### Run in headed mode to see what's happening:
```bash
npm run test:e2e -- --headed
```

### Open the interactive UI debugger:
```bash
npm run test:e2e -- --ui
```

### Debug a specific test:
```bash
npm run test:e2e -- sidebar.spec.ts --debug
```

### Check the HTML report after failure:
```bash
npm run test:e2e
# Then open: .artifacts/report/index.html
```

## CI/CD

The test suite runs on GitHub Actions with:
- Automatic failure screenshots and traces
- HTML report uploaded as artifact
- Tests run in parallel across browsers (once multi-browser is enabled)

Locally, tests run serially in dev mode with slow motion (50ms) so you can watch actions happen.

## Anatomy of the Test Infrastructure

```
Production App (src/)
        ▲
        │ (depends on, imports)
        │
e2e/    ├── specs/          ← Test files, import surfaces + helpers
        │   ├── sidebar.spec.ts
        │   ├── editor.spec.ts
        │   └── navigation.spec.ts
        │
        ├── surfaces/       ← UI abstraction layer, import testIds
        │   ├── Sidebar.ts
        │   ├── Editor.ts
        │   └── Navigation.ts
        │
        ├── seeds/          ← Data builders, call devtools API
        │   ├── empty.ts
        │   ├── nestedFolders.ts
        │   └── largeVault.ts
        │
        ├── helpers/        ← Utilities, import testIds
        │   ├── wait.ts
        │   ├── expectations.ts
        │   └── app.ts
        │
        └── playwright.config.ts

src/devtools/              ← Dev platform (optional, only in dev mode)
        ├── testIds.ts           ← Centralized selector constants
        ├── index.ts             ← Devtools API (window.__clutter_devtools)
        └── workspace/reset.ts   ← Workspace/vault reset logic

.artifacts/                ← Gitignored test outputs
        ├── report/
        ├── screenshots/
        └── traces/
```

**One-way dependency:** Tests depend on Production, never reverse.

## Common Issues

### "DevTools not available" error
**Cause:** `VITE_DEVTOOLS=true` environment variable not set  
**Fix:** It's automatically set in `playwright.config.ts`; restart the dev server

### Tests timeout waiting for autosave
**Cause:** The editor isn't actually saving the content  
**Fix:** Check that the editor component is wired to call `PageOperations.saveDocument()`

### Selector not found (data-testid missing)
**Cause:** Component doesn't have the expected `data-testid` attribute  
**Fix:** Add it to `testIds.ts`, then use it in the component with `data-testid={testIds.xxx}`

### Tests pass locally but fail in CI
**Cause:** Timing differences or environment setup  
**Fix:** Check that seeds properly wait for the app to recognize filesystem changes

## Next Steps

- **Phase 2:** Add state inspection API (`vault.getPages()`, `document.getContent()`)
- **Phase 3:** Browser DevTools extension for live state inspection
- **Phase 4:** Extend seeds with more complex scenarios (import, sync)
- **Phase 5:** Performance benchmarks and load testing
