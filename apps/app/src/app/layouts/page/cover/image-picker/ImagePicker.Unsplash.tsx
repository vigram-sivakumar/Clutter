import { useEffect, useState } from 'react';
import { listPhotos } from '@core/integrations/unsplash/UnsplashApi';
import type { UnsplashPhoto } from '@core/integrations/unsplash/UnsplashPhoto';
import './ImagePicker.Unsplash.css';

interface ImagePickerUnsplashProps {
  onSelect: (url: string) => void;
}

export function ImagePickerUnsplash({ onSelect }: ImagePickerUnsplashProps) {
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadPhotos = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const results = await listPhotos();

        if (!cancelled) {
          setPhotos(results);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load Unsplash images.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPhotos();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return <div className="image-picker-unsplash__state">Loading images…</div>;
  }

  if (error) {
    return <div className="image-picker-unsplash__state">{error}</div>;
  }

  if (photos.length === 0) {
    return <div className="image-picker-unsplash__state">No images found.</div>;
  }

  return (
    <div className="image-picker-unsplash">
      <div className="image-picker-unsplash__grid">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            className="image-picker-unsplash__item"
            onClick={() => onSelect(photo.urls.regular)}
          >
            <img
              src={photo.urls.small}
              alt=""
              className="image-picker-unsplash__image"
            />

            <span className="image-picker-unsplash__credit">
              {photo.user.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
