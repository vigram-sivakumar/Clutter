import type { VaultResource } from '@core/vault/models/VaultResource';
import { formatFileSize } from '@shared/helpers/fileSize';

import { collectionFieldLabel } from '../../../collectionFieldLabels';
import { formatEntryTimestamp } from '../../../page/toCollectionPageModel';

/** One metadata line: what it is, and its value — the card sets them apart (label left, value right). */
export interface AssetMetadataItem {
  readonly label: string;
  readonly value: string;
}

export interface AssetMetadataVisibility {
  readonly size?: boolean;
  readonly created?: boolean;
  readonly updated?: boolean;
}

/**
 * The asset card's metadata lines, in order — Size `12 KB`, Created
 * `Yesterday, 09:03 AM`, Edited `35 minutes ago` — from the file facts already
 * on the resource (`VaultResource.metadata`, read once by Ingest/Sync; nothing
 * is stat'd here). Dates use the same formatter the notes collections use;
 * Created is the shared label, and the card says Size and Edited where the
 * Configure menu's Properties say "File size" and "Last edited". A part the
 * platform couldn't report is left out, and so is any line the collection's
 * Properties hide (`visibility`); empty when there is nothing to show.
 */
export function assetCardMetadata(
  resource: VaultResource,
  { size = true, created: showCreated = true, updated: showUpdated = true }: AssetMetadataVisibility = {}
): AssetMetadataItem[] {
  const { metadata } = resource;

  if (!metadata) {
    return [];
  }

  const created = formatEntryTimestamp(metadata.createdAt);
  const modified = formatEntryTimestamp(metadata.modifiedAt);
  const fileSize = formatFileSize(metadata.size);
  const items: AssetMetadataItem[] = [];

  if (size && fileSize) {
    items.push({ label: 'Size', value: fileSize });
  }
  if (showCreated && created) {
    items.push({ label: collectionFieldLabel('created'), value: created });
  }
  if (showUpdated && modified) {
    items.push({ label: 'Edited', value: modified });
  }

  return items;
}
