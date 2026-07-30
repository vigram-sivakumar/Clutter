import type { ReactNode } from 'react';
import type { Page, PageType } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { Vault } from '@core/vault/models/Vault';

import { renderTopBarActions } from './topBarRegistry';

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

export interface TopBarParts {
  actions: ReactNode;
}

export interface BuildTopBarActionsOptions {
  vault: Vault;
  onArchive?: () => void;
}

/**
 * Builds trailing top bar actions for the currently active resource.
 */
export function buildTopBarActions(
  resource: Page | Folder,
  options: BuildTopBarActionsOptions
): TopBarParts {
  const resourceType = getTopBarResourceType(resource, options.vault);

  return {
    actions: renderTopBarActions(resourceType, {
      onArchive: options.onArchive,
    }),
  };
}
