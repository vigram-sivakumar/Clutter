import type { LocalAsset } from '../models/Asset';
import type { VaultResource } from '../models/VaultResource';

/** A test fixture: a vault file as a catalog entry with the given references (none by default). */
export function localAsset(resource: VaultResource, references: LocalAsset['references'] = []): LocalAsset {
  return {
    id: resource.id,
    source: 'local',
    kind: resource.kind,
    name: resource.name,
    references,
    resource,
  };
}
