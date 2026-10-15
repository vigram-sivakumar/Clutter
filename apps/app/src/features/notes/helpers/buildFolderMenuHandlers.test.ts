import { describe, expect, it, vi } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { ResourceActionSurface } from '@core/presentation/resourceActions/resourceActionSurfaces';
import { applyFolderSortSelection, buildFolderMenuHandlers } from './buildFolderMenuHandlers';

function rowActions() {
  return {
    onStartRename: vi.fn(),
    onToggleFavoriteFolder: vi.fn(),
    onArchiveFolder: vi.fn(),
    onRevealFolderInFinder: vi.fn(),
    onCopyFolderPath: vi.fn(),
  };
}

describe('buildFolderMenuHandlers', () => {
  it('dispatches each action to the matching row action for that folder', () => {
    const actions = rowActions();
    const handlers = buildFolderMenuHandlers(actions, 'f1', true);

    handlers['rename']?.();
    handlers['toggle-favorite']?.();
    handlers['archive']?.();
    handlers['reveal-in-finder']?.();
    handlers['copy-path-at-vault']?.();

    expect(actions.onStartRename).toHaveBeenCalledWith('f1');
    expect(actions.onToggleFavoriteFolder).toHaveBeenCalledWith('f1', true);
    expect(actions.onArchiveFolder).toHaveBeenCalledWith('f1');
    expect(actions.onRevealFolderInFinder).toHaveBeenCalledWith('f1');
    expect(actions.onCopyFolderPath).toHaveBeenCalledWith('f1', 'at-vault');
  });

  it.each<ResourceActionSurface>(['sidebar', 'favorites'])(
    'every folder action on the %s surface is registered (sort rows and pickers excepted)',
    (surface) => {
      const handlers = buildFolderMenuHandlers(rowActions(), 'f1', false);
      const menu = buildResourceActionMenu(
        'folder',
        { status: 'active', sort: { key: 'name', direction: 'down' } },
        surface
      );

      for (const item of menu) {
        const leaves = item.submenu ? item.submenu.map((leaf) => leaf.id) : [item.id];
        for (const id of leaves) {
          // Picker triggers intercept these; Sort by is the tree's own per-folder view state.
          if (['move-to', 'change-icon', 'sort-by'].includes(id)) {
            continue;
          }
          expect(handlers[id], `folder/${surface}: "${id}" has no handler`).toBeTypeOf('function');
        }
      }
    }
  );
});

describe('applyFolderSortSelection — Manual', () => {
  it('picking Manual selects it with the default direction, even when it is already active (it has no direction to flip)', () => {
    const onChange = vi.fn();
    applyFolderSortSelection('sort:manual', 'f1', { key: 'name', direction: 'up' }, onChange);
    applyFolderSortSelection('sort:manual', 'f1', { key: 'manual', direction: 'down' }, onChange);

    expect(onChange).toHaveBeenNthCalledWith(1, 'f1', { key: 'manual', direction: 'down' });
    expect(onChange).toHaveBeenNthCalledWith(2, 'f1', { key: 'manual', direction: 'down' });
  });

  it('the other keys still flip their direction when re-picked', () => {
    const onChange = vi.fn();
    applyFolderSortSelection('sort:name', 'f1', { key: 'name', direction: 'down' }, onChange);
    expect(onChange).toHaveBeenCalledWith('f1', { key: 'name', direction: 'up' });
  });
});
