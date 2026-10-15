import { coverAttributionLabel } from '@components/cover-attribution/CoverAttribution';
import { coverAttributionFor } from '@core/integrations/unsplash/unsplashAttribution';
import type { CollectionEntryModel } from '../../page/CollectionEntryModel';

/** "Photo by … on Unsplash" for an entry whose cover is an Unsplash photo, else undefined (ADR-054). */
export function noteCoverAttributionLabel(entry: CollectionEntryModel): string | undefined {
  const attribution = coverAttributionFor(entry.values.cover, entry.coverCredit);

  return attribution ? coverAttributionLabel(attribution) : undefined;
}
