import { buildSelectionActionMenu, SELECTION_ITEM_ACTION_IDS } from '@core/presentation/resourceActions/buildSelectionActionMenu';
import type { PickerListItem } from '@components/picker-list/PickerList.types';
import { PAGE_DELETE_CONFIRMATION_MESSAGE } from '@features/notes/helpers/folderActionConfirmation';

import type { ResourceTopBarActionsProps } from '../topbar/ResourceTopBarActions';

/** The wording when Move to trash needs a confirmation for something in the selection (a folder with contents). */
const SELECTION_ARCHIVE_CONFIRMATION_TITLE = 'Move the selected items to trash?';
const SELECTION_ARCHIVE_CONFIRMATION_MESSAGE = 'Folders in the selection take everything inside them to the trash too';

/** The Delete confirmation when the selection's items would each warn something different (a folder with contents among them). */
const SELECTION_DELETE_CONFIRMATION_MESSAGE = `This will also permanently delete everything inside the selected folders. ${PAGE_DELETE_CONFIRMATION_MESSAGE}`;

export interface SelectionMenuOps {
  /** How many items the collection shows (what "all selected" is measured against). */
  total: number;
  selectAll(): void;
  clear(): void;
}

/**
 * The right-click menu for several selected Collection View items, composed from the menus those items already
 * have (`items`: each one's single-item menu, `null` for an item with none). An action is offered only when EVERY
 * item's own menu offers it, enabled, with its handler — so what each kind supports (a Daily Note or an asset has no
 * favorite, an archived item has no Move) is decided where it already is, never restated here. Running an action runs
 * each item's own handler; Move's destinations are those valid for every item.
 */
export function buildSelectionContextMenu(
  items: readonly (ResourceTopBarActionsProps | null)[],
  ops: SelectionMenuOps
): ResourceTopBarActionsProps {
  const offered = (id: string) =>
    items.length > 0 &&
    items.every((item) => item?.menu.some((entry) => entry.id === id && !entry.disabled) === true);

  const supported = new Set(
    SELECTION_ITEM_ACTION_IDS.filter((id) => {
      if (!offered(id)) {
        return false;
      }
      if (id === 'move-to') {
        return items.every((item) => item?.moveDestinations !== undefined && item.onMove);
      }
      if (id === 'delete') {
        // Delete always confirms (it is permanent), so an item that offers it must carry its confirmation too.
        return items.every((item) => item?.handlers?.['delete'] && item.deleteConfirmationMessage !== undefined);
      }
      return items.every((item) => item?.handlers?.[id]);
    })
  );

  // Destinations valid for every item (a folder's list leaves out itself and its descendants).
  const destinations = supported.has('move-to') ? commonDestinations(items.map((item) => item!.moveDestinations!)) : undefined;
  const allFavorite = items.length > 0 && items.every((item) => item?.isFavorite === true);
  const deleteMessages = new Set(items.map((item) => item?.deleteConfirmationMessage));
  const archiveConfirms = items.some((item) => item?.archiveConfirmationMessage !== undefined);

  return {
    menu: buildSelectionActionMenu({ count: items.length, total: ops.total, supported, allFavorite }),
    handlers: {
      // One item that toggles (its label follows): Select all, or — when every item shown is already selected — Deselect all.
      'select-all': items.length >= ops.total ? ops.clear : ops.selectAll,
      // The final state is the same for all: Remove when every one is a favorite, otherwise Add — and only items not
      // already there are toggled, so none ends up flipped the wrong way.
      'toggle-favorite': () =>
        runForEach(items, (item) => {
          if ((item?.isFavorite === true) === allFavorite) {
            item?.handlers?.['toggle-favorite']?.();
          }
        }),
      // Once per resource (several entries can lead to the same one), and never for one that has been archived since
      // the selection was made — its own archive would only fail.
      archive: () => runForEach(archivable(items), (item) => item?.handlers?.['archive']?.()),
      delete: () => runForEach(items, (item) => item?.handlers?.['delete']?.()),
    },
    // The existing Delete confirmation (title, copy, button), told how many items it is about. A lone item keeps its own.
    ...(supported.has('delete')
      ? {
          deleteConfirmationTitle: items.length > 1 ? `Delete ${items.length} items permanently?` : undefined,
          deleteConfirmationMessage:
            deleteMessages.size === 1 ? [...deleteMessages][0] : SELECTION_DELETE_CONFIRMATION_MESSAGE,
        }
      : {}),
    archiveConfirmationTitle: archiveConfirms ? SELECTION_ARCHIVE_CONFIRMATION_TITLE : undefined,
    archiveConfirmationMessage: archiveConfirms ? SELECTION_ARCHIVE_CONFIRMATION_MESSAGE : undefined,
    moveDestinations: destinations,
    onMove: destinations ? (destinationFolderId) => items.forEach((item) => item?.onMove?.(destinationFolderId)) : undefined,
  };
}

/** The items an archive should run for: one per resource, skipping any already archived at this moment. */
function archivable<T extends ResourceTopBarActionsProps | null>(items: readonly T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (item?.isArchived?.()) {
      return false;
    }
    if (item?.resourceId !== undefined) {
      if (seen.has(item.resourceId)) {
        return false;
      }
      seen.add(item.resourceId);
    }
    return true;
  });
}

/**
 * Runs `action` for every item, so one that fails never leaves the rest undone (each item's own operation reports its
 * failure the way a single-item run does); the first error is rethrown once all have been tried.
 */
function runForEach<T>(items: readonly T[], action: (item: T) => void): void {
  let failure: unknown;
  let failed = false;
  for (const item of items) {
    try {
      action(item);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) {
    throw failure;
  }
}

function commonDestinations(lists: readonly (readonly PickerListItem[])[]): PickerListItem[] {
  const [first = [], ...rest] = lists;
  return first.filter((destination) => rest.every((list) => list.some((other) => other.id === destination.id)));
}
