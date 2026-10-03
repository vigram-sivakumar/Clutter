import type { ReactNode } from 'react';

import { CollectionEntry } from '@features/collection/CollectionEntry';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { CollectionCard } from '../../card/CollectionCard';
import { AssetPdfPreview } from './AssetPdfPreview';
import './AssetCard.css';

export interface AssetCardProps {
  readonly resource: VaultResource;
  /**
   * The resource's loadable URL (`Application.resolveResourceImageUrl(path)` —
   * the existing resolver, injected by the collection body; this card never
   * resolves anything itself). An image is shown with it; a PDF is rendered
   * from it.
   */
  readonly url: string;
  readonly isSelected?: boolean;
  /** Opens the asset — the same handler the list row gets (`onOpenResource`): the caller routes by kind (image overlay / PDF viewer). */
  readonly onClick?: (resource: VaultResource) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
}

/**
 * One asset (image or PDF) as a card. Dedicated to assets: it shares only the
 * generic card shell (`CollectionCard`) and the stacked header
 * (`CollectionEntry`) with note cards — no markdown preview, no cover, no
 * note props — and owns what is asset-specific: the preview (the image, fitted
 * as a cover — filling the area and cropping, not fitted — or a PDF's first
 * page) and the name. The
 * header — just the icon and name, since the preview already shows what kind
 * it is — sits below the asset. Click opens the asset; the title becomes an inline rename editor on
 * request (`titleContent`). No actions menu — the asset's actions live in its
 * viewer.
 */
export function AssetCard({ resource, url, isSelected = false, onClick, titleContent }: AssetCardProps) {
  return (
    <CollectionCard
      data-resource-id={resource.id}
      className="asset-card"
      isSelected={isSelected}
      onClick={onClick ? () => onClick(resource) : undefined}
    >
      <div className="asset-card__preview" aria-hidden="true">
        {resource.kind === 'image' ? (
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

      <CollectionEntry
        stacked
        className="asset-card__header"
        icon={getResourceIcon(resource.kind)}
        title={getResourceDisplayName(resource)}
        titleContent={titleContent}
      />
    </CollectionCard>
  );
}
