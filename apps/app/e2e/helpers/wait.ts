/**
 * Wait helpers for test synchronization.
 *
 * Use these to wait for specific app states instead of arbitrary sleep() calls.
 * Makes tests more reliable and faster.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { testIds } from '../../src/devtools/testIds';

/**
 * Wait for the app to finish loading (UI is interactive).
 */
export async function waitForAppReady(page: Page, timeout = 5000): Promise<void> {
  // Wait for the sidebar and editor to be visible
  const sidebar = page.locator(`[data-testid="${testIds.sidebar.root}"]`);
  const editor = page.locator(`[data-testid="${testIds.editor.root}"]`);

  await Promise.all([
    sidebar.waitFor({ state: 'visible', timeout }),
    editor.waitFor({ state: 'visible', timeout }),
  ]);
}

/**
 * Wait for autosave to complete after an edit.
 *
 * This waits for the autosave indicator to appear and then disappear,
 * ensuring the document has been persisted.
 */
export async function waitForAutosave(page: Page, timeout = 5000): Promise<void> {
  const indicator = page.locator(`[data-testid="${testIds.editor.autoSaveIndicator}"]`);

  // Wait for the indicator to appear (saving)
  await indicator.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {
    // It's ok if this times out — autosave might be instant
  });

  // Wait for the indicator to disappear (saved)
  await indicator.waitFor({ state: 'hidden', timeout });
}

/**
 * Wait for a folder to appear in the sidebar.
 */
export async function waitForFolderInSidebar(
  page: Page,
  folderId: string,
  timeout = 5000,
): Promise<void> {
  const folder = page.locator(`[data-testid="${testIds.sidebar.folderItem(folderId)}"]`);
  await expect(folder).toBeVisible({ timeout });
}

/**
 * Wait for a note to appear in the sidebar.
 */
export async function waitForNoteInSidebar(
  page: Page,
  pageId: string,
  timeout = 5000,
): Promise<void> {
  const note = page.locator(`[data-testid="${testIds.sidebar.noteItem(pageId)}"]`);
  await expect(note).toBeVisible({ timeout });
}

/**
 * Wait for the editor to display a specific note.
 */
export async function waitForNoteInEditor(
  page: Page,
  pageId: string,
  timeout = 5000,
): Promise<void> {
  const editor = page.locator(`[data-testid="${testIds.editor.root}"]`);
  const activeNoteId = editor.getAttribute('data-note-id');

  await expect(activeNoteId).resolves.toBe(pageId);
}

/**
 * Wait for the sidebar to be empty (no notes or folders).
 */
export async function waitForEmptySidebar(page: Page, timeout = 5000): Promise<void> {
  const notes = page.locator(`[data-testid*="sidebar.noteItem"]`);
  const folders = page.locator(`[data-testid*="sidebar.folderItem"]`);

  await expect(notes).toHaveCount(0, { timeout });
  await expect(folders).toHaveCount(0, { timeout });
}
