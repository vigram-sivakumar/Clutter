/**
 * Large vault workspace seed.
 *
 * Sets up a vault with 100+ notes for performance testing.
 *
 * Useful for testing:
 * - Sidebar performance with many items
 * - Search performance
 * - Vault indexing speed
 * - Memory usage under load
 *
 * TODO (Phase 2): Implement file generation via devtools filesystem API.
 * For now, this is a stub that resets workspace state.
 */

import type { Page } from '@playwright/test';

export async function largeVaultSeed(page: Page): Promise<void> {
  // Reset workspace via devtools API
  await page.evaluate(() => {
    if (!window.__clutter_devtools?.workspace?.reset) {
      throw new Error('DevTools not available. Make sure VITE_DEVTOOLS=true');
    }
    window.__clutter_devtools.workspace.reset();
  });

  // TODO: Generate 100+ sample markdown files
  // This will involve:
  // 1. Adding a filesystem API to devtools (Phase 2)
  // 2. Creating .md files with realistic content
  // 3. Waiting for the app's indexing to complete

  await page.waitForLoadState('networkidle');
}
