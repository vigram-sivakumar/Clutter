import type { VaultResource } from '@core/vault/models/VaultResource';
import { formatFileSize } from '@shared/helpers/fileSize';

import { collectionFieldLabel } from '../../../collectionFieldLabels';
import { formatEntryTimestamp } from '../../../page/toCollectionPageModel';

/**
 * The asset card's one metadata line — `12 KB · Created Yesterday, 09:03 AM ·
 * Last edited 35 minutes ago` — from the file facts already on the resource
 * (`VaultResource.metadata`, read once by Ingest/Sync; nothing is stat'd
 * here). Dates use the same formatter and the same Created / Last edited
 * labels the notes collections use. A part the platform couldn't report is
 * left out; `undefined` when there is nothing to show.
 */
export function assetCardMetadata(resource: VaultResource): string | undefined {
  const { metadata } = resource;

  if (!metadata) {
    return undefined;
  }

  const created = formatEntryTimestamp(metadata.createdAt);
  const modified = formatEntryTimestamp(metadata.modifiedAt);
  const parts = [
    formatFileSize(metadata.size),
    created && `${collectionFieldLabel('created')} ${created}`,
    modified && `${collectionFieldLabel('updated')} ${modified}`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : undefined;
}
