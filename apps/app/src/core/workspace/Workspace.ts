import { type ChangeListener, type Observable } from '../shared/Observable';

/**
 * A non-folder, non-page main-content view — a filtered aggregate defined
 * by a query rather than a location in the folder tree (ADR-022). Grows
 * only when a real consumer ships; 'workspace'/'favorites' (root
 * folders+notes, favorited items), the five task collection views
 * (Today/Upcoming/Completed/All Tasks/Unscheduled), and 'tag' (notes
 * referencing one tag) are the ones that exist today.
 *
 * A single discriminated union, not a string enum with a bolted-on
 * exception for parameterized views: 'tag' is the first filtered view that
 * needs a payload, but it won't be the last (a future 'search' view is the
 * expected next one) — every member carries its own shape from the start
 * rather than mixing plain strings with the occasional object.
 */
export type FilteredView =
  | { readonly kind: 'workspace' }
  | { readonly kind: 'favorites' }
  | { readonly kind: 'tasks-today' }
  | { readonly kind: 'tasks-upcoming' }
  | { readonly kind: 'tasks-completed' }
  | { readonly kind: 'tasks-all' }
  | { readonly kind: 'tasks-unscheduled' }
  | { readonly kind: 'tag'; readonly tagName: string };

/**
 * Derived, not redeclared — for call sites that only ever want the plain
 * string tag (e.g. a Set membership check, a presentation-table key),
 * not the full payload.
 */
export type FilteredViewKind = FilteredView['kind'];

/**
 * What the main content pane is currently showing — a tagged union so
 * "exactly one of these is active" is expressed by the type itself rather
 * than by convention across separate nullable fields (ADR-022, replacing
 * the prior activePageId/activeFolderId-only shape).
 */
export type ActiveView =
  | { readonly type: 'page'; readonly id: string }
  | { readonly type: 'folder'; readonly id: string }
  | { readonly type: 'filtered-view'; readonly view: FilteredView };

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
   * What the main content pane is currently showing — a page, a folder, or
   * a filtered view (ADR-022). activePageId/activeFolderId below remain as
   * derived accessors over this so no existing caller needs to change.
   */
  private _activeView: ActiveView | null = null;

  /**
   * Pages currently opened by the workspace.
   *
   * Initially this behaves like a simple list. Later it will evolve
   * into tabs, split views, and window layouts.
   */
  private readonly openPageIds: string[] = [];

  /**
   * Folders currently collapsed in tree views.
   *
   * Folders are expanded by default; only explicitly collapsed ids are stored.
   * This is UI navigation state, not vault data.
   */
  private readonly collapsedFolderIds = new Set<string>();

  /**
   * Sidebar section headers (Favorites, Folders, ...) currently collapsed.
   *
   * A deliberately separate set from collapsedFolderIds (ADR-021), not a
   * generic "collapsed ids" structure — sections and folders are different
   * node kinds, and merging them risks an id collision (e.g. a folder
   * literally named "favorites") for no benefit. Same shape and default
   * (expanded unless explicitly collapsed) as collapsedFolderIds.
   */
  private readonly collapsedSectionIds = new Set<string>();

  /**
   * Which sidebar tab (Daily Notes/Notes/Tasks/Tags/Search) is currently
   * showing (ADR-021). Discrete, shared, session-scoped — the same shape
   * as activePageId/activeFolderId, just for the sidebar's own tab strip
   * rather than the main content pane.
   */
  private _activeSidebarTab = 'daily-notes';

  /**
   * Whether the sidebar panel is currently shown (ADR-021). Unblocks
   * Controls' sidebar-toggle button, previously disabled per ADR-016
   * ("no backing state exists for either yet").
   */
  private _isSidebarVisible = true;

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
    this._activeView = { type: 'page', id: pageId };
    this.notify();
  }

  /**
   * Opens a folder within the workspace.
   */
  public openFolder(folderId: string): void {
    this._activeView = { type: 'folder', id: folderId };
    this.notify();
  }

  /**
   * Shows a filtered, non-folder view in the main content pane (ADR-022)
   * — the entry point NavigationRouter's view-level intents (openWorkspace,
   * openFavorites) use, the same way openFolder is FolderOperations.open's.
   */
  public openFilteredView(view: FilteredView): void {
    this._activeView = { type: 'filtered-view', view };
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

    if (this.activePageId === pageId) {
      const nextId = this.openPageIds.at(-1) ?? null;
      this._activeView = nextId ? { type: 'page', id: nextId } : null;
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
   * What the main content pane is currently showing (ADR-022).
   */
  public get activeView(): ActiveView | null {
    return this._activeView;
  }

  /**
   * The currently active page. Derived from activeView.
   */
  public get activePageId(): string | null {
    return this._activeView?.type === 'page' ? this._activeView.id : null;
  }

  /**
   * The currently active folder. Derived from activeView.
   */
  public get activeFolderId(): string | null {
    return this._activeView?.type === 'folder' ? this._activeView.id : null;
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
    if (this.collapsedFolderIds.has(folderId)) {
      this.collapsedFolderIds.delete(folderId);
    } else {
      this.collapsedFolderIds.add(folderId);
    }

    this.notify();
  }

  /**
   * Returns whether a folder is expanded in tree views.
   */
  public isFolderExpanded(folderId: string): boolean {
    return !this.collapsedFolderIds.has(folderId);
  }

  /**
   * Toggles the expanded state of a sidebar section header.
   */
  public toggleSectionExpanded(sectionId: string): void {
    if (this.collapsedSectionIds.has(sectionId)) {
      this.collapsedSectionIds.delete(sectionId);
    } else {
      this.collapsedSectionIds.add(sectionId);
    }

    this.notify();
  }

  /**
   * Returns whether a sidebar section header is expanded.
   */
  public isSectionExpanded(sectionId: string): boolean {
    return !this.collapsedSectionIds.has(sectionId);
  }

  /**
   * The sidebar tab currently showing.
   */
  public get activeSidebarTab(): string {
    return this._activeSidebarTab;
  }

  /**
   * Switches the active sidebar tab.
   */
  public setActiveSidebarTab(tab: string): void {
    if (this._activeSidebarTab === tab) {
      return;
    }

    this._activeSidebarTab = tab;
    this.notify();
  }

  /**
   * Whether the sidebar panel is currently shown.
   */
  public get isSidebarVisible(): boolean {
    return this._isSidebarVisible;
  }

  /**
   * Toggles sidebar panel visibility.
   */
  public toggleSidebarVisible(): void {
    this._isSidebarVisible = !this._isSidebarVisible;
    this.notify();
  }
}
