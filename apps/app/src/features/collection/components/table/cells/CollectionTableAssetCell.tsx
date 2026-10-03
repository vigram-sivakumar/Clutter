import { useState } from 'react';

import { AppIcon } from '@shared/icon';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { VaultResourceKind } from '@core/vault/models/VaultResource';

import { AssetPdfPreview } from '../../asset/card/AssetPdfPreview';
import './CollectionTableCells.css';

export interface CollectionTableAssetCellProps {
  /** What the asset is — decides how the thumbnail is drawn. */
  readonly kind: VaultResourceKind;
  /**
   * The asset's loadable URL (`Application.resolveResourceImageUrl(path)`,
   * injected by the collection body — this cell never resolves anything).
   * Absent, the kind's icon is shown instead of a preview.
   */
  readonly url?: string;
  /** A column hook, e.g. `collection-table-row__preview`. */
  readonly className?: string;
}

/**
 * A small, row-height thumbnail of an asset: the image itself (cropped to a
 * square, like a cover), or a PDF's first page through the same lazy pdf.js
 * rendering the asset card uses (`AssetPdfPreview`). Falls back to the kind's
 * icon when there's no URL or the image fails to load. Purely visual
 * (`aria-hidden`) — the row's header cell carries the accessible name.
 */
export function CollectionTableAssetCell({ kind, url, className }: CollectionTableAssetCellProps) {
  const [failed, setFailed] = useState(false);
  const showsFallback = !url || (kind === 'image' && failed);

  return (
    <div
      className={['collection-table-cell', 'collection-table-cell--asset', className]
        .filter(Boolean)
        .join(' ')}
      data-asset-kind={kind}
    >
      <div className="collection-table-cell__thumbnail" aria-hidden="true">
        {showsFallback ? (
          <AppIcon className="collection-table-cell__thumbnail-icon" icon={getResourceIcon(kind)} />
        ) : kind === 'image' ? (
          <img
            className="collection-table-cell__thumbnail-image"
            src={url}
            alt=""
            draggable={false}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <AssetPdfPreview url={url} className="collection-table-cell__thumbnail-pdf" />
        )}
      </div>
    </div>
  );
}
