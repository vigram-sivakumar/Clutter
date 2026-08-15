import { useEffect, useState, type MouseEvent } from 'react';
import { Input } from '@components/input/Input';
import {
  searchPhotos,
  trackPhotoDownload,
} from '@core/integrations/unsplash/UnsplashApi';
import type { UnsplashPhoto } from '@core/integrations/unsplash/UnsplashPhoto';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import './ImagePicker.Unsplash.css';

interface ImagePickerUnsplashProps {
  onSelect: (url: string) => void;
}

const SEARCH_DEBOUNCE_MS = 300;
const UNSPLASH_ATTRIBUTION_URL =
  'https://unsplash.com?utm_source=clutter&utm_medium=referral';

function photographerProfileUrl(profileUrl: string): string {
  const url = new URL(profileUrl);

  url.searchParams.set('utm_source', 'clutter');
  url.searchParams.set('utm_medium', 'referral');

  return url.toString();
}

function unsplashErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load Unsplash images.';
}

export function ImagePickerUnsplash({ onSelect }: ImagePickerUnsplashProps) {
  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const trimmedQuery = query.trim();
    const delay = trimmedQuery ? SEARCH_DEBOUNCE_MS : 0;

    const loadPhotos = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const results = await searchPhotos(query);

        if (!cancelled) {
          setPhotos(results);
        }
      } catch (loadError) {
        if (!cancelled) {
          setPhotos([]);
          setError(unsplashErrorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    const timer = window.setTimeout(() => {
      void loadPhotos();
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const handleSelect = (photo: UnsplashPhoto) => {
    void trackPhotoDownload(photo.links.downloadLocation);
    onSelect(photo.urls.regular);
  };

  const handleOpenExternal = (
    event: MouseEvent<HTMLAnchorElement>,
    url: string
  ) => {
    event.preventDefault();
    event.stopPropagation();
    void openExternalUrl(url);
  };

  return (
    <div className="image-picker-unsplash">
      <div className="image-picker-unsplash__input">
        <Input
          type="search"
          placeholder="Search Unsplash"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {isLoading && (
        <div className="image-picker-unsplash__state">Loading images…</div>
      )}

      {!isLoading && error && (
        <div className="image-picker-unsplash__state">{error}</div>
      )}

      {!isLoading && !error && photos.length === 0 && (
        <div className="image-picker-unsplash__state">No images found.</div>
      )}

      {!isLoading && !error && photos.length > 0 && (
        <>
          <div className="image-picker-unsplash__grid">
            {photos.map((photo) => (
              <div key={photo.id} className="image-picker-unsplash__card">
                <button
                  type="button"
                  className="image-picker-unsplash__item"
                  onClick={() => handleSelect(photo)}
                >
                  <img
                    src={photo.urls.small}
                    alt=""
                    className="image-picker-unsplash__image"
                  />
                </button>
                <span className="image-picker-unsplash__credit">
                  by{' '}
                  <a
                    href={photographerProfileUrl(photo.user.links.html)}
                    onClick={(event) =>
                      handleOpenExternal(
                        event,
                        photographerProfileUrl(photo.user.links.html)
                      )
                    }
                  >
                    {photo.user.name}
                  </a>
                </span>
              </div>
            ))}
          </div>
          <p className="image-picker-unsplash__attribution">
            Photos from{' '}
            <a
              href={UNSPLASH_ATTRIBUTION_URL}
              onClick={(event) =>
                handleOpenExternal(event, UNSPLASH_ATTRIBUTION_URL)
              }
            >
              Unsplash
            </a>
          </p>
        </>
      )}
    </div>
  );
}
