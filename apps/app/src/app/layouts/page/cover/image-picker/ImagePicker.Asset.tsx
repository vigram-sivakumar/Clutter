import { useCoverPickerAssets } from './CoverAssetsContext';
import './ImagePicker.Asset.css';

interface ImagePickerAssetProps {
  onSelect: (cover: string) => void;
}

export function ImagePickerAsset({ onSelect }: ImagePickerAssetProps) {
  const assets = useCoverPickerAssets();

  if (assets.length === 0) {
    return (
      <div className="image-picker-asset__state">No images in your assets.</div>
    );
  }

  return (
    <div className="image-picker-asset__grid">
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          className="image-picker-asset__item"
          aria-label={asset.name}
          onClick={() => onSelect(asset.cover)}
        >
          <img src={asset.previewUrl} alt="" className="image-picker-asset__image" />
        </button>
      ))}
    </div>
  );
}
