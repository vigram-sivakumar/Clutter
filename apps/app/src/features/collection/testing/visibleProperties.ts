import type { PropertyId } from '@core/properties/collectionProperties';
import {
  ARCHIVE_COLLECTION,
  FOLDER_COLLECTION,
  TAG_COLLECTION,
  type CollectionDefinition,
} from '@core/presentation/collection/collectionDefinitions';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';

/**
 * Test shorthand: the visible properties a page would pass a body — the collection's defaults,
 * resolved the real way (`resolveCollectionView`), with the named properties switched off. A test
 * says which property it hides, never how the visible list is assembled.
 */
function visibleWithout(definition: CollectionDefinition, hidden: readonly PropertyId[]): PropertyId[] {
  return [
    ...resolveCollectionView(definition, {
      propertyOverrides: Object.fromEntries(hidden.map((id) => [id, false])),
    }).visible,
  ];
}

/** An ordinary note collection's visible properties, minus `hidden`. */
export const noteVisible = (...hidden: PropertyId[]): PropertyId[] => visibleWithout(FOLDER_COLLECTION, hidden);

/** The Archive's visible properties (which include Archived), minus `hidden`. */
export const archiveVisible = (...hidden: PropertyId[]): PropertyId[] => visibleWithout(ARCHIVE_COLLECTION, hidden);

/** The Tag collection's visible properties (which include Source), minus `hidden`. */
export const tagVisible = (...hidden: PropertyId[]): PropertyId[] => visibleWithout(TAG_COLLECTION, hidden);
