import type { ReactNode } from 'react';
import type { Page, PageType } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import { buildDailyNoteTopBarMenu } from '@features/daily-notes/topbar/dailyNoteTopBarMenu.config';
import { buildNoteTopBarMenu } from '@features/notes/topbar/noteTopBarMenu.config';
import { buildFolderTopBarMenu } from '@features/notes/topbar/folderTopBarMenu.config';

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
  isFavorite: boolean
): readonly TopBarMenuItemConfig[] {
  switch (type) {
    case 'note':
      return buildNoteTopBarMenu(state, isFavorite);
    // Daily Notes deliberately do not support favoriting (unlike Note/
    // Folder) — buildDailyNoteTopBarMenu takes no isFavorite param.
    case 'daily-note':
      return buildDailyNoteTopBarMenu(state);
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
  const menu = isPage(resource)
    ? buildMenuForType(resource.type, resource.metadata.status, isFavorite)
    : buildFolderTopBarMenu(resource.metadata.status, isFavorite);

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
    }),
  };
}

/**
 * The draft (ADR-017) counterpart to buildTopBarActions: same page chrome
 * (favorite/width-fill/overflow menu — see ResourceTopBarActions), built
 * from just a PageType since a draft has no backing Page/Folder/Vault
 * entry yet. Archive/restore/delete render disabled, never omitted
 * (ADR-017 Decision item 9) — no handlers are passed because a disabled
 * MenuItem never invokes onClick (Entry's own disabled guard).
 */
export function buildDraftTopBarActions(type: PageType): TopBarParts {
  return {
    actions: renderTopBarActions(type, {
      // A draft has no persisted PageMetadata (ADR-017) — favorite is
      // always false pre-promotion, same as EffectivePage's draft case.
      menu: buildMenuForType(type, 'draft', false),
    }),
  };
}
