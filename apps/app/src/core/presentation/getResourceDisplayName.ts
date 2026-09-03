import type { VaultResource } from '../vault/models/VaultResource';
import { VaultPath } from '../vault/ingest/VaultPath';

/**
 * A resource's display name — its filename minus its own extension. Unlike
 * a Page, VaultResource.name intentionally keeps its extension (see
 * Vault.ts's doc comment on resource naming), because the extension is
 * still needed for rename/move path resolution. Every rendering surface
 * (sidebar rows, collection views, embed autocomplete, image alt text)
 * calls this instead of reading resource.name directly, so the extension
 * never leaks into what the user sees, while resource.name/resource.path
 * themselves stay untouched for resolution and persistence.
 */
export function getResourceDisplayName(resource: Pick<VaultResource, 'name'>): string {
  return VaultPath.stemName(resource.name);
}
