import type { ReactNode } from 'react';
import type { Page, PageType } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { Vault } from '@core/vault/models/Vault';
import { buildDailyNoteTopBarMenu } from '@features/daily-notes/topbar/dailyNoteTopBarMenu.config';
import { buildNoteTopBarMenu } from '@features/notes/topbar/noteTopBarMenu.config';

import { renderTopBarActions } from './topBarRegistry';
import type { TopBarMenuItemConfig } from './ResourceTopBarActions';

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
 * Resolves the status-aware menu for a page resource. Lives here, not in
 * topBarRegistry.tsx, because this is the one place that already narrows
 * Page | Folder to a specific Page and its type.
 */
function buildMenuForPage(page: Page): readonly TopBarMenuItemConfig[] {
  switch (page.type) {
    case 'note':
      return buildNoteTopBarMenu(page);
    case 'daily-note':
      return buildDailyNoteTopBarMenu(page);
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
  const menu = isPage(resource) ? buildMenuForPage(resource) : undefined;

  return {
    actions: renderTopBarActions(resourceType, {
      menu,
      onArchive: options.onArchive,
      onRestore: options.onRestore,
      onDelete: options.onDelete,
    }),
  };
}
