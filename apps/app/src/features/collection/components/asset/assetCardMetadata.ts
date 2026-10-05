import {
  propertyLabel,
  type PropertyId,
  type PropertyValues,
} from '@core/properties/collectionProperties';

import { formatPropertyValue, valueProperties } from '../../properties/formatProperty';

/** One metadata line: what it is, and its value — the card sets them apart (label left, value right). */
export interface AssetMetadataItem {
  readonly label: string;
  readonly value: string;
}

/**
 * How the asset card has always worded two of its lines: "Size" and "Edited", where Configure
 * and the table say "File size" and "Last edited". A known wording drift — kept exactly as it
 * was, and in one place, until a product decision unifies the copy.
 */
const CARD_LINE_LABELS: Partial<Record<PropertyId, string>> = { size: 'Size', updated: 'Edited' };

/**
 * The asset card's metadata lines, in canonical property order — Size `12 KB`, Created
 * `Yesterday, 09:03 AM`, Edited `35 minutes ago` — one per visible plain-value property the
 * asset has a value for, from the values its adapter (`toAssetEntry`) filled from the vault
 * file's own facts. Dates use the same formatter every collection uses. A fact the platform
 * couldn't report is left out, and so is any line the collection's visible properties hide;
 * empty when there is nothing to show.
 */
export function assetCardMetadata(values: PropertyValues, visible: readonly PropertyId[]): AssetMetadataItem[] {
  return valueProperties(visible).flatMap((id) => {
    const value = formatPropertyValue(id, values);

    return value ? [{ label: CARD_LINE_LABELS[id] ?? propertyLabel(id), value }] : [];
  });
}
