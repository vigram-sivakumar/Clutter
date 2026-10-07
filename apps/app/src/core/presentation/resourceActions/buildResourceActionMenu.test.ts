import { describe, expect, it } from 'vitest';

import { buildMenuFromDefinitions, buildResourceActionMenu } from './buildResourceActionMenu';
import { RESOURCE_ACTIONS } from './resourceActionDefinitions';
import { RESOURCE_ACTION_SURFACES } from './resourceActionSurfaces';
import {
  RESOURCE_ACTION_GROUPS,
  type ResourceActionDefinition,
  type ResourceKind,
} from './resourceActionTypes';

const ids = (items: { id: string }[]) => items.map((item) => item.id);
const dividedIds = (items: { id: string; separatorBefore?: boolean }[]) =>
  items.filter((item) => item.separatorBefore).map((item) => item.id);

describe('canonical definitions', () => {
  const kinds = Object.keys(RESOURCE_ACTIONS) as ResourceKind[];

  it.each(kinds)('%s: ids are unique', (kind) => {
    const list = ids([...RESOURCE_ACTIONS[kind]]);
    expect(new Set(list).size).toBe(list.length);
  });

  it.each(kinds)('%s: every action sits in a known group', (kind) => {
    for (const definition of RESOURCE_ACTIONS[kind]) {
      expect(RESOURCE_ACTION_GROUPS).toContain(definition.group);
    }
  });

  it('every action that deletes permanently is in the destructive group, and only those', () => {
    for (const kind of kinds) {
      for (const definition of RESOURCE_ACTIONS[kind]) {
        expect(definition.id === 'delete').toBe(definition.group === 'destructive');
      }
    }
  });

  it('Move to… is in the organize group', () => {
    const move = RESOURCE_ACTIONS.note.find((definition) => definition.id === 'move-to');
    expect(move?.group).toBe('organize');
  });
});

describe('group ordering and automatic dividers', () => {
  const archivedNote = { status: 'archived', isDeletable: true } as const;

  it('orders a persisted note by group and puts a divider on each group boundary', () => {
    const menu = buildResourceActionMenu('note', { status: 'active' }, 'topbar');

    expect(ids(menu)).toEqual([
      'toggle-favorite',
      'duplicate',
      'move-to',
      'use-as-template',
      'reveal-in-finder',
      'copy-path',
      'archive',
    ]);
    expect(dividedIds(menu)).toEqual(['reveal-in-finder', 'archive']);
  });

  it('places the destructive action last, behind its own divider', () => {
    const menu = buildResourceActionMenu('note', archivedNote, 'topbar');

    expect(ids(menu).at(-1)).toBe('delete');
    expect(dividedIds(menu)).toContain('delete');
    expect(ids(menu).slice(-2)).toEqual(['restore', 'delete']);
  });

  it('never emits a divider before the first item', () => {
    const menu = buildResourceActionMenu('note', { status: 'active' }, 'sidebar');
    expect(menu[0]?.separatorBefore).toBeUndefined();
  });

  it('REGRESSION: a new action gets its group position and divider on every surface without any surface knowing', () => {
    const newAction: ResourceActionDefinition = {
      id: 'brand-new',
      group: 'view',
      order: 10,
      label: 'Brand new',
      icon: 'clock',
    };
    const definitions = [...RESOURCE_ACTIONS.note, newAction];

    for (const surface of Object.keys(RESOURCE_ACTION_SURFACES) as (keyof typeof RESOURCE_ACTION_SURFACES)[]) {
      const menu = buildMenuFromDefinitions(definitions, { status: 'active' }, surface);
      const order = ids(menu);

      // After the organize group, before the location group …
      expect(order.indexOf('brand-new')).toBeGreaterThan(order.indexOf('duplicate'));
      expect(order.indexOf('brand-new')).toBeLessThan(order.indexOf('reveal-in-finder'));
      // … and it opens its own divided group.
      expect(dividedIds(menu)).toContain('brand-new');
      expect(dividedIds(menu)).toContain('reveal-in-finder');
    }
  });
});

describe('surface filtering', () => {
  it('the topbar omits Rename and Change icon; the sidebar offers them', () => {
    expect(ids(buildResourceActionMenu('note', { status: 'active' }, 'topbar'))).not.toContain('rename');
    expect(ids(buildResourceActionMenu('note', { status: 'active' }, 'topbar'))).not.toContain('change-icon');
    expect(ids(buildResourceActionMenu('note', { status: 'active' }, 'sidebar'))).toEqual(
      expect.arrayContaining(['rename', 'change-icon'])
    );
  });

  it('Favorites omits Rename but keeps Change icon', () => {
    const menu = ids(buildResourceActionMenu('note', { status: 'active' }, 'favorites'));
    expect(menu).not.toContain('rename');
    expect(menu).toContain('change-icon');
  });

  it('the sidebar never offers Restore, Delete or Use as template', () => {
    const menu = ids(buildResourceActionMenu('note', { status: 'archived', isDeletable: true }, 'sidebar'));
    expect(menu).not.toContain('restore');
    expect(menu).not.toContain('delete');
    expect(menu).not.toContain('use-as-template');
  });
});

