import { buildCopyPathSubmenu, type LocationEntityKind } from '../getLocationPathRepresentations';
import {
  ARCHIVE_ACTION_LABEL,
  DELETE_ACTION_LABEL,
  FAVORITE_ACTION_LABEL,
  UNFAVORITE_ACTION_LABEL,
} from '../resourceActionLabels';
import { FOLDER_SORT_BY } from './folderSortAction';
import type { ResourceActionDefinition, ResourceActionContext, ResourceKind } from './resourceActionTypes';

/**
 * The canonical actions per resource kind (ADR-048). A definition owns its id, wording, icon,
 * group, order and availability; which surface shows it is `resourceActionSurfaces.ts`, and what
 * it does is the existing domain operation bound to its id by the surface.
 *
 * To add an action: add one definition here and put it in the kind's list. Group and order place
 * it, and the dividers follow from the groups.
 */

/** A draft has no Vault entry yet — nothing to rename, favorite, copy or move. */
function persistedOnly(context: ResourceActionContext) {
  return context.isDraft ? ('unavailable' as const) : ('enabled' as const);
}

/** Needs a saved, active resource (Move's approved contract excludes archived sources). */
function activePersistedOnly(context: ResourceActionContext) {
  return context.isDraft || context.status === 'archived' ? ('unavailable' as const) : ('enabled' as const);
}

const RENAME: ResourceActionDefinition = {
  id: 'rename',
  group: 'identity',
  order: 10,
  label: 'Rename',
  icon: 'notePencil',
  opensInlineEdit: true,
  availability: persistedOnly,
};

const CHANGE_ICON: ResourceActionDefinition = {
  id: 'change-icon',
  group: 'identity',
  order: 20,
  label: 'Change icon',
  icon: 'smile',
  availability: persistedOnly,
};

const TOGGLE_FAVORITE: ResourceActionDefinition = {
  id: 'toggle-favorite',
  group: 'organize',
  order: 10,
  label: (context) => (context.isFavorite ? UNFAVORITE_ACTION_LABEL : FAVORITE_ACTION_LABEL),
  icon: (context) => (context.isFavorite ? 'favouriteFilled' : 'favouriteOutline'),
  availability: persistedOnly,
};

const DUPLICATE: ResourceActionDefinition = {
  id: 'duplicate',
  group: 'organize',
  order: 20,
  label: 'Duplicate',
  icon: 'duplicate',
  availability: persistedOnly,
};

const MOVE_TO: ResourceActionDefinition = {
  id: 'move-to',
  group: 'organize',
  order: 30,
  label: 'Move to…',
  icon: 'arrowDownRight',
  // A Template moves too — within Templates (ADR-049); `moveZoneFor` picks the picker's root.
  availability: activePersistedOnly,
};

const USE_AS_TEMPLATE: ResourceActionDefinition = {
  id: 'use-as-template',
  group: 'organize',
  order: 40,
  label: 'Use as template',
  icon: 'template',
  availability: (context) => (context.isTemplate ? 'hidden' : activePersistedOnly(context)),
};

function revealInFinder(): ResourceActionDefinition {
  return {
    id: 'reveal-in-finder',
    group: 'location',
    order: 10,
    label: 'Reveal in Finder',
    icon: 'folder',
    availability: persistedOnly,
  };
}

function copyPath(kind: LocationEntityKind): ResourceActionDefinition {
  return {
    id: 'copy-path',
    group: 'location',
    order: 20,
    label: 'Copy path',
    icon: 'link',
    submenu: buildCopyPathSubmenu(kind),
    availability: persistedOnly,
  };
}

const ARCHIVE: ResourceActionDefinition = {
  id: 'archive',
  group: 'lifecycle',
  order: 10,
  label: ARCHIVE_ACTION_LABEL,
  icon: 'archive',
  availability: (context) => (context.status === 'archived' ? 'hidden' : persistedOnly(context)),
};

const RESTORE: ResourceActionDefinition = {
  id: 'restore',
  group: 'lifecycle',
  order: 10,
  label: 'Restore',
  icon: 'restore',
  availability: (context) => (context.status === 'archived' ? persistedOnly(context) : 'hidden'),
};

/** Permanent delete: only for an archived resource or an Archive descendant. */
const DELETE: ResourceActionDefinition = {
  id: 'delete',
  group: 'destructive',
  order: 10,
  label: DELETE_ACTION_LABEL,
  icon: 'trash',
  availability: (context) => (context.isDeletable ? persistedOnly(context) : 'hidden'),
};

/**
 * Assets act on a vault file or, for a remote image, a URL. A file action is hidden for a remote
 * asset; a URL action is hidden for a file.
 */
function forFile(definition: ResourceActionDefinition): ResourceActionDefinition {
  return {
    ...definition,
    availability: (context) => (context.isRemote ? 'hidden' : (definition.availability?.(context) ?? 'enabled')),
  };
}

