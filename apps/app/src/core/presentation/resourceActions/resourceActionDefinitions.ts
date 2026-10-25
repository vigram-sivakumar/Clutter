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

/**
 * An archived resource — its own status, or an archived folder above it — is read-only: an action
 * that organizes, edits or relocates it does not apply, so it is hidden (never shown disabled), on
 * every surface. Restore and Delete are the archived resource's own actions and do not use this.
 */
export function isArchivedContext(context: ResourceActionContext): boolean {
  return context.status === 'archived' || context.isEffectivelyArchived === true;
}

/** The definition, hidden for an archived resource and otherwise unchanged. */
function activeOnly(definition: ResourceActionDefinition): ResourceActionDefinition {
  return {
    ...definition,
    availability: (context) => (isArchivedContext(context) ? 'hidden' : (definition.availability?.(context) ?? 'enabled')),
  };
}

/** A draft has no Vault entry yet — nothing to rename, favorite, copy or move. */
function persistedOnly(context: ResourceActionContext) {
  return context.isDraft ? ('unavailable' as const) : ('enabled' as const);
}

/** Needs a saved, active resource (Move's approved contract excludes archived sources). */
function activePersistedOnly(context: ResourceActionContext) {
  return context.isDraft || context.status === 'archived' ? ('unavailable' as const) : ('enabled' as const);
}

const RENAME: ResourceActionDefinition = activeOnly({
  id: 'rename',
  group: 'identity',
  order: 10,
  label: 'Rename',
  icon: 'notePencil',
  opensInlineEdit: true,
  availability: persistedOnly,
});

const CHANGE_ICON: ResourceActionDefinition = activeOnly({
  id: 'change-icon',
  group: 'identity',
  order: 20,
  label: 'Change icon',
  icon: 'smile',
  availability: persistedOnly,
});

const TOGGLE_FAVORITE: ResourceActionDefinition = activeOnly({
  id: 'toggle-favorite',
  group: 'organize',
  order: 10,
  label: (context) => (context.isFavorite ? UNFAVORITE_ACTION_LABEL : FAVORITE_ACTION_LABEL),
  icon: (context) => (context.isFavorite ? 'favouriteFilled' : 'favouriteOutline'),
  availability: persistedOnly,
});

const DUPLICATE: ResourceActionDefinition = activeOnly({
  id: 'duplicate',
  group: 'organize',
  order: 20,
  label: 'Duplicate',
  icon: 'duplicate',
  availability: persistedOnly,
});

const MOVE_TO: ResourceActionDefinition = activeOnly({
  id: 'move-to',
  group: 'organize',
  order: 30,
  label: 'Move to…',
  icon: 'arrowDownRight',
  availability: activePersistedOnly,
});

/**
 * "Save as template": an independent copy of this page's content as a new Template — the source is
 * never moved or converted. For a Note or a Daily Note; not for one already in the Trash or already
 * a Template.
 */
const CREATE_TEMPLATE: ResourceActionDefinition = activeOnly({
  id: 'create-template',
  group: 'organize',
  order: 50,
  label: 'Save as template',
  icon: 'template',
  availability: (context) =>
    context.isTemplate ? 'hidden' : persistedOnly(context),
});

/**
 * Hides or shows this note's References section (ADR-052) — a per-note display preference, never a change to
 * the references themselves. Always offered on an eligible note (not tied to whether it has any references);
 * the label reads whether the section is on screen. Hidden for an archived note, like Properties.
 */
const TOGGLE_REFERENCES: ResourceActionDefinition = activeOnly({
  id: 'toggle-references',
  group: 'view',
  order: 10,
  label: (context) => (context.referencesHidden ? 'Show references' : 'Hide references'),
  icon: 'branch',
  availability: persistedOnly,
});

function revealInFinder(): ResourceActionDefinition {
  return activeOnly({
    id: 'reveal-in-finder',
    group: 'location',
    order: 10,
    label: 'Reveal in Finder',
    icon: 'folder',
    availability: persistedOnly,
  });
}

function copyPath(kind: LocationEntityKind): ResourceActionDefinition {
  return activeOnly({
    id: 'copy-path',
    group: 'location',
    order: 20,
    label: 'Copy path',
    icon: 'link',
    submenu: buildCopyPathSubmenu(kind),
    availability: persistedOnly,
  });
}