describe('availability', () => {
  it('a draft shows no sidebar menu at all', () => {
    expect(buildResourceActionMenu('note', { isDraft: true }, 'sidebar')).toEqual([]);
  });

  it('a draft on the topbar keeps its actions, disabled rather than omitted', () => {
    const menu = buildResourceActionMenu('note', { isDraft: true }, 'topbar');
    expect(ids(menu)).toContain('archive');
    expect(menu.every((item) => item.disabled)).toBe(true);
  });

  it('Archive and Restore are mutually exclusive on status', () => {
    expect(ids(buildResourceActionMenu('note', { status: 'active' }, 'topbar'))).toContain('archive');
    expect(ids(buildResourceActionMenu('note', { status: 'active' }, 'topbar'))).not.toContain('restore');
    expect(ids(buildResourceActionMenu('note', { status: 'archived' }, 'topbar'))).toContain('restore');
    expect(ids(buildResourceActionMenu('note', { status: 'archived' }, 'topbar'))).not.toContain('archive');
  });

  it('Move is disabled for an archived note and absent for a template', () => {
    const archived = buildResourceActionMenu('note', { status: 'archived' }, 'topbar');
    expect(archived.find((item) => item.id === 'move-to')?.disabled).toBe(true);
    expect(ids(buildResourceActionMenu('note', { isTemplate: true }, 'topbar'))).not.toContain('move-to');
  });

  it('Delete appears only when the resource is deletable', () => {
    expect(ids(buildResourceActionMenu('note', { status: 'active' }, 'topbar'))).not.toContain('delete');
    expect(ids(buildResourceActionMenu('note', { status: 'archived', isDeletable: true }, 'topbar'))).toContain(
      'delete'
    );
  });

  it('the favorite label and icon follow its state', () => {
    const on = buildResourceActionMenu('note', { isFavorite: true }, 'sidebar').find(
      (item) => item.id === 'toggle-favorite'
    );
    const off = buildResourceActionMenu('note', { isFavorite: false }, 'sidebar').find(
      (item) => item.id === 'toggle-favorite'
    );
    expect(on).toMatchObject({ label: 'Remove from Favorites', icon: 'favouriteFilled' });
    expect(off).toMatchObject({ label: 'Add to Favorites', icon: 'favouriteOutline' });
  });
});

describe('daily note', () => {
  it('offers only location and lifecycle actions on the sidebar', () => {
    expect(ids(buildResourceActionMenu('daily-note', { status: 'active' }, 'sidebar'))).toEqual([
      'reveal-in-finder',
      'copy-path',
      'archive',
    ]);
  });

  it('its menus never contain rename, icon, favorite, duplicate, move or template actions', () => {
    for (const surface of ['sidebar', 'favorites', 'topbar'] as const) {
      for (const context of [{ status: 'active' }, { status: 'archived', isDeletable: true }] as const) {
        const menu = ids(buildResourceActionMenu('daily-note', context, surface));
        for (const absent of ['rename', 'change-icon', 'toggle-favorite', 'duplicate', 'move-to', 'use-as-template']) {
          expect(menu).not.toContain(absent);
        }
      }
    }
  });

  it('a draft has no sidebar menu; on the topbar its actions are disabled, not omitted', () => {
    expect(buildResourceActionMenu('daily-note', { isDraft: true }, 'sidebar')).toEqual([]);
    const topbar = buildResourceActionMenu('daily-note', { isDraft: true, isDeletable: true }, 'topbar');
    expect(ids(topbar)).toEqual(['reveal-in-finder', 'copy-path', 'archive', 'delete']);
    expect(topbar.every((item) => item.disabled)).toBe(true);
  });

  it('on the topbar, an archived daily note offers Restore then a divided Delete', () => {
    const menu = buildResourceActionMenu('daily-note', { status: 'archived', isDeletable: true }, 'topbar');
    expect(ids(menu)).toEqual(['reveal-in-finder', 'copy-path', 'restore', 'delete']);
    expect(dividedIds(menu)).toEqual(['restore', 'delete']);
  });

  it('Copy path offers As Markdown (a Daily Note is a page)', () => {
    const copy = buildResourceActionMenu('daily-note', { status: 'active' }, 'topbar').find(
      (item) => item.id === 'copy-path'
    );
    expect(copy?.submenu?.map((leaf) => leaf.id)).toContain('copy-path-as-markdown');
  });
});
