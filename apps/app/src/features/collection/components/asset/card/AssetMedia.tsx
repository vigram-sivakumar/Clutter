import type { VaultResource } from '@core/vault/models/VaultResource';

import { AssetPdfPreview } from './AssetPdfPreview';

export interface AssetMediaProps {
  readonly kind: VaultResource['kind'];
  /** The resource's loadable URL (injected by the collection body; nothing is resolved here). */
  readonly url: string;
}

/**
 * An asset's media region: the image (filling the area and cropping, as a
 * cover) or a PDF's first page. Asset-specific; the card geometry around it
 * (padding, gap, the 4px inset under the title icon) comes from the shared card
 * system and AssetCard.css.
 */
export function AssetMedia({ kind, url }: AssetMediaProps) {
  return (
    <div className="asset-card__media" aria-hidden="true">
      {kind === 'image' ? (
        <img
          className="asset-card__image"
          src={url}
          alt=""
          draggable={false}
          loading="lazy"
        />
      ) : (
        <AssetPdfPreview url={url} />
      )}
    </div>
  );
}
