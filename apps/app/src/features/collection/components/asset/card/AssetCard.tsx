import type { ReactNode } from 'react';

import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { Asset } from '@core/vault/models/Asset';

import { CollectionCard } from '../../card/CollectionCard';
import { CardTitleSection } from '../../card/CardTitleSection';
import { assetCardMetadata, type AssetMetadataVisibility } from './assetCardMetadata';
import { AssetMedia } from './AssetMedia';
import './AssetCard.css';

export interface AssetCardProps {
  readonly asset: Asset;
  /**
   * The asset's loadable URL — a vault file's `Application.resolveResourceImageUrl(path)`
   * (the existing resolver, injected by the collection body; this card never
   * resolves anything itself), a remote asset's own URL. An image is shown
   * with it; a PDF is rendered from it.
   */
  readonly url: string;
  /** The Title property: whether the icon and name are shown. The metadata lines are their own properties and stay when it is off. */
  readonly showTitle?: boolean;
  /** The File size / Created / Last edited properties (the card's lines read Size, Created, Edited): which metadata lines the title section shows (all, by default). */
  readonly metadataVisibility?: AssetMetadataVisibility;
  readonly isSelected?: boolean;
  /** Opens the asset — the same handler the list row gets (`onOpenAsset`): the caller routes by kind (image overlay / PDF viewer). */
  readonly onClick?: (asset: Asset) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
}

/**
 * One asset (image or PDF) as a card: the shared card shell and title section
 * (the Notes Card's geometry and typography — nothing asset-specific restyles
 * them), with the asset-specific media filling the whole card and the title
 * section laid over its bottom edge on a gradient (AssetCard.css) so the text
 * stays readable. Its last line is the icon and name; above it, when the
 * vault knows them, the file's size and dates, one per line
 * (`assetCardMetadata`) — never a kind label, since the media already shows
 * what kind it is. Click opens the asset;
 * the title becomes an inline rename editor on request (`titleContent`). No
 * actions menu — the asset's actions live in its viewer. The title section can
 * be hidden (`showTitle`) — only the icon and name go; any metadata lines the
 * Properties leave on stay, and with none the media fills the whole card bare.
 */
export function AssetCard({ asset, url, showTitle = true, metadataVisibility, isSelected = false, onClick, titleContent }: AssetCardProps) {
  // File facts come from the vault file's own metadata; a remote asset has none.
  const metadata = asset.source === 'local' ? assetCardMetadata(asset.resource, metadataVisibility) : [];

  return (
    <CollectionCard
      data-resource-id={asset.source === 'local' ? asset.resource.id : undefined}
      className="asset-card"
      flush
      isSelected={isSelected}
      onClick={onClick ? () => onClick(asset) : undefined}
    >
      <AssetMedia kind={asset.kind} url={url} />

      {(showTitle || metadata.length > 0) && (
        <CardTitleSection
          className="asset-card__header"
          icon={showTitle ? getResourceIcon(asset.kind) : undefined}
          title={showTitle ? getResourceDisplayName(asset) : undefined}
          titleContent={showTitle ? titleContent : undefined}
          metadata={
            metadata.length > 0 &&
            metadata.map(({ label, value }) => (
              <span key={label} className="asset-card__meta">
                <span className="asset-card__meta-label">{label}</span>
                <span className="asset-card__meta-value">{value}</span>
              </span>
            ))
          }
          metadataLayout="vertical"
        />
      )}
    </CollectionCard>
  );
}
