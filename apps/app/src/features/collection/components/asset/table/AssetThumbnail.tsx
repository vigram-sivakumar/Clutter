import { useState } from 'react';

import { AppIcon } from '@shared/icon';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { VaultResourceKind } from '@core/vault/models/VaultResource';

import { AssetPdfPreview } from '../card/AssetPdfPreview';
import './AssetThumbnail.css';

export interface AssetThumbnailProps {
  readonly kind: VaultResourceKind;
  /**
   * The asset's loadable URL (`Application.resolveResourceImageUrl(path)`,
   * injected by the collection body — this component never resolves
   * anything). Absent, the kind's icon is shown instead of a preview.
   */
  readonly url?: string;
}

/**
 * What goes inside the generic table's media cell for an asset: the image
 * itself (cropped to fill, like a cover), or a PDF's first page through the
 * same lazy pdf.js rendering the asset card uses (`AssetPdfPreview`). Falls
 * back to the kind's icon when there is no URL or an image fails to load —
 * the asset knowledge (kinds, URLs, fallbacks) stays here, in the asset
 * layer; the cell around it stays generic.
 */
export function AssetThumbnail({ kind, url }: AssetThumbnailProps) {
  const [failed, setFailed] = useState(false);

  if (!url || (kind === 'image' && failed)) {
    return <AppIcon className="asset-thumbnail__icon" icon={getResourceIcon(kind)} />;
  }

  if (kind === 'image') {
    return (
      <img
        className="asset-thumbnail__image"
        src={url}
        alt=""
        draggable={false}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return <AssetPdfPreview url={url} className="asset-thumbnail__pdf" />;
}
