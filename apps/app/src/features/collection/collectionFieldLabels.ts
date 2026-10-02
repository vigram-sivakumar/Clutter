import { systemPropertyLabel } from '@core/properties/systemProperties';
import type { SystemPropertyKey } from '@core/properties/systemProperties';

/**
 * The collection views' per-note timestamp fields, by the keys they are
 * persisted and sorted under (`PersistedCollectionSortKey`). The keys stay
 * as they are; this only says which system Property each one is, so its
 * user-facing label comes from the system property definitions
 * (`updated` is the `modified` Property, shown as "Last edited").
 */
export type CollectionTimestampField = 'lastOpened' | 'created' | 'updated';

const SYSTEM_PROPERTY_BY_FIELD: Readonly<Record<CollectionTimestampField, SystemPropertyKey>> = {
  lastOpened: 'lastOpened',
  created: 'created',
  updated: 'modified',
};

/** The label of a collection timestamp field — Created / Last edited / Last opened. */
export function collectionFieldLabel(field: CollectionTimestampField): string {
  return systemPropertyLabel(SYSTEM_PROPERTY_BY_FIELD[field]);
}
