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
