/**
 * Sidebar Surface Object
 *
 * Encapsulates interactions with the left sidebar (folder tree, page list, actions).
 * Tests don't directly use Playwright selectors; they call methods like sidebar.createFolder().
 *
 * Surface Objects (vs. Page Objects) are lightweight abstractions focused on a UI surface/area,
 * not a full page. This keeps tests readable and maintainable.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { testIds } from '../../src/devtools/testIds';

export class Sidebar {
  constructor(private page: Page) {}

  /**
   * Get the sidebar root element.
   */
  get root(): Locator {
    return this.page.locator(`[data-testid="${testIds.sidebar.root}"]`);
  }

  /**
   * Click the "Create Folder" button.
   */
  async createFolder(name?: string): Promise<void> {
    await this.page.locator(`[data-testid="${testIds.sidebar.createFolderButton}"]`).click();

    if (name) {
      // If a name is provided, type it in the input that appears
      const input = this.page.locator(`[data-testid="${testIds.dialogs.renameInput}"]`);
      await input.fill(name);
      await this.page.locator(`[data-testid="${testIds.dialogs.confirmRenameButton}"]`).click();
    }
  }

  /**
   * Click the "Create Note" button.
   */
  async createNote(): Promise<void> {
    await this.page.locator(`[data-testid="${testIds.sidebar.createNoteButton}"]`).click();
  }

  /**
   * Click on a folder to select it.
   */
  async selectFolder(folderId: string): Promise<void> {
    await this.page.locator(`[data-testid="${testIds.sidebar.folderItem(folderId)}"]`).click();
  }

  /**
   * Click on a note to open it.
   */
  async selectNote(pageId: string): Promise<void> {
    await this.page.locator(`[data-testid="${testIds.sidebar.noteItem(pageId)}"]`).click();
  }

  /**
   * Expand a folder (if not already expanded).
   */
  async expandFolder(folderId: string): Promise<void> {
    const folder = this.page.locator(`[data-testid="${testIds.sidebar.expandFolder(folderId)}"]`);
    const isExpanded = await folder.getAttribute('aria-expanded');

    if (isExpanded !== 'true') {
      await folder.click();
    }
  }

  /**
   * Collapse a folder (if not already collapsed).
   */
  async collapseFolder(folderId: string): Promise<void> {
    const folder = this.page.locator(`[data-testid="${testIds.sidebar.expandFolder(folderId)}"]`);
    const isExpanded = await folder.getAttribute('aria-expanded');

    if (isExpanded === 'true') {
      await folder.click();
    }
  }

  /**
   * Right-click on a folder to open context menu.
   */
  async openFolderContextMenu(folderId: string): Promise<void> {
    await this.page
      .locator(`[data-testid="${testIds.sidebar.folderItem(folderId)}"]`)
      .click({ button: 'right' });
  }

  /**
   * Right-click on a note to open context menu.
   */
  async openNoteContextMenu(pageId: string): Promise<void> {
    await this.page
      .locator(`[data-testid="${testIds.sidebar.noteItem(pageId)}"]`)
      .click({ button: 'right' });
  }

  /**
   * Check if a folder is visible in the sidebar.
   */
  async isFolderVisible(folderId: string): Promise<boolean> {
    const folder = this.page.locator(`[data-testid="${testIds.sidebar.folderItem(folderId)}"]`);
    return folder.isVisible();
  }

  /**
   * Check if a note is visible in the sidebar.
   */
  async isNoteVisible(pageId: string): Promise<boolean> {
    const note = this.page.locator(`[data-testid="${testIds.sidebar.noteItem(pageId)}"]`);
    return note.isVisible();
  }

  /**
   * Get text of a folder item (used for assertions).
   */
  async getFolderText(folderId: string): Promise<string> {
    const folder = this.page.locator(`[data-testid="${testIds.sidebar.folderItem(folderId)}"]`);
    return (await folder.textContent()) ?? '';
  }

  /**
   * Get text of a note item (used for assertions).
   */
  async getNoteText(pageId: string): Promise<string> {
    const note = this.page.locator(`[data-testid="${testIds.sidebar.noteItem(pageId)}"]`);
    return (await note.textContent()) ?? '';
  }
}
