# Clutter E2E Tests

End-to-end tests for the Clutter application using Playwright.

## Quick Start

```bash
# Run all tests
npm run test:e2e

# Run in headed mode (watch the browser)
npm run test:e2e -- --headed

# Open interactive debug UI
npm run test:e2e -- --ui
```

## Structure

- **`specs/`** — Test files (`.spec.ts`). Each file tests one feature area (sidebar, editor, etc.)
- **`seeds/`** — Workspace builders that set up deterministic test state (empty vault, nested folders, large vault)
- **`surfaces/`** — UI abstraction layer. Encapsulates Playwright selectors and exposes semantic actions (`sidebar.createFolder()`, `editor.setTitle()`, etc.)
- **`helpers/`** — Utility functions for waiting, assertions, and app operations

## Writing a Test

1. Import a `Seed` to set up test state
2. Create `Surface` objects to interact with the UI
3. Use `Helpers` for waiting and asserting

```typescript
import { test } from '@playwright/test';
import { Sidebar } from '../surfaces/Sidebar';
import { seed } from '../seeds';
import { loadApp, waitForAutosave } from '../helpers';

test('can create a folder', async ({ page }) => {
  await loadApp(page);
  await seed(page, 'empty');
  
  const sidebar = new Sidebar(page);
  await sidebar.createFolder('My Folder');
  await waitForAutosave(page);
});
```

## Test IDs

All interactive elements use centralized `data-testid` attributes defined in `src/devtools/testIds.ts`.

Components use these constants:
```typescript
import { testIds } from '../src/devtools/testIds';

<button data-testid={testIds.sidebar.createFolderButton}>+ Folder</button>
```

Tests also import the same constants to select elements:
```typescript
page.locator(`[data-testid="${testIds.sidebar.createFolderButton}"]`)
```

## For More Details

See `../TESTING.md` for comprehensive conventions, best practices, and debugging tips.
