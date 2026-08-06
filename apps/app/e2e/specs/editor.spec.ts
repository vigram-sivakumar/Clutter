/**
 * Editor feature tests.
 *
 * Tests note editing, autosave, and title changes.
 */

import { test, expect } from '@playwright/test';
import { Editor } from '../surfaces/Editor';
import { Sidebar } from '../surfaces/Sidebar';
import { seed } from '../seeds';
import { loadApp } from '../helpers/app';
import { waitForAutosave, expectNoteTitle, expectBodyContains } from '../helpers';

test.describe('Editor', () => {
  test.beforeEach(async ({ page }) => {
    // Load the app and seed with an empty vault
    await loadApp(page);
    await seed(page, 'empty');
  });

  test('can edit note title', async ({ page }) => {
    const editor = new Editor(page);
    const sidebar = new Sidebar(page);

    // Create a note
    await sidebar.createNote();

    // Edit the title
    const newTitle = 'My New Note';
    await editor.setTitle(newTitle);

    // Assert the title changed
    await expectNoteTitle(page, newTitle);

    // Wait for autosave
    await waitForAutosave(page);
  });

  test('can edit note body', async ({ page }) => {
    const editor = new Editor(page);
    const sidebar = new Sidebar(page);

    // Create a note
    await sidebar.createNote();

    // Type into the body
    const bodyText = 'This is my note content.';
    await editor.typeBody(bodyText);

    // Assert the body contains our text
    await expectBodyContains(page, bodyText);

    // Wait for autosave
    await waitForAutosave(page);
  });

  test('autosaves after typing', async ({ page }) => {
    const editor = new Editor(page);
    const sidebar = new Sidebar(page);

    // Create a note
    await sidebar.createNote();

    // Type and wait for autosave
    await editor.typeBody('Test content');
    await waitForAutosave(page);

    // Reload and verify content persisted
    await page.reload();
    await expect(editor.bodyContent).toContainText('Test content');
  });

  test('clears editor when no note is selected', async ({ page }) => {
    const editor = new Editor(page);

    // TODO: Once we have proper page closing, test this
    test.skip();
  });
});
