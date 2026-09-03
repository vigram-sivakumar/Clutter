import type { ReactNode } from 'react';
import type { Page, PageType } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import { buildDailyNoteTopBarMenu } from '@features/daily-notes/topbar/dailyNoteTopBarMenu.config';
import { buildNoteTopBarMenu } from '@features/notes/topbar/noteTopBarMenu.config';
import { buildFolderTopBarMenu } from '@features/notes/topbar/folderTopBarMenu.config';
import { buildResourceTopBarMenu } from '@features/notes/topbar/resourceTopBarMenu.config';

import { renderTopBarActions } from './topBarRegistry';
import type { TopBarMenuItemConfig, TopBarPageState } from './ResourceTopBarActions';

function isPage(entry: Page | Folder): entry is Page {
  return 'type' in entry;
}

type TopBarResourceType = PageType | 'folder' | 'reserved-folder';

// ADR-023: routes through MembershipSelector.isSystemFolder() rather than
// calling Vault.isReservedFolder() directly — the single owning
// classification layer for "is this a system/reserved folder," same as
// systemPresentation.ts's getSystemLocationForFolder().
function getTopBarResourceType(
  resource: Page | Folder,
  membershipSelector: MembershipSelector
): TopBarResourceType {
  if (isPage(resource)) {
    return resource.type;
  }

  if (membershipSelector.isSystemFolder(resource)) {
    return 'reserved-folder';
  }

  return 'folder';
}

/**
 * Resolves the state-aware menu for a page type. Lives here, not in
 * topBarRegistry.tsx, because this is the one place that already narrows
 * Page | Folder to a specific Page and its type — and, for drafts (see
 * buildDraftTopBarActions below), the one place a PageType is known
 * without a backing Page at all (ADR-017).
 */
function buildMenuForType(
  type: PageType,
  state: TopBarPageState,
  isFavorite: boolean,
  isDeletable: boolean
): readonly TopBarMenuItemConfig[] {
  switch (type) {
    case 'note':
      return buildNoteTopBarMenu(state, isFavorite, isDeletable);
    // Daily Notes deliberately do not support favoriting (unlike Note/
    // Folder) — buildDailyNoteTopBarMenu takes no isFavorite param.
    case 'daily-note':
      return buildDailyNoteTopBarMenu(state, isDeletable);
    default:
      return [];
  }
}

export interface TopBarParts {
  actions: ReactNode;
}

export interface BuildTopBarActionsOptions {
  membershipSelector: MembershipSelector;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  /**
   * ADR-026: set only when archiving `resource` (a folder) needs
   * confirmation first — i.e. it has descendants. Ignored for a page.
   * See ResourceTopBarActions' matching prop for how this gates dispatch.
   */
  archiveConfirmationMessage?: string;
  /** Same shape as archiveConfirmationMessage, for 'delete'. */
  deleteConfirmationMessage?: string;
  /** Present only when `resource`'s menu includes a `move-to` item — see ResourceTopBarActions' matching props. */
  moveDestinations?: FolderPickerItem[];
  onMove?: (destinationFolderId: string | null) => void;
  /** Present alongside moveDestinations — see ResourceTopBarActions' matching prop. */
  onCreateFolder?: (name: string) => Promise<string>;
  /**
   * PageHost.tsx's onToggleFavorite — a plain
   * PageOperations.updateMetadata({ favorite: !current })/
   * FolderOperations.updateMetadata({ favorite: !current }) call, same
   * shape as onArchive/onDelete/etc. above, for whichever resource type
   * `buildTopBarActions` was called for. `isFavorite` itself needs no
   * caller-supplied counterpart since buildTopBarActions already has
   * `resource` and reads `resource.metadata.favorite` directly. Ignored
   * (never forwarded) for a Daily Note — see buildTopBarActions'
   * `isFavoritable` check; Daily Notes do not support favoriting.
   */
  onToggleFavorite?: () => void;
  /**
   * Forwarded to ResourceTopBarActions — see its matching prop. Invoked
   * with the submitted cover URL; the Composition Root's caller (PageHost)
   * supplies a closure over PageOperations.updateMetadata/FolderOperations.
   * updateMetadata for whichever resource type this call was made for.
   */
  onSetCoverImage?: (url: string) => void;
  onSetCoverImageFromUpload?: (sourcePath: string) => void;
  onRemoveCoverImage?: () => void;
}

/**
 * Builds trailing top bar actions for the currently active resource.
 */
