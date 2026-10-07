import { describe, expect, it, vi } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import { buildAssetMenuHandlers } from './buildAssetMenuHandlers';

describe('buildAssetMenuHandlers', () => {
  it('dispatches each action to the matching operation for that asset', () => {
    const actions = {
      onStartRename: vi.fn(),
      onArchiveResource: vi.fn(),
      onRevealResourceInFinder: vi.fn(),
      onCopyResourcePath: vi.fn(),
      onDownloadResource: vi.fn(),
    };
    const handlers = buildAssetMenuHandlers(actions, 'r1');

    handlers['rename']?.();
    handlers['archive']?.();
    handlers['reveal-in-finder']?.();
    handlers['download']?.();
    handlers['copy-path-as-markdown']?.();

    expect(actions.onStartRename).toHaveBeenCalledWith('r1');
    expect(actions.onArchiveResource).toHaveBeenCalledWith('r1');
    expect(actions.onRevealResourceInFinder).toHaveBeenCalledWith('r1');
    expect(actions.onDownloadResource).toHaveBeenCalledWith('r1');
    expect(actions.onCopyResourcePath).toHaveBeenCalledWith('r1', 'as-markdown');
  });

  it('is safe when a surface supplies no operation for an action', () => {
    expect(() => buildAssetMenuHandlers({}, 'r1')['archive']?.()).not.toThrow();
  });

  it.each(['image', 'pdf'] as const)('every local %s asset action on the sidebar and overlay is registered', (assetKind) => {
    const handlers = buildAssetMenuHandlers({}, 'r1');

    for (const surface of ['sidebar', 'overlay'] as const) {
      const menu = buildResourceActionMenu('asset', { assetKind, status: 'active' }, surface);
      for (const item of menu) {
        for (const id of item.submenu ? item.submenu.map((leaf) => leaf.id) : [item.id]) {
          // The shared Move picker intercepts 'move-to' before dispatch.
          if (id !== 'move-to') {
            expect(handlers[id], `asset/${surface}: "${id}" has no handler`).toBeTypeOf('function');
          }
        }
      }
    }
  });
});
