import { describe, expect, it, vi } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { ResourceActionSurface } from '@core/presentation/resourceActions/resourceActionSurfaces';
import type { ResourceActionContext } from '@core/presentation/resourceActions/resourceActionTypes';
import { buildPageMenuHandlers } from './buildPageMenuHandlers';

function rowActions() {
  return {
    onStartRename: vi.fn(),
    onDuplicateNote: vi.fn(),
    onToggleFavoriteNote: vi.fn(),
    onArchiveNote: vi.fn(),
    onRevealPageInFinder: vi.fn(),
    onCopyPagePath: vi.fn(),
  };
}

/** Ids a row's picker triggers intercept before dispatch (Note.tsx), so they need no handler. */
const PICKER_IDS = ['move-to', 'change-icon'];

function leafIds(menu: ReturnType<typeof buildResourceActionMenu>): string[] {
  return menu.flatMap((item) => (item.submenu ? item.submenu.map((leaf) => leaf.id) : [item.id]));
}

describe('buildPageMenuHandlers', () => {
  it('dispatches each action to the matching row action for that page', () => {
    const actions = rowActions();
    const handlers = buildPageMenuHandlers(actions, 'p1', true);

    handlers['rename']?.();
    handlers['duplicate']?.();
    handlers['toggle-favorite']?.();
    handlers['archive']?.();
    handlers['reveal-in-finder']?.();
    handlers['copy-path-full-path']?.();

    expect(actions.onStartRename).toHaveBeenCalledWith('p1');
    expect(actions.onDuplicateNote).toHaveBeenCalledWith('p1');
    expect(actions.onToggleFavoriteNote).toHaveBeenCalledWith('p1', true);
    expect(actions.onArchiveNote).toHaveBeenCalledWith('p1');
    expect(actions.onRevealPageInFinder).toHaveBeenCalledWith('p1');
    expect(actions.onCopyPagePath).toHaveBeenCalledWith('p1', 'full-path');
  });

  // The guard for the "listed but does nothing" bug class (Version history, Favorites' Reveal): every
  // action a canonical page menu can show, on any sidebar-family surface and in any state, has a handler.
  it.each<['note' | 'daily-note', ResourceActionSurface]>([
    ['note', 'sidebar'],
    ['note', 'favorites'],
    ['daily-note', 'sidebar'],
  ])('%s on the %s surface: every emitted action is registered', (kind, surface) => {
    const handlers = buildPageMenuHandlers(rowActions(), 'p1', false);
    const contexts: ResourceActionContext[] = [
      { status: 'active' },
      { status: 'active', isFavorite: true },
      { status: 'active', isTemplate: true },
      { status: 'archived', isDeletable: true },
    ];

    for (const context of contexts) {
      for (const id of leafIds(buildResourceActionMenu(kind, context, surface))) {
        if (!PICKER_IDS.includes(id)) {
          expect(handlers[id], `${kind}/${surface}: "${id}" has no handler`).toBeTypeOf('function');
        }
      }
    }
  });
});
