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
      'create-template',
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

  it('Favorites is the SAME menu as the sidebar — same actions, order and dividers, Rename included', () => {
    const contexts = [
      ['note', { status: 'active', isFavorite: true }],
      ['note', { status: 'active', isFavorite: true, isTemplate: true }],
      ['folder', { status: 'active', isFavorite: true }],
      ['folder', { status: 'active', isFavorite: true, sort: { key: 'name', direction: 'down' } }],
    ] as const;
    for (const [kind, context] of contexts) {
      const favorites = buildResourceActionMenu(kind, context, 'favorites');
      expect(favorites).toEqual(buildResourceActionMenu(kind, context, 'sidebar'));
      expect(ids(favorites)).toContain('rename');
    }
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

  it('Move is disabled for an archived note, and absent for a Template on every surface (Templates are flat)', () => {
    const archived = buildResourceActionMenu('note', { status: 'archived' }, 'topbar');
    expect(archived.find((item) => item.id === 'move-to')?.disabled).toBe(true);
    for (const surface of ['sidebar', 'favorites', 'topbar'] as const) {
      expect(ids(buildResourceActionMenu('note', { isTemplate: true, status: 'active' }, surface))).not.toContain('move-to');
    }
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
  it('offers only Create template, location and lifecycle actions on the sidebar', () => {
    expect(ids(buildResourceActionMenu('daily-note', { status: 'active' }, 'sidebar'))).toEqual([
      'create-template',
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
    expect(ids(topbar)).toEqual(['create-template', 'copy-path', 'archive', 'delete']);
    expect(topbar.every((item) => item.disabled)).toBe(true);
  });

  it('on the topbar, an archived daily note offers Restore then a divided Delete', () => {
    const menu = buildResourceActionMenu('daily-note', { status: 'archived', isDeletable: true }, 'topbar');
    expect(ids(menu)).toEqual(['copy-path', 'restore', 'delete']);
    expect(dividedIds(menu)).toEqual(['restore', 'delete']);
  });

  it('Copy path offers As Markdown (a Daily Note is a page)', () => {
    const copy = buildResourceActionMenu('daily-note', { status: 'active' }, 'topbar').find(
      (item) => item.id === 'copy-path'
    );
    expect(copy?.submenu?.map((leaf) => leaf.id)).toContain('copy-path-as-markdown');
  });
});

describe('folder menu', () => {
  const sort = { key: 'created', direction: 'up' } as const;

  it('groups identity | organize | view | location | lifecycle on the sidebar', () => {
    const menu = buildResourceActionMenu('folder', { status: 'active', sort }, 'sidebar');
    expect(ids(menu)).toEqual([
      'rename',
      'change-icon',
      'toggle-favorite',
      'move-to',
      'sort-by',
      'reveal-in-finder',
      'copy-path',
      'archive',
    ]);
    expect(dividedIds(menu)).toEqual(['toggle-favorite', 'sort-by', 'reveal-in-finder', 'archive']);
  });

  it('Sort by exists only where a sort is supplied, and only on the sidebar', () => {
    expect(ids(buildResourceActionMenu('folder', { status: 'active' }, 'sidebar'))).not.toContain('sort-by');
    expect(ids(buildResourceActionMenu('folder', { status: 'active', sort }, 'topbar'))).not.toContain('sort-by');
    expect(ids(buildResourceActionMenu('folder', { status: 'active', sort }, 'favorites'))).toContain('sort-by');
  });

  it("Sort by is one row whose panel lists the sort options and marks only the active key", () => {
    const row = buildResourceActionMenu('folder', { status: 'active', sort }, 'sidebar').find(
      (item) => item.id === 'sort-by'
    );
    expect(row?.panel?.title).toBe('Sort by');
    expect(row?.panel?.items.map((item) => item.label)).toEqual(['Name', 'Kind', 'Created', 'Last edited']);
    expect(row?.panel?.items.find((item) => item.id === 'sort:created')?.icon).toBe('tick');
    expect(row?.panel?.items.find((item) => item.id === 'sort:created')?.trailing).toBeTruthy();
    expect(row?.panel?.items.find((item) => item.id === 'sort:name')?.trailing).toBeUndefined();
  });

  it('is never duplicable and its Copy path has no As Markdown', () => {
    const menu = buildResourceActionMenu('folder', { status: 'active' }, 'topbar');
    expect(ids(menu)).not.toContain('duplicate');
    expect(menu.find((item) => item.id === 'copy-path')?.submenu?.map((leaf) => leaf.id)).toEqual([
      'copy-path-at-vault',
      'copy-path-full-path',
    ]);
  });

  it('on the topbar: Move is disabled when archived, Restore replaces Archive, and Delete ends the menu', () => {
    const menu = buildResourceActionMenu('folder', { status: 'archived', isDeletable: true }, 'topbar');
    expect(menu.find((item) => item.id === 'move-to')?.disabled).toBe(true);
    expect(ids(menu)).not.toContain('archive');
    expect(ids(menu).slice(-2)).toEqual(['restore', 'delete']);
    expect(dividedIds(menu)).toContain('delete');
  });

  it('the sidebar offers no Restore or Delete even for an archived folder', () => {
    const menu = ids(buildResourceActionMenu('folder', { status: 'archived', isDeletable: true }, 'sidebar'));
    expect(menu).not.toContain('restore');
    expect(menu).not.toContain('delete');
    expect(menu).not.toContain('archive');
  });
});

describe('asset menu', () => {
  const asset = (context: Parameters<typeof buildResourceActionMenu>[1], surface: Parameters<typeof buildResourceActionMenu>[2] = 'sidebar') =>
    buildResourceActionMenu('asset', { status: 'active', ...context }, surface);

  it('an image on the sidebar: Rename | Move to… | Reveal, Copy path, Download | Trash', () => {
    const menu = asset({ assetKind: 'image' });
    expect(ids(menu)).toEqual(['rename', 'move-to', 'reveal-in-finder', 'copy-path', 'download', 'archive']);
    expect(dividedIds(menu)).toEqual(['move-to', 'reveal-in-finder', 'archive']);
  });

  it('a pdf has no Download', () => {
    expect(ids(asset({ assetKind: 'pdf' }))).toEqual(['rename', 'move-to', 'reveal-in-finder', 'copy-path', 'archive']);
  });

  it('Copy path offers From vault, Full path, As Markdown, in that order', () => {
    const copy = asset({ assetKind: 'image' }).find((item) => item.id === 'copy-path');
    expect(copy?.submenu?.map((leaf) => leaf.label)).toEqual(['From vault', 'Full path', 'As Markdown']);
  });

  it('the overlay surface has no Rename and lists Set as cover image ahead of the location group', () => {
    const menu = asset({ assetKind: 'image', setAsCoverImage: 'enabled' }, 'overlay');
    expect(ids(menu)).toEqual(['move-to', 'set-as-cover-image', 'reveal-in-finder', 'copy-path', 'download', 'archive']);
  });

  it('a remote image swaps each file action for its URL counterpart, in the same groups', () => {
    const menu = asset({ assetKind: 'image', isRemote: true, setAsCoverImage: 'disabled' }, 'overlay');
    expect(menu.map((item) => [item.id, item.label])).toEqual([
      ['save-to-vault', 'Save to vault'],
      ['set-as-cover-image', 'Set as cover image'],
      ['open-in-browser', 'Open in browser'],
      ['copy-link', 'Copy link'],
      ['download', 'Download'],
    ]);
    expect(menu.find((item) => item.id === 'set-as-cover-image')?.disabled).toBe(true);
    expect(dividedIds(menu)).toEqual(['open-in-browser']);
  });

  it('a remote asset has nothing to rename, move, reveal or archive', () => {
    const menu = ids(asset({ assetKind: 'image', isRemote: true }, 'overlay'));
    for (const absent of ['rename', 'move-to', 'reveal-in-finder', 'copy-path', 'archive']) {
      expect(menu).not.toContain(absent);
    }
  });

  it('offers no single-asset Restore or Delete (a separate product decision)', () => {
    const menu = ids(asset({ assetKind: 'image', status: 'archived', isDeletable: true }, 'overlay'));
    expect(menu).not.toContain('restore');
    expect(menu).not.toContain('delete');
  });
});

describe('Reveal in Finder on the topbar (surface rule)', () => {
  const hasReveal = (kind: Parameters<typeof buildResourceActionMenu>[0], context: Parameters<typeof buildResourceActionMenu>[1], surface: Parameters<typeof buildResourceActionMenu>[2] = 'topbar') =>
    ids(buildResourceActionMenu(kind, context, surface)).includes('reveal-in-finder');

  it('is offered for a saved, active note — in the location group, divided from organize', () => {
    const menu = buildResourceActionMenu('note', { status: 'active' }, 'topbar');
    expect(ids(menu)).toContain('reveal-in-finder');
    expect(menu.find((item) => item.id === 'reveal-in-finder')).toMatchObject({
      label: 'Reveal in Finder',
      icon: 'folder',
      separatorBefore: true,
    });
  });

  it('is disabled (not omitted) for an unsaved draft note', () => {
    expect(
      buildResourceActionMenu('note', { isDraft: true }, 'topbar').find((item) => item.id === 'reveal-in-finder')?.disabled
    ).toBe(true);
  });

  it('is hidden on the topbar for a template, an archived note, a daily note and a folder', () => {
    expect(hasReveal('note', { status: 'active', isTemplate: true })).toBe(false);
    expect(hasReveal('note', { status: 'archived' })).toBe(false);
    expect(hasReveal('daily-note', { status: 'active' })).toBe(false);
    expect(hasReveal('folder', { status: 'active' })).toBe(false);
  });

  it('is unchanged on the sidebar, where every resource keeps it', () => {
    expect(hasReveal('daily-note', { status: 'active' }, 'sidebar')).toBe(true);
    expect(hasReveal('folder', { status: 'active' }, 'sidebar')).toBe(true);
    expect(hasReveal('asset', { assetKind: 'image', status: 'active' }, 'sidebar')).toBe(true);
  });
});

describe('tag menu', () => {
  it('sidebar: Rename, Change icon | Pin | Delete, with dividers from the groups', () => {
    const menu = buildResourceActionMenu('tag', {}, 'sidebar');
    expect(ids(menu)).toEqual(['rename', 'change-icon', 'toggle-pin', 'delete']);
    expect(dividedIds(menu)).toEqual(['toggle-pin', 'delete']);
    expect(menu.find((item) => item.id === 'toggle-pin')).toMatchObject({ label: 'Pin', icon: 'pin' });
    expect(menu.find((item) => item.id === 'delete')).toMatchObject({ label: 'Delete', icon: 'trash' });
  });

  it('keeps Pin / Unpin wording (a distinct concept from Favorites)', () => {
    const pinned = buildResourceActionMenu('tag', { isPinned: true }, 'sidebar');
    expect(pinned.find((item) => item.id === 'toggle-pin')?.label).toBe('Unpin');
    expect(ids(pinned)).not.toContain('toggle-favorite');
  });

  it('a tag keeps Delete in the sidebar even though other resources do not (it has no Trash)', () => {
    expect(ids(buildResourceActionMenu('tag', {}, 'sidebar'))).toContain('delete');
    expect(ids(buildResourceActionMenu('note', { status: 'archived', isDeletable: true }, 'sidebar'))).not.toContain(
      'delete'
    );
  });

  it('the tag page topbar offers only Delete', () => {
    expect(ids(buildResourceActionMenu('tag', {}, 'topbar'))).toEqual(['delete']);
  });
});

describe('task menu', () => {
  const all = ['duplicate', 'change-due-date', 'open-in-note', 'delete'];

  it('organize | view | destructive: Duplicate | Due date, Show in note | Delete', () => {
    const menu = buildResourceActionMenu('task', { executable: all }, 'sidebar');
    expect(ids(menu)).toEqual(['duplicate', 'change-due-date', 'open-in-note', 'delete']);
    expect(dividedIds(menu)).toEqual(['change-due-date', 'delete']);
  });

  it('lists an action only when its operation was supplied', () => {
    expect(ids(buildResourceActionMenu('task', { executable: ['open-in-note'] }, 'sidebar'))).toEqual(['open-in-note']);
    expect(buildResourceActionMenu('task', {}, 'sidebar')).toEqual([]);
  });

  it('shows the current due date at the right of the Due date row', () => {
    const menu = buildResourceActionMenu('task', { executable: all, valueLabel: 'Tomorrow' }, 'sidebar');
    expect(menu.find((item) => item.id === 'change-due-date')?.trailing).toBe('Tomorrow');
  });

  it('Delete is a task\'s removal action, so the sidebar keeps it (a task has no Trash)', () => {
    expect(ids(buildResourceActionMenu('task', { executable: all }, 'sidebar'))).toContain('delete');
  });
});

describe('Create template (ADR-048 organize group)', () => {
  const has = (kind: Parameters<typeof buildResourceActionMenu>[0], context: Parameters<typeof buildResourceActionMenu>[1], surface: Parameters<typeof buildResourceActionMenu>[2] = 'topbar') =>
    ids(buildResourceActionMenu(kind, context, surface)).includes('create-template');

  it('is visible for an active regular Note and an active Daily Note, on every surface', () => {
    for (const surface of ['sidebar', 'favorites', 'topbar'] as const) {
      expect(has('note', { status: 'active' }, surface)).toBe(true);
      expect(has('daily-note', { status: 'active' }, surface)).toBe(true);
    }
  });

  it('is hidden for a Template, an archived Note and an archived Daily Note', () => {
    for (const surface of ['sidebar', 'favorites', 'topbar'] as const) {
      expect(has('note', { status: 'active', isTemplate: true }, surface)).toBe(false);
      expect(has('note', { status: 'archived' }, surface)).toBe(false);
      expect(has('daily-note', { status: 'archived', isDeletable: true }, surface)).toBe(false);
    }
  });

  it('is hidden for a Trash / archived resource of any kind and for resources that cannot be templates', () => {
    expect(has('folder', { status: 'archived' })).toBe(false);
    expect(has('folder', { status: 'active' })).toBe(false);
    expect(has('asset', { assetKind: 'image', status: 'active' }, 'sidebar')).toBe(false);
    expect(has('asset', { assetKind: 'image', status: 'archived' }, 'overlay')).toBe(false);
    expect(ids(buildResourceActionMenu('tag', {}, 'sidebar'))).not.toContain('create-template');
    expect(ids(buildResourceActionMenu('task', { executable: ['duplicate', 'delete'] }, 'sidebar'))).not.toContain(
      'create-template'
    );
  });

  it('is unavailable for an unsaved draft: disabled on the topbar, absent from the sidebar', () => {
    expect(buildResourceActionMenu('note', { isDraft: true }, 'topbar').find((item) => item.id === 'create-template')?.disabled).toBe(true);
    expect(has('note', { isDraft: true }, 'sidebar')).toBe(false);
  });

  it('sits in the organize group, after Use as template and before the location group, with no hand-written divider', () => {
    const menu = buildResourceActionMenu('note', { status: 'active' }, 'topbar');
    const order = ids(menu);

    expect(order.indexOf('create-template')).toBeGreaterThan(order.indexOf('use-as-template'));
    expect(order.indexOf('create-template')).toBeLessThan(order.indexOf('reveal-in-finder'));
    // Same group as the previous organize item, so no divider before it.
    expect(menu.find((item) => item.id === 'create-template')?.separatorBefore).toBeUndefined();
    expect(menu.find((item) => item.id === 'create-template')).toMatchObject({ label: 'Create template', icon: 'template' });
  });
});
