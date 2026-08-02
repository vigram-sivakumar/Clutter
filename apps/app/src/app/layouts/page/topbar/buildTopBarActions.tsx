import type { ReactNode } from 'react';
import type { Page, PageType } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { Vault } from '@core/vault/models/Vault';
import { buildDailyNoteTopBarMenu } from '@features/daily-notes/topbar/dailyNoteTopBarMenu.config';
import { buildNoteTopBarMenu } from '@features/notes/topbar/noteTopBarMenu.config';

import { renderTopBarActions } from './topBarRegistry';
import type { TopBarMenuItemConfig, TopBarPageState } from './ResourceTopBarActions';

function isPage(entry: Page | Folder): entry is Page {
  return 'type' in entry;
}

type TopBarResourceType = PageType | 'folder' | 'reserved-folder';

function getTopBarResourceType(
  resource: Page | Folder,
  vault: Vault
): TopBarResourceType {
  if (isPage(resource)) {
    return resource.type;
  }

  if (vault.isReservedFolder(resource)) {
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
  state: TopBarPageState
): readonly TopBarMenuItemConfig[] {
  switch (type) {
    case 'note':
      return buildNoteTopBarMenu(state);
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
  vault: Vault;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
}

/**
 * Builds trailing top bar actions for the currently active resource.
 */
export function buildTopBarActions(
  resource: Page | Folder,
  options: BuildTopBarActionsOptions
): TopBarParts {
  const resourceType = getTopBarResourceType(resource, options.vault);
  const menu = isPage(resource)
    ? buildMenuForType(resource.type, resource.metadata.status)
    : undefined;

  return {
    actions: renderTopBarActions(resourceType, {
      menu,
      onArchive: options.onArchive,
      onRestore: options.onRestore,
      onDelete: options.onDelete,
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
      menu: buildMenuForType(type, 'draft'),
    }),
  };
}
