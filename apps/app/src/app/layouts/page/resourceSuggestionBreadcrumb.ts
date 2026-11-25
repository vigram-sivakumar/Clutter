import type { Vault } from '@core/vault/models/Vault';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { isManagedAttachmentPath } from '@core/vault/initialize/ReservedResources';

/** Managed storage is invisible unless the filename needs disambiguation. Search and insertion still use the actual path. */
export function resourceSuggestionBreadcrumb(vault: Vault, resource: VaultResource): string | null {
  const relative = VaultPath.relativeTo(resource.path, vault.root);
  const parent = VaultPath.parentDirectory(relative) || null;
  if (!isManagedAttachmentPath(vault.root, resource.path)) return parent;
  const key = (path: string) => VaultPath.filename(path).normalize('NFC').toLowerCase();
  const name = key(resource.path);
  for (const other of vault.resources()) {
    if (other.id !== resource.id && key(other.path) === name) return parent;
  }
  return null;
}
