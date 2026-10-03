import type { AssetKind } from '@core/vault/models/Asset';

import { AssetPdfPreview } from './AssetPdfPreview';

export interface AssetMediaProps {
  readonly kind: AssetKind;
  /** The asset's loadable URL (injected by the collection body; nothing is resolved here). */
  readonly url: string;
}

/**
 * An asset's media region: the image (filling the area and cropping, as a
 * cover) or a PDF's first page. Asset-specific; the card geometry around it
 * (shape, surface) comes from the shared card
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
