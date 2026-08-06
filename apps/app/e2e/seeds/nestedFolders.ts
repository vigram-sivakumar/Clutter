/**
 * Nested folders workspace seed.
 *
 * Sets up a vault with:
 * - 3 folders: "Projects", "Notes", "Archive"
 * - 2-level nesting: "Projects/Active", "Projects/Completed"
 * - 5-10 sample notes distributed across folders
 *
 * Useful for testing folder navigation, sidebar tree, and move operations.
 *
 * TODO (Phase 2): Implement file creation via devtools filesystem API.
 * For now, this is a stub that resets workspace state.
 */

import type { Page } from '@playwright/test';

export async function nestedFoldersSeed(page: Page): Promise<void> {
  // Reset workspace via devtools API
  await page.evaluate(() => {
    if (!window.__clutter_devtools?.workspace?.reset) {
      throw new Error('DevTools not available. Make sure VITE_DEVTOOLS=true');
    }
    window.__clutter_devtools.workspace.reset();
  });

  // TODO: Create folder structure
  // This will involve:
  // 1. Adding a filesystem API to devtools (Phase 2)
  // 2. Creating .md files for each folder/note
  // 3. Waiting for the app's watcher to recognize the new files

  await page.waitForLoadState('networkidle');
}
