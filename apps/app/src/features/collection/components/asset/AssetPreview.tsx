import { AppIcon } from '@shared/icon';
import { CollectionImage } from '@features/collection/components/media/CollectionImage';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { VaultResourceKind } from '@core/vault/models/VaultResource';
import { AssetPdfPreview } from './AssetPdfPreview';

export interface AssetPreviewProps {
  readonly kind: VaultResourceKind;
  /**
   * The asset's loadable URL (`Application.resolveResourceImageUrl(path)`,
   * injected by the collection body — nothing is resolved here). Absent, the
   * kind's icon is shown instead of a preview.
   */
  readonly url?: string;
}

/**
 * What an asset shows in any collection frame (a card, a list thumbnail, a
 * table thumbnail): the image itself, cropped to fill like a cover
 * (`CollectionImage`), or a PDF's first page through the same lazy pdf.js
 * rendering (`AssetPdfPreview`). Falls back to the kind's icon when there is no
 * URL or an image fails to load. The asset knowledge (kinds, URLs, fallbacks)
 * stays here; the frame around it stays generic.
 */
export function AssetPreview({ kind, url }: AssetPreviewProps) {
  const icon = <AppIcon icon={getResourceIcon(kind)} />;

  if (!url) {
    return icon;
  }
  if (kind === 'image') {
    return <CollectionImage src={url} fallback={icon} />;
  }
  return <AssetPdfPreview url={url} />;
}
