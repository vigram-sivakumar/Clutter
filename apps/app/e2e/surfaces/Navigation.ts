/**
 * Navigation Surface Object
 *
 * Encapsulates interactions with the top navigation bar (back/forward, page title, breadcrumbs).
 */

import type { Page, Locator } from '@playwright/test';
import { testIds } from '../../src/devtools/testIds';

export class Navigation {
  constructor(private page: Page) {}

  /**
   * Get the navigation root element.
   */
  get root(): Locator {
    return this.page.locator(`[data-testid="${testIds.navigation.root}"]`);
  }

  /**
   * Get the back button.
   */
  get backButton(): Locator {
    return this.page.locator(`[data-testid="${testIds.navigation.backButton}"]`);
  }

  /**
   * Get the forward button.
   */
  get forwardButton(): Locator {
    return this.page.locator(`[data-testid="${testIds.navigation.forwardButton}"]`);
  }

  /**
   * Get the label of the currently active page.
   */
  get activePageLabel(): Locator {
    return this.page.locator(`[data-testid="${testIds.navigation.activePageLabel}"]`);
  }

  /**
   * Get the text of the active page label.
   */
  async getActivePageLabel(): Promise<string> {
    return (await this.activePageLabel.textContent()) ?? '';
  }

  /**
   * Click the back button.
   */
  async goBack(): Promise<void> {
    const isEnabled = await this.backButton.isEnabled();
    if (!isEnabled) {
      throw new Error('Back button is disabled');
    }
    await this.backButton.click();
  }

  /**
   * Click the forward button.
   */
  async goForward(): Promise<void> {
    const isEnabled = await this.forwardButton.isEnabled();
    if (!isEnabled) {
      throw new Error('Forward button is disabled');
    }
    await this.forwardButton.click();
  }

  /**
   * Check if the back button is enabled.
   */
  async isBackEnabled(): Promise<boolean> {
    return this.backButton.isEnabled();
  }

  /**
   * Check if the forward button is enabled.
   */
  async isForwardEnabled(): Promise<boolean> {
    return this.forwardButton.isEnabled();
  }
}
