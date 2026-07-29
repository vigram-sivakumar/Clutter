import { type ChangeListener, type Observable } from '../shared/Observable';
/**
 * Represents the user's current working context.
 *
 * A Workspace references a Vault and owns navigation state,
 * not knowledge.
 *
 * Responsibilities:
 * - Track the active page.
 * - Track open pages.
 * - Own navigation history.
 * - Own future tab and panel state.
 *
 * Does NOT:
 * - Store pages.
 * - Edit documents.
 * - Persist knowledge.
 * - Own DocumentSessions.
 *
 * A Workspace references a Vault.
 * A Vault may be used by multiple Workspaces.
 */
export class Workspace implements Observable {
  /**
   * The page currently presented to the user.
   */
  private _activePageId: string | null = null;

  /**
   * The folder currently presented to the user.
   */
  private _activeFolderId: string | null = null;

  /**
   * Pages currently opened by the workspace.
   *
   * Initially this behaves like a simple list. Later it will evolve
   * into tabs, split views, and window layouts.
   */
  private readonly openPageIds: string[] = [];

  /**
   * Folders currently expanded in tree views.
   *
   * This is UI navigation state, not vault data.
   */
  private readonly expandedFolderIds = new Set<string>();

  /**
   * Registered workspace observers.
   */
  private readonly listeners = new Set<ChangeListener>();

  /**
   * Opens a page within the workspace.
   */
  public openPage(pageId: string): void {
    if (!this.openPageIds.includes(pageId)) {
      this.openPageIds.push(pageId);
    }
    this._activeFolderId = null;
    this._activePageId = pageId;
    this.notify();
  }

  /**
   * Opens a folder within the workspace.
   */
  public openFolder(folderId: string): void {
    this._activePageId = null;
    this._activeFolderId = folderId;
    this.notify();
  }

  /**
   * Closes a page within the workspace.
   */
  public closePage(pageId: string): void {
    const index = this.openPageIds.indexOf(pageId);

    if (index === -1) {
      return;
    }

    this.openPageIds.splice(index, 1);

    if (this._activePageId === pageId) {
      this._activePageId = this.openPageIds.at(-1) ?? null;
    }
    this.notify();
  }

  /**
   * Registers a workspace observer.
   */
  public subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notifies observers that the workspace state has changed.
   */
  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Notifies observers that external state changed and the workspace
   * should be re-evaluated.
   */
  public refresh(): void {
    this.notify();
  }

  /**
   * Returns whether the page is currently open.
   */
  public isPageOpen(pageId: string): boolean {
    return this.openPageIds.includes(pageId);
  }

  /**
   * The currently active page.
   */
  public get activePageId(): string | null {
    return this._activePageId;
  }

  /**
   * The currently active folder.
   */
  public get activeFolderId(): string | null {
    return this._activeFolderId;
  }

  /**
   * The returned collection is a snapshot of the current workspace state.
   *
   * The pages currently opened by the workspace.
   */
  public get openPages(): readonly string[] {
    return [...this.openPageIds];
  }

  /**
   * Toggles the expanded state of a folder in tree views.
   */
  public toggleFolderExpanded(folderId: string): void {
    if (this.expandedFolderIds.has(folderId)) {
      this.expandedFolderIds.delete(folderId);
    } else {
      this.expandedFolderIds.add(folderId);
    }

    this.notify();
  }

  /**
   * Returns whether a folder is expanded in tree views.
   */
  public isFolderExpanded(folderId: string): boolean {
    return this.expandedFolderIds.has(folderId);
  }
}
