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
