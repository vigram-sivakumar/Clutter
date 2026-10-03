import type { VaultResource } from '@core/vault/models/VaultResource';
import { formatFileSize } from '@shared/helpers/fileSize';

import { collectionFieldLabel } from '../../../collectionFieldLabels';
import { formatEntryTimestamp } from '../../../page/toCollectionPageModel';

/**
 * The asset card's metadata items, one per line — `12 KB`, `Created Yesterday,
 * 09:03 AM`, `Edited 35 minutes ago` — from the file facts already on the resource
 * (`VaultResource.metadata`, read once by Ingest/Sync; nothing is stat'd
 * here). Dates use the same formatter the notes collections use, labelled Created
 * and the card's shorter Edited (the Configure menu's Property keeps its
 * "Last edited" label). A part the platform couldn't report is
 * left out, and so is any item the collection's Properties hide (`visibility`); empty when there is nothing to show.
 */
export interface AssetMetadataVisibility {
  readonly size?: boolean;
  readonly created?: boolean;
  readonly updated?: boolean;
}

export function assetCardMetadata(
  resource: VaultResource,
  { size = true, created: showCreated = true, updated: showUpdated = true }: AssetMetadataVisibility = {}
): string[] {
  const { metadata } = resource;

  if (!metadata) {
    return [];
  }

  const created = formatEntryTimestamp(metadata.createdAt);
  const modified = formatEntryTimestamp(metadata.modifiedAt);
  return [
    size && formatFileSize(metadata.size),
    showCreated && created && `${collectionFieldLabel('created')} ${created}`,
    showUpdated && modified && `Edited ${modified}`,
  ].filter((item): item is string => Boolean(item));
}
