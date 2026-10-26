import { describe, expect, it, vi } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { ResourceActionContext, ResourceKind } from '@core/presentation/resourceActions/resourceActionTypes';

import type { ResourceTopBarActionsProps } from '../topbar/ResourceTopBarActions';
import { buildSelectionContextMenu } from './buildSelectionContextMenu';

const ops = (total = 99) => ({ total, selectAll: vi.fn(), clear: vi.fn() });
const DESTINATIONS = [
  { id: 'root', title: 'Home', level: 0, parentId: null },
  { id: 'a', title: 'A', level: 1, parentId: 'root' },
];

/** An item's own menu as the app builds it: the context surface's menu for its kind, with recording handlers. */
function itemMenu(kind: ResourceKind, log: string[], name: string, context: ResourceActionContext = {}, extra: Partial<ResourceTopBarActionsProps> = {}): ResourceTopBarActionsProps {
  const menu = buildResourceActionMenu(kind, { status: 'active', ...context }, 'context');
  return {
    menu,
    handlers: Object.fromEntries(menu.map((item) => [item.id, () => log.push(`${item.id}:${name}`)])),
    isFavorite: context.isFavorite,
    moveDestinations: DESTINATIONS,
    onMove: (destination) => log.push(`move:${name}:${destination}`),
    ...extra,
  };
}
const ids = (props: ResourceTopBarActionsProps) => props.menu.map((item) => item.id);

describe('buildSelectionContextMenu', () => {
  it('offers every action when every item supports it', () => {
    const log: string[] = [];
    const props = buildSelectionContextMenu([itemMenu('note', log, 'n'), itemMenu('folder', log, 'f')], ops());

    expect(ids(props)).toEqual(['select-all', 'toggle-favorite', 'move-to', 'archive']);
    expect(props.menu[0]!.groupTitle).toBe('2 selected');
  });

  it('leaves out favorites when one item has none — a Daily Note, or an asset', () => {
    const log: string[] = [];

    for (const other of [itemMenu('daily-note', log, 'd'), itemMenu('asset', log, 'a', { assetKind: 'image' })]) {
      const props = buildSelectionContextMenu([itemMenu('note', log, 'n'), other], ops());
      expect(ids(props)).not.toContain('toggle-favorite');
    }
  });

  it('leaves out an action an item shows disabled or not at all, and every action for an item with no menu', () => {
    const log: string[] = [];
    const archived = itemMenu('note', log, 'old', { status: 'archived' });

    expect(ids(buildSelectionContextMenu([itemMenu('note', log, 'n'), archived], ops()))).toEqual(['select-all']);
    expect(ids(buildSelectionContextMenu([itemMenu('note', log, 'n'), null], ops()))).toEqual(['select-all']);
  });

  it('needs the item’s handler too, so no action is ever a control that does nothing', () => {
    const log: string[] = [];
    const noHandler = itemMenu('note', log, 'n', {}, { handlers: {}, moveDestinations: undefined, onMove: undefined });

    expect(ids(buildSelectionContextMenu([noHandler], ops()))).toEqual(['select-all']);
    // Move runs through the picker and `onMove`, not a handler.
    expect(ids(buildSelectionContextMenu([itemMenu('note', log, 'n', {}, { handlers: {} })], ops()))).toEqual(['select-all', 'move-to']);
  });

  it('names the favorite action by the whole selection, and leaves every item in the final state', () => {
    const log: string[] = [];
    const some = [itemMenu('note', log, 'fav', { isFavorite: true }), itemMenu('note', log, 'plain', { isFavorite: false })];
    const mixed = buildSelectionContextMenu(some, ops());

    expect(mixed.menu.find((item) => item.id === 'toggle-favorite')!.label).toBe('Add to favorites');
    mixed.handlers!['toggle-favorite']!();
    expect(log).toEqual(['toggle-favorite:plain']);

    log.length = 0;
    const all = [itemMenu('note', log, 'x', { isFavorite: true }), itemMenu('folder', log, 'y', { isFavorite: true })];
    const allProps = buildSelectionContextMenu(all, ops());
    expect(allProps.menu.find((item) => item.id === 'toggle-favorite')!.label).toBe('Remove from favorites');
    allProps.handlers!['toggle-favorite']!();
    expect(log).toEqual(['toggle-favorite:x', 'toggle-favorite:y']);
  });

  it('archives and moves every selected item with that item’s own operation', () => {
    const log: string[] = [];
    const props = buildSelectionContextMenu([itemMenu('note', log, 'n'), itemMenu('folder', log, 'f')], ops());

    props.handlers!['archive']!();
    props.onMove!('a');

    expect(log).toEqual(['archive:n', 'archive:f', 'move:n:a', 'move:f:a']);
  });

  it('offers only the Move destinations valid for every item, and asks to confirm when a folder has contents', () => {
    const log: string[] = [];
    const folder = itemMenu('folder', log, 'f', {}, { moveDestinations: [DESTINATIONS[0]!], archiveConfirmationMessage: 'Has contents' });
    const props = buildSelectionContextMenu([itemMenu('note', log, 'n'), folder], ops());

    expect(props.moveDestinations!.map((destination) => destination.id)).toEqual(['root']);
    expect(props.archiveConfirmationMessage).toBeDefined();
    expect(props.archiveConfirmationTitle).toBe('Move the selected items to trash?');

    const plain = buildSelectionContextMenu([itemMenu('note', log, 'n')], ops());
    expect(plain.archiveConfirmationMessage).toBeUndefined();
  });

  it('wires Select all to the selection', () => {
    const selection = ops();
    const props = buildSelectionContextMenu([itemMenu('note', [], 'n')], selection);

    props.handlers!['select-all']!();

    expect(selection.selectAll).toHaveBeenCalledTimes(1);
    expect(selection.clear).not.toHaveBeenCalled();
  });

  it('turns the same item into Deselect all once every item the collection shows is selected', () => {
    const selection = ops(2);
    const props = buildSelectionContextMenu([itemMenu('note', [], 'a'), itemMenu('note', [], 'b')], selection);

    const item = props.menu.find((entry) => entry.id === 'select-all')!;
    expect(item.label).toBe('Deselect all');
    expect(props.menu.filter((entry) => /select all/i.test(entry.label))).toHaveLength(1);

    props.handlers!['select-all']!();
    expect(selection.clear).toHaveBeenCalledTimes(1);
    expect(selection.selectAll).not.toHaveBeenCalled();
  });

  it('keeps Select all while only some are selected, measured against the collection, not other selections', () => {
    const some = buildSelectionContextMenu([itemMenu('note', [], 'a')], ops(3));

    expect(some.menu.find((entry) => entry.id === 'select-all')!.label).toBe('Select all');
  });
});