export function buildTopBarActions(
  resource: Page | Folder,
  options: BuildTopBarActionsOptions
): TopBarParts {
  const resourceType = getTopBarResourceType(resource, options.membershipSelector);
  // Daily Notes deliberately do not support favoriting (unlike Note/
  // Folder) — isFavorite/onToggleFavorite are never forwarded for one, so
  // its standalone favorite button (ResourceTopBarActions is shared across
  // all three resource types) renders inert, the same "unwired" shape any
  // unsupported item already has elsewhere.
  const isFavoritable = !isPage(resource) || resource.type === 'note';
  const isFavorite = isFavoritable ? resource.metadata.favorite : false;
  const hasCoverImage = resource.metadata.cover !== null;
  // Deletion-UX product decision: permanent Delete is withdrawn from every
  // ordinary workspace resource (Archive is its removal action instead)
  // and preserved only for a resource that is itself archived or a
  // descendant of the reserved Archive folder — the exact relationship
  // MembershipSelector.isEffectivelyArchived already owns (ADR-026 §5), so
  // this composes that existing predicate with the resource's own status
  // rather than adding a new selector method or a parallel ad hoc check.
  const isDeletable =
    resource.metadata.status === 'archived' ||
    options.membershipSelector.isEffectivelyArchived(resource.parentId);
  const menu = isPage(resource)
    ? buildMenuForType(resource.type, resource.metadata.status, isFavorite, isDeletable)
    : buildFolderTopBarMenu(resource.metadata.status, isFavorite, isDeletable);

  return {
    actions: renderTopBarActions(resourceType, {
      menu,
      onArchive: options.onArchive,
      onRestore: options.onRestore,
      onDelete: options.onDelete,
      onDuplicate: options.onDuplicate,
      archiveConfirmationMessage: options.archiveConfirmationMessage,
      deleteConfirmationMessage: options.deleteConfirmationMessage,
      moveDestinations: options.moveDestinations,
      onMove: options.onMove,
      onCreateFolder: options.onCreateFolder,
      isFavorite,
      onToggleFavorite: isFavoritable ? options.onToggleFavorite : undefined,
      onSetCoverImage: options.onSetCoverImage,
      onSetCoverImageFromUpload: options.onSetCoverImageFromUpload,
      onRemoveCoverImage: options.onRemoveCoverImage,
      hasCoverImage,
    }),
  };
}

/**
 * The draft (ADR-017) counterpart to buildTopBarActions: same page chrome
 * (favorite/width-fill/overflow menu — see ResourceTopBarActions), built
 * from just a PageType since a draft has no backing Page/Folder/Vault
 * entry yet. Archive/restore render disabled, never omitted (ADR-017
 * Decision item 9) — no handlers are passed because a disabled MenuItem
 * never invokes onClick (Entry's own disabled guard). Delete is omitted
 * outright (isDeletable: false) rather than rendered disabled — a draft is
 * definitionally an ordinary workspace resource (it has no Vault entry to
 * be archived at all), the same "no Delete entry point" treatment every
 * persisted ordinary resource now gets, see buildTopBarActions' isDeletable.
 */
export function buildDraftTopBarActions(
  type: PageType,
  options?: {
    onSetCoverImage?: (url: string) => void;
    onSetCoverImageFromUpload?: (sourcePath: string) => void;
    onRemoveCoverImage?: () => void;
  }
): TopBarParts {
  return {
    actions: renderTopBarActions(type, {
      // A draft has no persisted PageMetadata (ADR-017) — favorite is
      // always false pre-promotion, same as EffectivePage's draft case.
      menu: buildMenuForType(type, 'draft', false, false),
      // A plain Note draft's add-cover-image item is never disabled
      // (buildNoteTopBarMenu) — PageOperations.updateMetadata() already
      // promotes a draft on a committed cover patch (persistDraft), the
      // same mechanism title/body commits already use, so this closure
      // works unchanged whether the draft is a Note or already a real
      // page. A Daily Note draft's item is disabled instead
      // (buildDailyNoteTopBarMenu), so this is never invoked for one.
      onSetCoverImage: options?.onSetCoverImage,
      onSetCoverImageFromUpload: options?.onSetCoverImageFromUpload,
      onRemoveCoverImage: options?.onRemoveCoverImage,
      hasCoverImage: false,
    }),
  };
}

export interface BuildResourceTopBarActionsOptions {
  isArchived: boolean;
  /** Opens RenameResourceDialog — a resource rename is never a direct mutation from this menu, see resourceTopBarMenu.config.ts. */
  onRename?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  /** Delete is always reachable (and therefore always confirmed) for an archived resource — see buildResourceTopBarMenu. */
  deleteConfirmationMessage?: string;
  moveDestinations?: FolderPickerItem[];
  onMove?: (destinationFolderId: string | null) => void;
  onCreateFolder?: (name: string) => Promise<string>;
}

/**
 * The Image/PDF Resource Page's counterpart to buildTopBarActions — a
 * third sibling function in this file (alongside buildDraftTopBarActions),
 * since a VaultResource is neither a Page nor a Folder and has no status
 * field to route through getTopBarResourceType. Menu is entirely
 * status-driven (buildResourceTopBarMenu), same reasoning buildMenuForType
 * already establishes for pages.
 */
export function buildResourceTopBarActions(
  options: BuildResourceTopBarActionsOptions
): TopBarParts {
  return {
    actions: renderTopBarActions('resource', {
      menu: buildResourceTopBarMenu(options.isArchived),
      onRename: options.onRename,
      onArchive: options.onArchive,
      onRestore: options.onRestore,
      onDelete: options.onDelete,
      deleteConfirmationMessage: options.deleteConfirmationMessage,
      moveDestinations: options.moveDestinations,
      onMove: options.onMove,
      onCreateFolder: options.onCreateFolder,
    }),
  };
}
