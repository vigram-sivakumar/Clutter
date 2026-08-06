/**
 * Editor Surface Object
 *
 * Encapsulates interactions with the note editor (active document, title, body).
 */

import type { Page, Locator } from '@playwright/test';
import { testIds } from '../../src/devtools/testIds';

export class Editor {
  constructor(private page: Page) {}

  /**
   * Get the editor root element.
   */
  get root(): Locator {
    return this.page.locator(`[data-testid="${testIds.editor.root}"]`);
  }

  /**
   * Get the active note title input.
   */
  get titleInput(): Locator {
    return this.page.locator(`[data-testid="${testIds.editor.titleInput}"]`);
  }

  /**
   * Get the editor body content area.
   */
  get bodyContent(): Locator {
    return this.page.locator(`[data-testid="${testIds.editor.bodyContent}"]`);
  }

  /**
   * Get the current title of the active note.
   */
  async getTitle(): Promise<string> {
    return (await this.titleInput.inputValue()) ?? '';
  }

  /**
   * Set the title of the active note.
   */
  async setTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
    // Trigger blur to ensure title is saved
    await this.titleInput.blur();
  }

  /**
   * Get the current body text of the active note.
   */
  async getBodyText(): Promise<string> {
    return (await this.bodyContent.textContent()) ?? '';
  }

  /**
   * Type text into the editor body.
   */
  async typeBody(text: string): Promise<void> {
    await this.bodyContent.click();
    await this.bodyContent.type(text);
  }

  /**
   * Clear the editor body.
   */
  async clearBody(): Promise<void> {
    await this.bodyContent.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
  }

  /**
   * Wait for autosave to complete.
   * (Useful after making edits to ensure they're persisted.)
   */
  async waitForAutosave(): Promise<void> {
    const indicator = this.page.locator(`[data-testid="${testIds.editor.autoSaveIndicator}"]`);

    // Wait for the indicator to appear (saving)
    await indicator.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {
      // It's ok if this times out — autosave might be instant
    });

    // Wait for the indicator to disappear (saved)
    await indicator.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Check if the editor is visible.
   */
  async isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  /**
   * Focus the body content area.
   */
  async focusBody(): Promise<void> {
    await this.bodyContent.click();
  }

  /**
   * Get the active note's ID (if available in a data attribute).
   */
  async getActiveNoteId(): Promise<string | null> {
    return await this.root.getAttribute('data-note-id');
  }
}
