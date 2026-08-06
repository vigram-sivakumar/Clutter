/**
 * Test expectations and assertions.
 *
 * Higher-level assertions that encapsulate common checks.
 * Tests use these instead of raw Playwright expect() calls where it makes sense.
 *
 * Example:
 *   await expectFolderVisible(page, folderId);
 *   await expectNoteTitle(page, 'My Note');
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { testIds } from '../../src/devtools/testIds';

/**
 * Assert that a folder is visible in the sidebar.
 */
export async function expectFolderVisible(page: Page, folderId: string): Promise<void> {
  const folder = page.locator(`[data-testid="${testIds.sidebar.folderItem(folderId)}"]`);
  await expect(folder).toBeVisible();
}

/**
 * Assert that a folder is NOT visible in the sidebar.
 */
export async function expectFolderHidden(page: Page, folderId: string): Promise<void> {
  const folder = page.locator(`[data-testid="${testIds.sidebar.folderItem(folderId)}"]`);
  await expect(folder).not.toBeVisible();
}

/**
 * Assert that a note is visible in the sidebar.
 */
export async function expectNoteVisible(page: Page, pageId: string): Promise<void> {
  const note = page.locator(`[data-testid="${testIds.sidebar.noteItem(pageId)}"]`);
  await expect(note).toBeVisible();
}

/**
 * Assert that a note is NOT visible in the sidebar.
 */
export async function expectNoteHidden(page: Page, pageId: string): Promise<void> {
  const note = page.locator(`[data-testid="${testIds.sidebar.noteItem(pageId)}"]`);
  await expect(note).not.toBeVisible();
}

/**
 * Assert the title of the active note in the editor.
 */
export async function expectNoteTitle(page: Page, title: string): Promise<void> {
  const titleInput = page.locator(`[data-testid="${testIds.editor.titleInput}"]`);
  await expect(titleInput).toHaveValue(title);
}

/**
 * Assert the body text contains a specific substring.
 */
export async function expectBodyContains(page: Page, text: string): Promise<void> {
  const bodyContent = page.locator(`[data-testid="${testIds.editor.bodyContent}"]`);
  await expect(bodyContent).toContainText(text);
}

/**
 * Assert the active page label matches a specific name.
 */
export async function expectActivePageLabel(page: Page, label: string): Promise<void> {
  const pageLabel = page.locator(`[data-testid="${testIds.navigation.activePageLabel}"]`);
  await expect(pageLabel).toContainText(label);
}

/**
 * Assert that a specific number of folders are visible in the sidebar.
 */
export async function expectFolderCount(page: Page, count: number): Promise<void> {
  const folders = page.locator(`[data-testid*="sidebar.folderItem"]`);
  await expect(folders).toHaveCount(count);
}

/**
 * Assert that a specific number of notes are visible in the sidebar.
 */
export async function expectNoteCount(page: Page, count: number): Promise<void> {
  const notes = page.locator(`[data-testid*="sidebar.noteItem"]`);
  await expect(notes).toHaveCount(count);
}

/**
 * Assert that a folder is expanded (children visible).
 */
export async function expectFolderExpanded(page: Page, folderId: string): Promise<void> {
  const expandButton = page.locator(
    `[data-testid="${testIds.sidebar.expandFolder(folderId)}"]`,
  );
  await expect(expandButton).toHaveAttribute('aria-expanded', 'true');
}

/**
 * Assert that a folder is collapsed (children hidden).
 */
export async function expectFolderCollapsed(page: Page, folderId: string): Promise<void> {
  const expandButton = page.locator(
    `[data-testid="${testIds.sidebar.expandFolder(folderId)}"]`,
  );
  await expect(expandButton).toHaveAttribute('aria-expanded', 'false');
}