const ARCHIVE: ResourceActionDefinition = {
  id: 'archive',
  group: 'lifecycle',
  order: 10,
  label: ARCHIVE_ACTION_LABEL,
  icon: 'archive',
  variant: 'danger',
  availability: (context) => (isArchivedContext(context) ? 'hidden' : persistedOnly(context)),
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
  variant: 'danger',
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

const SAVE_TO_VAULT: ResourceActionDefinition = activeOnly({
  id: 'save-to-vault',
  group: 'organize',
  order: 35,
  label: 'Save to vault',
  icon: 'arrowDownRight',
});

/** Sets this image as the cover of the note the asset is shown in — only where a surface supplies it. */
const SET_AS_COVER_IMAGE: ResourceActionDefinition = activeOnly({
  id: 'set-as-cover-image',
  group: 'organize',
  order: 40,
  label: 'Set as cover image',
  icon: 'image',
  availability: (context) =>
    context.setAsCoverImage === 'enabled' ? 'enabled' : context.setAsCoverImage === 'disabled' ? 'unavailable' : 'hidden',
});

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
  variant: 'danger',
};

/** A task row lists an action only when its caller supplied the operation. */
function whenExecutable(id: string) {
  return (context: ResourceActionContext) => (context.executable?.includes(id) ? ('enabled' as const) : ('hidden' as const));
}

/** Opens the note a line or task lives in (and, where the opener supports it, lands on the exact place). */
const OPEN_IN_NOTE: ResourceActionDefinition = {
  id: 'open-in-note',
  group: 'identity',
  order: 20,
  label: 'Show in note',
  icon: 'note',
};

/**
 * The selection menu's own actions (a Collection View with several items checked): they act on the selection,
 * not on one resource, so they belong to no kind. First in the menu, in the identity group.
 */
const SELECT_ALL: ResourceActionDefinition = {
  id: 'select-all',
  group: 'identity',
  order: 10,
  // One item that toggles: with everything selected it reads Deselect all.
  label: (context) => (context.selectionState === 'all' ? 'Deselect all' : 'Select all'),
  icon: (context) =>
    context.selectionState === 'all' ? 'checkboxChecked' : context.selectionState === 'some' ? 'checkboxIndeterminate' : 'checkboxUnchecked',
};

/**
 * The actions a selection menu can offer, from the same definitions the single-resource menus use — so wording,
 * icon, group and order are theirs. Move to, Favorite, Move to trash and Delete are offered only when every selected
 * item supports them (see `buildSelectionActionMenu`).
 */
export const SELECTION_ACTIONS: readonly ResourceActionDefinition[] = [
  SELECT_ALL,
  MOVE_TO,
  TOGGLE_FAVORITE,
  ARCHIVE,
  DELETE,
];

export const RESOURCE_ACTIONS: Readonly<Record<ResourceKind, readonly ResourceActionDefinition[]>> = {
  note: [
    RENAME,
    CHANGE_ICON,
    TOGGLE_FAVORITE,
    DUPLICATE,
    MOVE_TO,
    CREATE_TEMPLATE,
    TOGGLE_REFERENCES,
    revealInFinder(),
    copyPath('page'),
    ARCHIVE,
    RESTORE,
    DELETE,
  ],
  // A Daily Note's title is its date: no rename, favorite, duplicate or move. It can carry an emoji
  // (the same frontmatter `icon` a Note's does).
  'daily-note': [CHANGE_ICON, CREATE_TEMPLATE, TOGGLE_REFERENCES, revealInFinder(), copyPath('page'), ARCHIVE, RESTORE, DELETE],
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
    // An archived file is restored to where it was, or deleted for good — the only things done TO it.
    forFile(RESTORE),
    forFile(DELETE),
  ],
  tag: [RENAME, CHANGE_ICON, TOGGLE_PIN, DELETE_TAG],
  // A task is a line inside a Note: no rename, icon, favorite or move. Its removal is Delete. Groups: identity
  // (Edit it, or open the note it lives in), organize (its due date, a copy of it), destructive (Delete) — the
  // global order, no task-specific grouping.
  // A tag's matching line is a reference to a line in a source note, not a note: its one action is Show in note.
  'tag-line': [{ ...OPEN_IN_NOTE, order: 10 }],
  task: [
    {
      id: 'edit',
      group: 'identity',
      order: 10,
      label: 'Edit',
      icon: 'edit',
      availability: whenExecutable('edit'),
    },
    { ...OPEN_IN_NOTE, availability: whenExecutable('open-in-note') },
    {
      id: 'change-due-date',
      group: 'organize',
      order: 10,
      label: 'Due date',
      icon: 'calendarDots',
      trailing: (context) => context.valueLabel,
      availability: whenExecutable('change-due-date'),
    },
    { ...DUPLICATE, availability: whenExecutable('duplicate') },
    { ...DELETE_TAG, availability: whenExecutable('delete') },
  ],
};
