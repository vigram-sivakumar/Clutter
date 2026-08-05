import { describe, expect, it, vi } from 'vitest';
import { Workspace } from './Workspace';

describe('Workspace.activeSidebarTab (ADR-021, M2)', () => {
  it('defaults to daily-notes', () => {
    const workspace = new Workspace();

    expect(workspace.activeSidebarTab).toBe('daily-notes');
  });

  it('setActiveSidebarTab switches the active tab and notifies subscribers', () => {
    const workspace = new Workspace();
    const listener = vi.fn();
    workspace.subscribe(listener);

    workspace.setActiveSidebarTab('notes');

    expect(workspace.activeSidebarTab).toBe('notes');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setting the same tab again is a no-op — no redundant notification', () => {
    const workspace = new Workspace();
    workspace.setActiveSidebarTab('tasks');

    const listener = vi.fn();
    workspace.subscribe(listener);
    workspace.setActiveSidebarTab('tasks');

    expect(listener).not.toHaveBeenCalled();
  });

  it('survives independently of active page/folder and folder-expansion state', () => {
    const workspace = new Workspace();

    workspace.openPage('page-1');
    workspace.toggleFolderExpanded('folder-1');
    workspace.setActiveSidebarTab('tags');

    expect(workspace.activeSidebarTab).toBe('tags');
    expect(workspace.activePageId).toBe('page-1');
    expect(workspace.isFolderExpanded('folder-1')).toBe(false);
  });
});

