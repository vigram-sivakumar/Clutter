import { describe, expect, it, vi } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { ResourceActionSurface } from '@core/presentation/resourceActions/resourceActionSurfaces';
import { buildFolderMenuHandlers } from './buildFolderMenuHandlers';

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
