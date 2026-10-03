import { CollectionCard } from '../../card/CollectionCard';
import { CardTitleSection } from '../../card/CardTitleSection';
import './AssetUploadCard.css';

export interface AssetUploadCardProps {
  /** Starts an upload — the collection's standard Add action. */
  readonly onClick: () => void;
}

/**
 * The Assets Card view's trailing "Upload" card: a card like the rest (same
 * shell and fixed shape) with no media, just the centered upload action — the
 * assets counterpart of the Notes view's "New Note" card. It owns no upload
 * logic: the collection hands it the same handler its header's Add action uses.
 */
export function AssetUploadCard({ onClick }: AssetUploadCardProps) {
  return (
    <CollectionCard className="asset-upload-card" onClick={onClick}>
      <CardTitleSection icon="uploadImage" title="Upload" />
    </CollectionCard>
  );
}
