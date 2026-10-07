import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { ResourceActionContext } from '@core/presentation/resourceActions/resourceActionTypes';
import { renderTopBarActions } from './topBarRegistry';

const leafIds = (menu: ReturnType<typeof buildResourceActionMenu>) =>
  menu.flatMap((item) => (item.submenu ? item.submenu.map((leaf) => leaf.id) : [item.id]));

/** Handler-registration guard for the topbar's canonical resource actions: nothing is listed but inert. */
describe('topbar handler registration for canonical resource actions', () => {
  const contexts: ResourceActionContext[] = [
    { status: 'active' },
    { status: 'active', isFavorite: true },
    { status: 'active', isTemplate: true },
    { status: 'archived', isDeletable: true },
    { isDraft: true },
  ];

  it.each(['note', 'daily-note', 'folder'] as const)('%s: every menu action has a handler in the rendered topbar', (kind) => {
    for (const context of contexts) {
      const menu = buildResourceActionMenu(kind, context, 'topbar');
      const fn = vi.fn();
      const element = renderTopBarActions(kind, {
        menu,
        onArchive: fn,
        onRestore: fn,
        onDelete: fn,
        onDuplicate: fn,
        onUseAsTemplate: fn,
        onCreateTemplate: fn,
        onToggleFavorite: fn,
        onRevealInFinder: fn,
        onCopyPath: fn,
      }) as ReactElement<{ handlers: Record<string, unknown> }>;

      for (const id of leafIds(menu)) {
        // 'move-to' opens the shared picker inside ResourceTopBarActions rather than dispatching.
        if (id !== 'move-to') {
          expect(element.props.handlers[id], `${kind}: "${id}" has no topbar handler`).toBeTypeOf('function');
        }
      }
    }
  });
});
