/**
 * Sidebar feature tests.
 *
 * Tests the folder tree, note list, and sidebar actions.
 */

import { test, expect } from '@playwright/test';
import { Sidebar } from '../surfaces/Sidebar';
import { seed } from '../seeds';
import { loadApp } from '../helpers/app';

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    // Load the app and seed with an empty vault
    await loadApp(page);
    await seed(page, 'empty');
  });

  test('displays empty state when vault is empty', async ({ page }) => {
    const sidebar = new Sidebar(page);

    // Sidebar should be visible but empty
    await expect(sidebar.root).toBeVisible();
    // TODO: Add expectation for empty state once component is built
  });

  test('can create a folder', async ({ page }) => {
    const sidebar = new Sidebar(page);

    // Create a folder
    await sidebar.createFolder('My Project');

    // TODO: Assert that the folder appears in the sidebar
    // Once we have folder IDs from the create operation, we can use:
    // await expectFolderVisible(page, folderId);
  });

  test('can create a note', async ({ page }) => {
    const sidebar = new Sidebar(page);

    // Create a note
    await sidebar.createNote();

    // TODO: Assert that the note appears in the sidebar
  });

  test('can expand and collapse folders', async ({ page }) => {
    // TODO: Implement once we have nested folder structure
    test.skip();
  });

  test('can navigate to a note by clicking it', async ({ page }) => {
    // TODO: Implement once we have note creation working
    test.skip();
  });
});
