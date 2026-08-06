/**
 * App-level helpers for common operations.
 *
 * - Loading the app
 * - Resetting state between tests
 * - Reloading the app
 */

import type { Page } from '@playwright/test';
import { waitForAppReady } from './wait';

/**
 * Load the Clutter app and wait for it to be ready.
 *
 * Example:
 *   await loadApp(page);
 *   // Now the sidebar and editor are visible
 */
export async function loadApp(page: Page, timeout = 10000): Promise<void> {
  await page.goto('/');
  await waitForAppReady(page, timeout);
}

/**
 * Reset the app workspace state between tests.
 *
 * Clears active navigation, closes open pages, clears history.
 * Requires devtools API to be available (VITE_DEVTOOLS=true, set in playwright.config.ts).
 *
 * Vault clearing (deleting .md files) is handled by the seed functions,
 * which can work with a fresh vault directory for each test.
 */
export async function resetAppState(page: Page): Promise<void> {
  const hasDevTools = await page.evaluate(() => {
    return typeof window.__clutter_devtools !== 'undefined';
  });

  if (!hasDevTools) {
    throw new Error(
      'DevTools API not available. Make sure VITE_DEVTOOLS=true in playwright.config.ts',
    );
  }

  await page.evaluate(() => {
    window.__clutter_devtools?.workspace?.reset();
  });
}

/**
 * Reload the app in the browser.
 *
 * Useful for testing app startup and initialization.
 */
export async function reloadApp(page: Page, timeout = 10000): Promise<void> {
  await page.reload();
  await waitForAppReady(page, timeout);
}