describe('buildSelectionContextMenu — the Select all checkbox', () => {
  const selectAllIcon = (selected: number, total: number) =>
    buildSelectionContextMenu(Array.from({ length: selected }, (_, i) => itemMenu('note', [], `n${i}`)), ops(total)).menu.find(
      (item) => item.id === 'select-all'
    )!.icon;

  it('is measured against every item the collection shows', () => {
    expect(selectAllIcon(1, 3)).toBe('checkboxIndeterminate');
    expect(selectAllIcon(2, 3)).toBe('checkboxIndeterminate');
    expect(selectAllIcon(3, 3)).toBe('checkboxChecked');
  });
});

describe('buildSelectionContextMenu — Delete', () => {
  /** An archived item: its own menu offers Delete (and Restore), with the existing confirmation copy. */
  const trashed = (log: string[], name: string, message = 'You can’t undo this action') =>
    itemMenu('note', log, name, { status: 'archived', isDeletable: true }, { deleteConfirmationMessage: message });

  it('is offered only when every selected item offers it itself', () => {
    const log: string[] = [];

    expect(ids(buildSelectionContextMenu([trashed(log, 'a'), trashed(log, 'b')], ops()))).toContain('delete');
    // One active item, whose own menu has no Delete, takes it away for everyone.
    expect(ids(buildSelectionContextMenu([trashed(log, 'a'), itemMenu('note', log, 'n')], ops()))).not.toContain('delete');
    expect(ids(buildSelectionContextMenu([trashed(log, 'a'), null], ops()))).not.toContain('delete');
  });

  it('keeps archive and delete distinct: Move to trash is never offered for an item already in the trash', () => {
    const log: string[] = [];
    const props = buildSelectionContextMenu([trashed(log, 'a'), trashed(log, 'b')], ops());

    // Restore (the trash's own recovery) and Delete are offered; Move to trash is not, and neither is Move to.
    expect(ids(props)).toEqual(['select-all', 'restore', 'delete']);
  });

  it('asks the existing confirmation, naming the count, and deletes every selected item only on confirm', () => {
    const log: string[] = [];
    const props = buildSelectionContextMenu([trashed(log, 'a'), trashed(log, 'b'), trashed(log, 'c')], ops());

    expect(props.deleteConfirmationTitle).toBe('Delete 3 items permanently?');
    expect(props.deleteConfirmationMessage).toBe('You can’t undo this action');
    expect(log).toEqual([]);

    props.handlers!['delete']!();
    expect(log).toEqual(['delete:a', 'delete:b', 'delete:c']);
  });

  it('keeps a lone item’s own confirmation title, and warns about contents when the items’ warnings differ', () => {
    const log: string[] = [];

    expect(buildSelectionContextMenu([trashed(log, 'a')], ops()).deleteConfirmationTitle).toBeUndefined();

    const mixed = buildSelectionContextMenu([trashed(log, 'a'), trashed(log, 'f', 'Delete this folder and everything inside it? …')], ops());
    expect(mixed.deleteConfirmationMessage).toMatch(/everything inside the selected folders/);
  });

  it('tries every item even when one fails, then reports the failure', () => {
    const log: string[] = [];
    const failing = trashed(log, 'bad');
    failing.handlers = { delete: () => { throw new Error('nope'); } };
    const props = buildSelectionContextMenu([failing, trashed(log, 'ok')], ops());

    expect(() => props.handlers!['delete']!()).toThrow('nope');
    expect(log).toEqual(['delete:ok']);
  });
});

