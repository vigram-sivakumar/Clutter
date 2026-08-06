/**
 * Empty workspace seed.
 *
 * Sets up a fresh app with:
 * - Clean workspace state (no active page/folder)
 * - Empty vault (no files)
 *
 * This is the minimal state to start a test.
 *
 * Note: Phase 1 uses an empty vault by assuming tests start with a fresh
 * app instance pointing to an empty directory. Phase 2 will add vault
 * clearing via the devtools API, enabling test isolation without app reload.
 */

import type { Page } from '@playwright/test';

export async function emptySeed(page: Page): Promise<void> {
  // Reset workspace via devtools API (clears active page, navigation history)
  await page.evaluate(() => {
    if (!window.__clutter_devtools?.workspace?.reset) {
      throw new Error('DevTools not available. Make sure VITE_DEVTOOLS=true');
    }
    window.__clutter_devtools.workspace.reset();
  });

  // Wait for the app to stabilize
  await page.waitForLoadState('networkidle');
}
