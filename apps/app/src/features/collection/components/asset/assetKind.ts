import type { VaultResourceKind } from '@core/vault/models/VaultResource';

/** What a resource's kind is called in the Type column / row metadata / card header. */
export const ASSET_KIND_LABEL: Record<VaultResourceKind, string> = { image: 'Image', pdf: 'PDF' };