function forUrl(definition: ResourceActionDefinition): ResourceActionDefinition {
  return {
    ...definition,
    availability: (context) => (context.isRemote ? (definition.availability?.(context) ?? 'enabled') : 'hidden'),
  };
}

const SAVE_TO_VAULT: ResourceActionDefinition = {
  id: 'save-to-vault',
  group: 'organize',
  order: 35,
  label: 'Save to vault',
  icon: 'arrowDownRight',
};

/** Sets this image as the cover of the note the asset is shown in — only where a surface supplies it. */
const SET_AS_COVER_IMAGE: ResourceActionDefinition = {
  id: 'set-as-cover-image',
  group: 'organize',
  order: 40,
  label: 'Set as cover image',
  icon: 'image',
  availability: (context) =>
    context.setAsCoverImage === 'enabled' ? 'enabled' : context.setAsCoverImage === 'disabled' ? 'unavailable' : 'hidden',
};

const OPEN_IN_BROWSER: ResourceActionDefinition = {
  id: 'open-in-browser',
  group: 'location',
  order: 30,
  label: 'Open in browser',
  icon: 'arrowUpRight',
};

const COPY_LINK: ResourceActionDefinition = {
  id: 'copy-link',
  group: 'location',
  order: 40,
  label: 'Copy link',
  icon: 'link',
};

/** Download is image-only (see downloadResource.ts); PDF has none yet. */
const DOWNLOAD: ResourceActionDefinition = {
  id: 'download',
  group: 'location',
  order: 50,
  label: 'Download',
  icon: 'download',
  availability: (context) => (context.assetKind === 'image' ? 'enabled' : 'hidden'),
};

/** Pinning a tag is its `favorite` metadata (what the Pinned grouping reads) — named Pin, not Favorite. */
const TOGGLE_PIN: ResourceActionDefinition = {
  id: 'toggle-pin',
  group: 'organize',
  order: 10,
  label: (context) => (context.isPinned ? 'Unpin' : 'Pin'),
  icon: 'pin',
};

/** A tag or task has no Trash: Delete removes it, after the caller's confirmation where there is one. */
const DELETE_TAG: ResourceActionDefinition = {
  id: 'delete',
  group: 'destructive',
  order: 10,
  label: 'Delete',
  icon: 'trash',
};

/** A task row lists an action only when its caller supplied the operation. */
function whenExecutable(id: string) {
  return (context: ResourceActionContext) => (context.executable?.includes(id) ? ('enabled' as const) : ('hidden' as const));
}

export const RESOURCE_ACTIONS: Readonly<Record<ResourceKind, readonly ResourceActionDefinition[]>> = {
  note: [
    RENAME,
    CHANGE_ICON,
    TOGGLE_FAVORITE,
    DUPLICATE,
    MOVE_TO,
    USE_AS_TEMPLATE,
    revealInFinder(),
    copyPath('page'),
    ARCHIVE,
    RESTORE,
    DELETE,
  ],
  // A Daily Note's title is its date: no rename, icon, favorite, duplicate or move.
  'daily-note': [revealInFinder(), copyPath('page'), ARCHIVE, RESTORE, DELETE],
  // Folders are never duplicable or templates. Sort by is a sidebar view preference (the topbar
  // surface profile omits it).
  folder: [
    RENAME,
    CHANGE_ICON,
    TOGGLE_FAVORITE,
    MOVE_TO,
    FOLDER_SORT_BY,
    revealInFinder(),
    copyPath('folder'),
    ARCHIVE,
    RESTORE,
    DELETE,
  ],
  asset: [
    forFile(RENAME),
    forFile(MOVE_TO),
    forUrl(SAVE_TO_VAULT),
    SET_AS_COVER_IMAGE,
    forFile(revealInFinder()),
    forFile(copyPath('resource')),
    forUrl(OPEN_IN_BROWSER),
    forUrl(COPY_LINK),
    DOWNLOAD,
    forFile(ARCHIVE),
  ],
  tag: [RENAME, CHANGE_ICON, TOGGLE_PIN, DELETE_TAG],
  // A task is a line inside a Note: no rename, icon, favorite or move. Its removal is Delete.
  task: [
    { ...DUPLICATE, availability: whenExecutable('duplicate') },
    {
      id: 'change-due-date',
      group: 'view',
      order: 10,
      label: 'Due date',
      icon: 'calendarDots',
      trailing: (context) => context.valueLabel,
      availability: whenExecutable('change-due-date'),
    },
    {
      id: 'open-in-note',
      group: 'view',
      order: 20,
      label: 'Show in note',
      icon: 'note',
      availability: whenExecutable('open-in-note'),
    },
    { ...DELETE_TAG, availability: whenExecutable('delete') },
  ],
};
