/**
 * Navigation feature tests.
 *
 * Tests navigation between pages, back/forward buttons, and breadcrumbs.
 */

import { test, expect } from '@playwright/test';
import { Navigation } from '../surfaces/Navigation';
import { Sidebar } from '../surfaces/Sidebar';
import { seed } from '../seeds';
import { loadApp } from '../helpers/app';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Load the app and seed with nested folders
    await loadApp(page);
    await seed(page, 'nestedFolders');
  });

  test('displays active page label', async ({ page }) => {
    const navigation = new Navigation(page);

    // The navigation should show which page is active
    const label = await navigation.getActivePageLabel();
    expect(label).toBeTruthy();
  });

  test('back button is disabled on first page', async ({ page }) => {
    const navigation = new Navigation(page);

    // On initial load, back should be disabled
    const isBackEnabled = await navigation.isBackEnabled();
    expect(isBackEnabled).toBe(false);
  });

  test('back button enables after navigating to another page', async ({ page }) => {
    const navigation = new Navigation(page);
    const sidebar = new Sidebar(page);

    // TODO: Navigate to a different page
    // Then assert back button is enabled
    test.skip();
  });

  test('can navigate backward and forward', async ({ page }) => {
    const navigation = new Navigation(page);

    // TODO: Navigate forward, then back, then forward again
    // Verify we're at the right page each time
    test.skip();
  });
});
