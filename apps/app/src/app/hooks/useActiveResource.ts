import { useVault } from './useVault';
import type { VaultResource } from '../../core/vault/models/VaultResource';
import { Vault } from '../../core/vault/models/Vault';

/**
 * React adapter for reading the latest committed VaultResource from the
 * Vault by id — the resource-scoped counterpart to useActivePage.ts.
 *
 * Subscribes to vault mutations so the Image/PDF Resource Page stays in
 * sync after rename/move/archive/restore and external filesystem sync.
 */
export function useActiveResource(
  vault: Vault,
  resourceId: string | null
): VaultResource | undefined {
  useVault(vault);

  if (!resourceId) {
    return undefined;
  }

  return vault.getResource(resourceId);
}
