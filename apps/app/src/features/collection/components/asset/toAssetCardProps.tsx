import type { PropertyId } from '@core/properties/collectionProperties';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { Asset } from '@core/vault/models/Asset';
import { CardTitleSection } from '@features/collection/components/card/CardTitleSection';
import type { CollectionCardProps } from '@features/collection/components/card/CollectionCard';
import type { CollectionGridColumns } from '@features/collection/components/grid/CollectionGrid';
import type { ReactNode } from 'react';
import { assetCardMetadata } from './assetCardMetadata';
import { toAssetEntry } from './toAssetEntry';
import { AssetPreview } from './AssetPreview';

/** The assets card grid: smaller cards than notes (assets are mostly pictures) — between 140px and 1/6 of the row wide. */
export const ASSET_GRID: CollectionGridColumns = { min: 140, max: 6 };

/** An asset card's fixed shape (width / height): about a square for the media above a one-line title. */
export const ASSET_CARD_ASPECT_RATIO = '4 / 5';

/** What the mapper returns: card props, plus the `data-*` hooks the body's F2-to-rename handler looks up. */
export type AssetCardProps = CollectionCardProps & {
  readonly [attribute: `data-${string}`]: string | undefined;
};

export interface AssetCardOptions {
  /**
   * The asset's loadable URL — a vault file's `Application.resolveResourceImageUrl(path)`
   * (injected by the collection body; nothing is resolved here), a remote asset's own URL.
   */
  readonly url?: string;
  /**
   * The visible properties (from the resolved view). Name decides whether the icon and name are
   * shown (this card is the one layout where it can be hidden); the plain-value properties
   * decide which metadata lines the header shows, and stay when the name is hidden.
   */
  readonly visible: readonly PropertyId[];
  readonly isSelected?: boolean;
  /** Opens the asset — absent while it is being renamed, so a click in the editor never opens it. */
  readonly onClick?: (asset: Asset) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
}

/**
 * An asset as a card: the preview filling the whole card, with the header laid
 * over its bottom edge (`layout="overlay"`) — the name last, under the file's
 * size and dates, one per line, label at the start and value at the end. A
 * vault file's card carries `data-resource-id` for the F2-to-rename handler.
 * The asset-specific part is this mapping; the card, the scrim and the header
 * layout are generic.
 */
export function toAssetCardProps(
  asset: Asset,
  { url, visible, isSelected = false, onClick, titleContent }: AssetCardOptions
): AssetCardProps {
  const showTitle = visible.includes('name');
  // The asset's property values: the vault file's own facts; a remote asset has none.
  const metadata = assetCardMetadata(toAssetEntry(asset).values, visible);

  return {
    layout: 'overlay',
    aspectRatio: ASSET_CARD_ASPECT_RATIO,
    media: <AssetPreview kind={asset.kind} url={url} />,
    header:
      showTitle || metadata.length > 0 ? (
        <CardTitleSection
          icon={showTitle ? getResourceIcon(asset.kind) : undefined}
          title={showTitle ? getResourceDisplayName(asset) : undefined}
          titleContent={showTitle ? titleContent : undefined}
          metadata={metadata}
          metadataLayout="vertical"
          metadataAlign="spread"
          titlePlacement="bottom"
        />
      ) : undefined,
    isSelected,
    onClick: onClick ? () => onClick(asset) : undefined,
    'data-resource-id': asset.source === 'local' ? asset.resource.id : undefined,
  };
}
