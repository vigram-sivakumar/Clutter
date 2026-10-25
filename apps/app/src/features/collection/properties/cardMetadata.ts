import {
  propertyLabel,
  type PropertyId,
  type PropertyValues,
} from '@core/properties/collectionProperties';

import { formatPropertyValue, valueProperties } from './formatProperty';

/** One metadata line: which property it is, what it is called, and its value. */
export interface CardMetadataLine {
  readonly id: PropertyId;
  readonly label: string;
  readonly value: string;
}

/**
 * How the cards have always worded two of their lines: "Size" and "Edited", where Configure
 * and the table say "File size" and "Last edited". A known wording drift — kept exactly as it
 * was, and in one place (note and asset cards share it), until a product decision unifies the copy.
 */
const CARD_LINE_LABELS: Partial<Record<PropertyId, string>> = { size: 'Size', updated: 'Edited' };

/**
 * A card's metadata lines, in canonical property order — Size `12 KB`, Created
 * `Yesterday, 9:03 am`, Edited `35 minutes ago` — one per visible plain-value property the
 * entry has a value for (an asset's from its file's own facts via `toAssetEntry`, a note's from its
 * metadata). Dates use the same formatter every collection uses. A value the entry does not have is left
 * out, and so is any line the collection's visible properties hide; empty when there is nothing to show.
 * Consuming `valueProperties` is what makes a property added to the registry a line on every card by
 * default, with no per-card list to update.
 */
export function cardMetadataLines(values: PropertyValues, visible: readonly PropertyId[]): CardMetadataLine[] {
  return valueProperties(visible).flatMap((id) => {
    const value = formatPropertyValue(id, values);

    return value ? [{ id, label: CARD_LINE_LABELS[id] ?? propertyLabel(id), value }] : [];
  });
}