describe('buildSelectionContextMenu — archiving a selection safely', () => {
  it('archives each resource once, however many selected entries lead to it', () => {
    const log: string[] = [];
    const entry = (name: string) => ({ ...itemMenu('note', log, name), resourceId: 'same-note' });
    const props = buildSelectionContextMenu([entry('first'), entry('second')], ops());

    props.handlers!['archive']!();

    expect(log).toEqual(['archive:first']);
  });

  it('skips an item that has been archived since the selection was made, instead of failing on it', () => {
    const log: string[] = [];
    const stale = { ...itemMenu('note', log, 'stale'), resourceId: 'a', isArchived: () => true };
    const fresh = { ...itemMenu('note', log, 'fresh'), resourceId: 'b', isArchived: () => false };
    const props = buildSelectionContextMenu([stale, fresh], ops());

    props.handlers!['archive']!();

    expect(log).toEqual(['archive:fresh']);
  });

  it('reads whether an item is archived when the action runs, not when the menu was built', () => {
    const log: string[] = [];
    let archived = false;
    const item = { ...itemMenu('note', log, 'n'), resourceId: 'a', isArchived: () => archived };
    const props = buildSelectionContextMenu([item], ops());

    archived = true;
    props.handlers!['archive']!();

    expect(log).toEqual([]);
  });
});


describe('buildSelectionContextMenu — Restore (the Trash)', () => {
  const trashed = (log: string[], name: string, over: Partial<ResourceTopBarActionsProps> = {}) =>
    itemMenu('note', log, name, { status: 'archived', isDeletable: true }, { deleteConfirmationMessage: 'You can’t undo this action', ...over });

  it('offers Restore only when every item offers it itself, and never Move to, favorites or Move to trash', () => {
    const log: string[] = [];

    expect(ids(buildSelectionContextMenu([trashed(log, 'a'), trashed(log, 'b')], ops()))).toEqual(['select-all', 'restore', 'delete']);
    // A file inside an archived folder can only be deleted: it takes Restore away for the whole selection.
    const nested = itemMenu('asset', log, 'deep', { status: 'active', isEffectivelyArchived: true, isDeletable: true }, { deleteConfirmationMessage: 'x' });
    expect(ids(buildSelectionContextMenu([trashed(log, 'a'), nested], ops()))).toEqual(['select-all', 'delete']);
  });

  it('restores each selected item once, skipping any that is no longer archived', () => {
    const log: string[] = [];
    const first = trashed(log, 'first', { resourceId: 'a', isArchived: () => true });
    const duplicate = trashed(log, 'duplicate', { resourceId: 'a', isArchived: () => true });
    const already = trashed(log, 'already', { resourceId: 'b', isArchived: () => false });
    const props = buildSelectionContextMenu([first, duplicate, already], ops());

    props.handlers!['restore']!();

    expect(log).toEqual(['restore:first']);
  });
});
