import { describe, expect, it, vi } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import { buildTagMenuHandlers } from './buildTagMenuHandlers';

describe('buildTagMenuHandlers', () => {
  const actions = () => ({ onStartRename: vi.fn(), onTogglePinTag: vi.fn(), onDeleteTag: vi.fn() });

  it('dispatches to the tag row actions for that tag; Pin flips the current state', () => {
    const rowActions = actions();
    const handlers = buildTagMenuHandlers(rowActions, 'work', false);

    handlers['rename']?.();
    handlers['toggle-pin']?.();
    handlers['delete']?.();

    expect(rowActions.onStartRename).toHaveBeenCalledWith('work');
    expect(rowActions.onTogglePinTag).toHaveBeenCalledWith('work', true);
    expect(rowActions.onDeleteTag).toHaveBeenCalledWith('work');
    expect(buildTagMenuHandlers(actions(), 'work', true)['toggle-pin']).toBeTypeOf('function');
  });

  it('every action on the tag sidebar menu is registered (Change icon is intercepted by its picker)', () => {
    const handlers = buildTagMenuHandlers(actions(), 'work', false);
    for (const item of buildResourceActionMenu('tag', {}, 'sidebar')) {
      if (item.id !== 'change-icon') {
        expect(handlers[item.id], `tag: "${item.id}" has no handler`).toBeTypeOf('function');
      }
    }
  });
});