describe('Workspace.collapsedSectionIds / section expansion (ADR-021, M3)', () => {
  it('a section is expanded by default', () => {
    const workspace = new Workspace();

    expect(workspace.isSectionExpanded('favorites')).toBe(true);
  });

  it('toggleSectionExpanded collapses, then expands again, and notifies each time', () => {
    const workspace = new Workspace();
    const listener = vi.fn();
    workspace.subscribe(listener);

    workspace.toggleSectionExpanded('favorites');
    expect(workspace.isSectionExpanded('favorites')).toBe(false);

    workspace.toggleSectionExpanded('favorites');
    expect(workspace.isSectionExpanded('favorites')).toBe(true);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('is a separate namespace from collapsedFolderIds — a folder id and a section id never collide', () => {
    const workspace = new Workspace();

    // "favorites" as a folder id, distinct from "favorites" as a section id.
    workspace.toggleFolderExpanded('favorites');

    expect(workspace.isFolderExpanded('favorites')).toBe(false);
    expect(workspace.isSectionExpanded('favorites')).toBe(true);
  });

  it('tracks multiple sections independently', () => {
    const workspace = new Workspace();

    workspace.toggleSectionExpanded('favorites');

    expect(workspace.isSectionExpanded('favorites')).toBe(false);
    expect(workspace.isSectionExpanded('folders')).toBe(true);
  });

  it('setSectionExpanded lands on the exact requested state, unlike a blind toggle', () => {
    const workspace = new Workspace();
    const listener = vi.fn();
    workspace.subscribe(listener);

    // Requesting "expanded" on an already-expanded (default) section is a
    // no-op state-wise, but still a deliberate landing on `true` — not a
    // negation of whatever was stored, which is what setSectionExpanded is
    // for (Section's empty-state default needs to force a specific target,
    // not flip an unknown current value).
    workspace.setSectionExpanded('folders', true);
    expect(workspace.isSectionExpanded('folders')).toBe(true);

    workspace.setSectionExpanded('folders', false);
    expect(workspace.isSectionExpanded('folders')).toBe(false);

    workspace.setSectionExpanded('folders', false);
    expect(workspace.isSectionExpanded('folders')).toBe(false);

    workspace.setSectionExpanded('folders', true);
    expect(workspace.isSectionExpanded('folders')).toBe(true);

    expect(listener).toHaveBeenCalledTimes(4);
  });
});

describe('Workspace.activeView (ADR-022)', () => {
  it('defaults to no active view', () => {
    const workspace = new Workspace();

    expect(workspace.activeView).toBeNull();
    expect(workspace.activePageId).toBeNull();
    expect(workspace.activeFolderId).toBeNull();
  });

  it('openPage sets a page-typed activeView, derived activePageId/activeFolderId agree', () => {
    const workspace = new Workspace();

    workspace.openPage('page-1');

    expect(workspace.activeView).toEqual({ type: 'page', id: 'page-1' });
    expect(workspace.activePageId).toBe('page-1');
    expect(workspace.activeFolderId).toBeNull();
  });

  it('openFolder sets a folder-typed activeView, derived activePageId/activeFolderId agree', () => {
    const workspace = new Workspace();

    workspace.openFolder('folder-1');

    expect(workspace.activeView).toEqual({ type: 'folder', id: 'folder-1' });
    expect(workspace.activeFolderId).toBe('folder-1');
    expect(workspace.activePageId).toBeNull();
  });

  it('openFilteredView sets a filtered-view-typed activeView, clearing any active page/folder', () => {
    const workspace = new Workspace();
    workspace.openFolder('folder-1');

    workspace.openFilteredView({ kind: 'workspace' });

    expect(workspace.activeView).toEqual({ type: 'filtered-view', view: { kind: 'workspace' } });
    expect(workspace.activePageId).toBeNull();
    expect(workspace.activeFolderId).toBeNull();
  });

  it('exactly one of page/folder/filtered-view is active at a time — each open call clears the others', () => {
    const workspace = new Workspace();

    workspace.openFilteredView({ kind: 'favorites' });
    expect(workspace.activeView).toEqual({ type: 'filtered-view', view: { kind: 'favorites' } });

    workspace.openPage('page-1');
    expect(workspace.activeView).toEqual({ type: 'page', id: 'page-1' });

    workspace.openFolder('folder-1');
    expect(workspace.activeView).toEqual({ type: 'folder', id: 'folder-1' });
  });

  it('notifies subscribers when a filtered view opens', () => {
    const workspace = new Workspace();
    const listener = vi.fn();
    workspace.subscribe(listener);

    workspace.openFilteredView({ kind: 'workspace' });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closePage on the active page clears activeView entirely when no other page remains open', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');

    workspace.closePage('page-1');

    expect(workspace.activeView).toBeNull();
  });
});

describe('Workspace.closeFolder (post-delete-navigation consistency fix)', () => {
  it('clears activeView when the active folder is closed', () => {
    const workspace = new Workspace();
    workspace.openFolder('folder-1');

    workspace.closeFolder('folder-1');

    expect(workspace.activeView).toBeNull();
    expect(workspace.activeFolderId).toBeNull();
  });

  it('is a no-op when the closed folder is not the active view', () => {
    const workspace = new Workspace();
    workspace.openFolder('folder-1');

    workspace.closeFolder('some-other-folder');

    expect(workspace.activeFolderId).toBe('folder-1');
  });

  it('is a no-op when a page (not a folder) is active', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');

    workspace.closeFolder('folder-1');

    expect(workspace.activePageId).toBe('page-1');
  });

  it('notifies subscribers when it clears the active folder', () => {
    const workspace = new Workspace();
    workspace.openFolder('folder-1');
    const listener = vi.fn();
    workspace.subscribe(listener);

    workspace.closeFolder('folder-1');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify subscribers on a no-op call', () => {
    const workspace = new Workspace();
    workspace.openFolder('folder-1');
    const listener = vi.fn();
    workspace.subscribe(listener);

    workspace.closeFolder('some-other-folder');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('Workspace navigation history (ADR-027)', () => {
  it('starts with empty history — canNavigateBack/Forward both false', () => {
    const workspace = new Workspace();

    expect(workspace.canNavigateBack).toBe(false);
    expect(workspace.canNavigateForward).toBe(false);
  });

  it('the very first navigation records nothing (no current view to remember)', () => {
    const workspace = new Workspace();

    workspace.openPage('page-1');

    expect(workspace.canNavigateBack).toBe(false);
  });

  it('a second navigation pushes the previous view onto backStack', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');

    workspace.openPage('page-2');

    expect(workspace.canNavigateBack).toBe(true);
    expect(workspace.peekBack()).toEqual({ type: 'page', id: 'page-1' });
  });

  it('records across mixed resource types (page, folder, filtered view)', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');
    workspace.openFolder('folder-1');
    workspace.openFilteredView({ kind: 'favorites' });

    expect(workspace.peekBack()).toEqual({ type: 'folder', id: 'folder-1' });
    workspace.popBackForReplay();
    expect(workspace.peekBack()).toEqual({ type: 'page', id: 'page-1' });
  });

  it('navigating to the already-active view does not push a duplicate entry', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');
    workspace.openPage('page-2');

    workspace.openPage('page-2');

    expect(workspace.peekBack()).toEqual({ type: 'page', id: 'page-1' });
  });

  it('popBackForReplay pops backStack and pushes the current view onto forwardStack', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');
    workspace.openPage('page-2');

    workspace.popBackForReplay();

    expect(workspace.canNavigateBack).toBe(false);
    expect(workspace.canNavigateForward).toBe(true);
    expect(workspace.peekForward()).toEqual({ type: 'page', id: 'page-2' });
  });

  it('popForwardForReplay pops forwardStack and pushes the current view onto backStack', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');
    workspace.openPage('page-2');
    workspace.popBackForReplay();
    // Caller (NavigationRouter) would now commit page-1 with recordHistory:false.
    workspace.openPage('page-1', { recordHistory: false });

    workspace.popForwardForReplay();

    expect(workspace.canNavigateForward).toBe(false);
    expect(workspace.peekBack()).toEqual({ type: 'page', id: 'page-1' });
  });

  it('discardBackEntry drops the top backStack entry without touching forwardStack', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');
    workspace.openPage('page-2');
    workspace.openPage('page-3');

    workspace.discardBackEntry(); // drops page-2 (stale)

    expect(workspace.peekBack()).toEqual({ type: 'page', id: 'page-1' });
    expect(workspace.canNavigateForward).toBe(false);
  });

  it('discardForwardEntry drops the top forwardStack entry', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');
    workspace.openPage('page-2');
    workspace.popBackForReplay();

    workspace.discardForwardEntry();

    expect(workspace.canNavigateForward).toBe(false);
  });

  it('recordHistory: false suppresses recording entirely — no push, no forwardStack clear', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');
    workspace.openPage('page-2');
    workspace.popBackForReplay(); // backStack: [], forwardStack: [page-2]

    workspace.openPage('page-1', { recordHistory: false });

    expect(workspace.canNavigateBack).toBe(false);
    expect(workspace.canNavigateForward).toBe(true);
    expect(workspace.activeView).toEqual({ type: 'page', id: 'page-1' });
  });

  it('browser-style branching: a new recorded navigation after going back discards the forward stack', () => {
    const workspace = new Workspace();
    workspace.openPage('page-a');
    workspace.openPage('page-b');
    workspace.openPage('page-c');
    workspace.popBackForReplay();
    workspace.openPage('page-b', { recordHistory: false }); // simulate NavigationRouter.back() landing on B

    workspace.openPage('page-d'); // a genuinely new user navigation

    expect(workspace.canNavigateForward).toBe(false);
    expect(workspace.peekBack()).toEqual({ type: 'page', id: 'page-b' });
  });

  it('closePage never touches the history stacks (tab-lifecycle, not navigation)', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');
    workspace.openPage('page-2');

    workspace.closePage('page-2');

    expect(workspace.canNavigateForward).toBe(false);
    // backStack is unaffected by the close — still holds page-1 from the
    // page-1 -> page-2 navigation recorded earlier.
    expect(workspace.peekBack()).toEqual({ type: 'page', id: 'page-1' });
  });

  it('closeFolder never touches the history stacks', () => {
    const workspace = new Workspace();
    workspace.openPage('page-1');
    workspace.openFolder('folder-1');

    workspace.closeFolder('folder-1');

    expect(workspace.canNavigateForward).toBe(false);
    expect(workspace.peekBack()).toEqual({ type: 'page', id: 'page-1' });
  });
});

describe('Workspace.isSidebarVisible (ADR-021, M4)', () => {
  it('defaults to visible', () => {
    const workspace = new Workspace();

    expect(workspace.isSidebarVisible).toBe(true);
  });

  it('toggleSidebarVisible flips visibility and notifies each time', () => {
    const workspace = new Workspace();
    const listener = vi.fn();
    workspace.subscribe(listener);

    workspace.toggleSidebarVisible();
    expect(workspace.isSidebarVisible).toBe(false);

    workspace.toggleSidebarVisible();
    expect(workspace.isSidebarVisible).toBe(true);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
