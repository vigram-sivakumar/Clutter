import type { ReactNode } from 'react';

import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { CollectionCard } from '../../card/CollectionCard';
import { CardTitleSection } from '../../card/CardTitleSection';
import { assetCardMetadata, type AssetMetadataVisibility } from './assetCardMetadata';
import { AssetMedia } from './AssetMedia';
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
  /** The Title property: whether the title section (icon and name) is shown. */
  readonly showTitle?: boolean;
  /** The File size / Created / Last edited properties (the card's lines read size, Created, Edited): which metadata lines the title section shows (all, by default). */
  readonly metadataVisibility?: AssetMetadataVisibility;
  readonly isSelected?: boolean;
  /** Opens the asset — the same handler the list row gets (`onOpenResource`): the caller routes by kind (image overlay / PDF viewer). */
  readonly onClick?: (resource: VaultResource) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
}

/**
 * One asset (image or PDF) as a card: the shared card shell and title section
 * (the Notes Card's geometry and typography — nothing asset-specific restyles
 * them), with the asset-specific media above and the title section at the
 * bottom. The title section is the icon and name,
 * then the file's size and dates, one per line (`assetCardMetadata`), when the
 * vault knows them — never a kind label, since the media already shows what
 * kind it is. Click opens the asset;
 * the title becomes an inline rename editor on request (`titleContent`). No
 * actions menu — the asset's actions live in its viewer. The title section can
 * be hidden (`showTitle`), leaving the media to fill the whole card.
 */
export function AssetCard({ resource, url, showTitle = true, metadataVisibility, isSelected = false, onClick, titleContent }: AssetCardProps) {
  const metadata = assetCardMetadata(resource, metadataVisibility);

  return (
    <CollectionCard
      data-resource-id={resource.id}
      className="asset-card"
      flush
      isSelected={isSelected}
      onClick={onClick ? () => onClick(resource) : undefined}
    >
      <AssetMedia kind={resource.kind} url={url} />

      {showTitle && (
        <CardTitleSection
          className="asset-card__header"
          icon={getResourceIcon(resource.kind)}
          title={getResourceDisplayName(resource)}
          titleContent={titleContent}
          metadata={metadata.length > 0 && metadata.map((item) => <span key={item}>{item}</span>)}
          metadataLayout="vertical"
        />
      )}
    </CollectionCard>
  );
}
