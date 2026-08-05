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
 * Structural equality for two ActiveViews (ADR-027) — used solely to skip
 * recording a redundant history entry when a navigation "changes" to the
 * view that's already active. Plain field comparison; FilteredView's only
 * non-discriminant field (tagName) is compared alongside kind.
 */
function activeViewsEqual(a: ActiveView, b: ActiveView): boolean {
  if (a.type !== b.type) {
    return false;
  }

  if (a.type === 'page' || a.type === 'folder') {
    return a.id === (b as typeof a).id;
  }

  const viewA = a.view;
  const viewB = (b as typeof a).view;

  if (viewA.kind !== viewB.kind) {
    return false;
  }

  return viewA.kind === 'tag' ? viewA.tagName === (viewB as typeof viewA).tagName : true;
}

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
   * Navigation-history stacks (ADR-027) — `ActiveView` snapshots, reusing
   * ADR-022's union rather than a new "history entry" shape, since it
   * already identifies anything navigable (page, folder, filtered view).
   * Owned entirely by Workspace: mechanical bookkeeping only (push/pop,
   * peek, discard), no existence checks and no dependency on Vault, which
   * would break Workspace's zero-dependency invariant (ADR-006).
   * NavigationRouter.back()/forward() own the policy of walking past a
   * stale entry and reactivating a valid one; Workspace only tracks what
   * the stacks contain.
   */
  private readonly backStack: ActiveView[] = [];
  private readonly forwardStack: ActiveView[] = [];

  /**
   * Opens a page within the workspace.
   *
   * `recordHistory` (default true) is the sole mechanism (ADR-027) by
   * which a caller distinguishes a real user navigation from a history
   * replay (NavigationRouter.back()/forward(), which always passes
   * `false` — see PageOperations.open()). No other caller of this method
   * should ever pass `false`: delete-time fallback and startup's initial
   * open are unrecorded today only because they run while `activeView` is
   * still null (see recordNavigation() below), not because they pass the
   * flag — a future internal-recovery caller that could run with a
   * non-null activeView must pass `recordHistory: false` explicitly.
   */
  public openPage(pageId: string, options?: { readonly recordHistory?: boolean }): void {
    if (!this.openPageIds.includes(pageId)) {
      this.openPageIds.push(pageId);
    }
    this.recordNavigation({ type: 'page', id: pageId }, options?.recordHistory);
    this._activeView = { type: 'page', id: pageId };
    this.notify();
  }

  /**
   * Opens a folder within the workspace. See openPage() for `recordHistory`.
   */
  public openFolder(folderId: string, options?: { readonly recordHistory?: boolean }): void {
    this.recordNavigation({ type: 'folder', id: folderId }, options?.recordHistory);
    this._activeView = { type: 'folder', id: folderId };
    this.notify();
  }

  /**
   * Shows a filtered, non-folder view in the main content pane (ADR-022)
   * — the entry point NavigationRouter's view-level intents (openWorkspace,
   * openFavorites) use, the same way openFolder is FolderOperations.open's.
   * See openPage() for `recordHistory`.
   */
  public openFilteredView(
    view: FilteredView,
    options?: { readonly recordHistory?: boolean }
  ): void {
    this.recordNavigation({ type: 'filtered-view', view }, options?.recordHistory);
    this._activeView = { type: 'filtered-view', view };
    this.notify();
  }

  /**
   * ADR-027's recording branch, shared by all three open*() methods above.
   * Pushes the *current* (about-to-be-replaced) activeView onto backStack
   * and clears forwardStack (browser-style branching invariant) — but only
   * when: recording wasn't explicitly suppressed (`recordHistory !== false`
   * — the history-replay path), there is a current view to remember (a
   * null activeView, as at boot or right after everything is closed, has
   * nothing worth recording), and the new target isn't the same view
   * already active (clicking the same page again shouldn't create a junk
   * entry).
   */
  private recordNavigation(next: ActiveView, recordHistory: boolean | undefined): void {
    if (recordHistory === false) {
      return;
    }

    const current = this._activeView;

    if (!current || activeViewsEqual(current, next)) {
      return;
    }

    this.backStack.push(current);
    this.forwardStack.length = 0;
  }

  /**
   * Whether back() has anywhere to go (ADR-027) — drives Controls' Previous
   * button's disabled state.
   */
  public get canNavigateBack(): boolean {
    return this.backStack.length > 0;
  }

  /**
   * Whether forward() has anywhere to go (ADR-027) — drives Controls' Next
   * button's disabled state.
   */
  public get canNavigateForward(): boolean {
    return this.forwardStack.length > 0;
  }

  /**
   * Read-only look at the top of backStack, for NavigationRouter.back() to
   * validate (via Vault) before committing — does not mutate anything.
   */
  public peekBack(): ActiveView | undefined {
    return this.backStack.at(-1);
  }

  /**
   * Read-only look at the top of forwardStack. See peekBack().
   */
  public peekForward(): ActiveView | undefined {
    return this.forwardStack.at(-1);
  }

  /**
   * Permanently drops a confirmed-stale entry from the top of backStack
   * (ADR-027: history traversal skips a deleted target rather than
   * invoking any fallback policy). The discarded entry is not moved to
   * forwardStack — it no longer exists, so there is nothing to redo.
   */
  public discardBackEntry(): void {
    this.backStack.pop();
  }

  /**
   * Discards a confirmed-stale entry from the top of forwardStack. See
   * discardBackEntry().
   */
  public discardForwardEntry(): void {
    this.forwardStack.pop();
  }

  /**
   * Stack bookkeeping for committing a validated backStack entry
   * (NavigationRouter.back(), after peekBack() + an existence check):
   * pops backStack and pushes the current activeView onto forwardStack.
   * Does not touch activeView itself — the caller commits the popped
   * entry separately (via PageOperations.open()/FolderOperations.open()/
   * Workspace.openFilteredView(), each with `recordHistory: false`) so
   * that page/folder reactivation still goes through the same session-
   * creation and edit-flush machinery a normal open() does.
   */
  public popBackForReplay(): void {
    this.backStack.pop();

    if (this._activeView) {
      this.forwardStack.push(this._activeView);
    }
  }

  /**
   * Symmetric counterpart to popBackForReplay() for NavigationRouter.forward().
   */
  public popForwardForReplay(): void {
    this.forwardStack.pop();

    if (this._activeView) {
      this.backStack.push(this._activeView);
    }
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
   * Closes a folder within the workspace (ADR-024/post-delete-navigation
   * consistency fix) — the folder-scoped counterpart to closePage().
   *
   * Simpler than closePage(): folders have no open-tabs list to restore
   * from (openPageIds only ever tracks pages), so there is nothing to fall
   * back to besides null when the closed folder was the active view — a
   * no-op otherwise. Leaving activeView at null (rather than guessing a
   * sibling folder) is deliberate: PageOperations.delete()'s ADR-025
   * fallback-page mechanism already owns "what should be active when
   * nothing else is," and this method must not duplicate that decision.
   */
  public closeFolder(folderId: string): void {
    if (this.activeFolderId !== folderId) {
      return;
    }

    this._activeView = null;
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
   * Sets the expanded state of a sidebar section header directly, unlike
   * toggleSectionExpanded's blind negation of whatever is currently stored.
   * Needed by callers (Section's empty-state default) that must land on a
   * specific target state — e.g. a section visually forced collapsed by its
   * caller while empty still needs a click to result in "expanded", not in
   * negating a stored value the click's own effect never matched on screen.
   */
  public setSectionExpanded(sectionId: string, expanded: boolean): void {
    if (expanded) {
      this.collapsedSectionIds.delete(sectionId);
    } else {
      this.collapsedSectionIds.add(sectionId);
    }

    this.notify();
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
