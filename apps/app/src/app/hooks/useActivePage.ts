import { useVault } from './useVault';
import type { Page } from '../../core/vault/models/Page';
import { Vault } from '../../core/vault/models/Vault';

/**
 * React adapter for reading the latest committed Page from the Vault by id.
 *
 * Subscribes to vault mutations so structural presentation stays in sync
 * after moves, archive/restore, and external filesystem sync.
 *
 * Does not own editor state — use DocumentSession for the editable buffer.
 */
export function useActivePage(
  vault: Vault,
  pageId: string | null
): Page | undefined {
  useVault(vault);

  if (!pageId) {
    return undefined;
  }

  return vault.getPage(pageId);
}
