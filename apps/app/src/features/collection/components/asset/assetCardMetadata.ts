import type { VaultResource } from '@core/vault/models/VaultResource';
import { formatFileSize } from '@shared/helpers/fileSize';

import { collectionFieldLabel } from '../../collectionFieldLabels';
import { formatEntryTimestamp } from '../../properties/formatProperty';

/** One metadata line: what it is, and its value — the card sets them apart (label left, value right). */
export interface AssetMetadataItem {
  readonly label: string;
  readonly value: string;
}

/**
 * A vault file's facts as people read them — size `12 KB`, created and
 * modified `Yesterday, 09:03 AM` / `35 minutes ago` — with the raw ISO instants
 * the dates came from. Each is absent when the platform couldn't report it
 * (or there is no file at all). The one place these are formatted: the card,
 * the list and the table all read them from here.
 */
export interface AssetFileFacts {
  readonly size?: string;
  readonly created?: string;
  readonly createdAt?: string;
  readonly modified?: string;
  readonly modifiedAt?: string;
}

export function assetFileFacts(resource: VaultResource): AssetFileFacts {
  const { metadata } = resource;

  if (!metadata) {
    return {};
  }

  return {
    size: formatFileSize(metadata.size) || undefined,
    created: formatEntryTimestamp(metadata.createdAt) || undefined,
    createdAt: metadata.createdAt ?? undefined,
    modified: formatEntryTimestamp(metadata.modifiedAt) || undefined,
    modifiedAt: metadata.modifiedAt ?? undefined,
  };
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
  const { size: fileSize, created, modified } = assetFileFacts(resource);
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
