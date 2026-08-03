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
});
