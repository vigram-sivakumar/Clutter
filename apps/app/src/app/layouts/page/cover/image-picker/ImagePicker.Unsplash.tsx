import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { CoverCredit } from '@core/vault/models/PageMetadata';
import { Input } from '@components/input/Input';
import {
  searchPhotos,
  trackPhotoDownload,
  UNSPLASH_SHUFFLE_MAX_PAGE,
  type UnsplashOrientation,
} from '@core/integrations/unsplash/UnsplashApi';
import {
  loadEditorialPhotos,
  readEditorialCache,
  refreshEditorialPhotos,
} from '@core/integrations/unsplash/editorialCache';
import type { UnsplashPhoto } from '@core/integrations/unsplash/UnsplashPhoto';
import { unsplashCoverUrl } from '@core/integrations/unsplash/unsplashAttribution';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import { AppIcon } from '@shared/icon';
import { unsplashFailureMessage } from './unsplashFailureMessage';
import './ImagePicker.Unsplash.css';

interface ImagePickerUnsplashProps {
  onSelect: (url: string, credit: CoverCredit) => void;
  /** The photo shape to search for (the cover's layout decides it). Defaults to portrait. */
  orientation?: UnsplashOrientation;
}

const SEARCH_DEBOUNCE_MS = 300;

/** A random page, 1 to UNSPLASH_SHUFFLE_MAX_PAGE: what the Editorial feed opens on, and what Shuffle picks. */
const randomPage = () => Math.floor(Math.random() * UNSPLASH_SHUFFLE_MAX_PAGE) + 1;
const UNSPLASH_ATTRIBUTION_URL =
  'https://unsplash.com?utm_source=clutter&utm_medium=referral';

function photographerProfileUrl(profileUrl: string): string {
  const url = new URL(profileUrl);

  url.searchParams.set('utm_source', 'clutter');
  url.searchParams.set('utm_medium', 'referral');

  return url.toString();
}

export function ImagePickerUnsplash({ onSelect, orientation }: ImagePickerUnsplashProps) {
  const [query, setQuery] = useState('');
  const [shuffleKey, setShuffleKey] = useState(0);
  const [searchPage, setSearchPage] = useState(randomPage);
  // Opens straight onto the saved Editorial photos when there are some; nothing is requested for them.
  const [initialPhotos] = useState(readEditorialCache);
  const [photos, setPhotos] = useState<UnsplashPhoto[]>(initialPhotos ?? []);
  const [isLoading, setIsLoading] = useState(initialPhotos === null);
  const [error, setError] = useState<string | null>(null);

  // A search starts at its first page; with no search text the Editorial feed opens on a random page.
  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSearchPage(value.trim() ? 1 : randomPage());
  };

  // Set by Shuffle on the Editorial feed: the one thing that fetches it again. Cleared once that fetch has settled.
  const refreshEditorial = useRef(false);

  // The Editorial feed ignores the cover's shape, so a shape change only reloads a search.
  const searchOrientation = query.trim() ? orientation : undefined;

  useEffect(() => {
    let cancelled = false;
    const trimmedQuery = query.trim();
    const delay = trimmedQuery ? SEARCH_DEBOUNCE_MS : 0;

    const loadPhotos = async () => {
      const refreshing = !trimmedQuery && refreshEditorial.current;
      const cached = trimmedQuery || refreshing ? null : readEditorialCache();

      if (cached) {
        // No search text and photos already saved: show them, with no request.
        setPhotos(cached);
        setError(null);
        setIsLoading(false);

        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // No search text: Unsplash's Editorial feed (it has no orientation filter, so none is sent).
        const results = trimmedQuery
          ? await searchPhotos(query, searchPage, searchOrientation)
          : refreshing
            ? await refreshEditorialPhotos(searchPage)
            : await loadEditorialPhotos(searchPage);

        if (!cancelled) {
          setPhotos(results);
        }
      } catch (loadError) {
        if (!cancelled) {
          setPhotos([]);
          setError(unsplashFailureMessage(loadError, 'search'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);

          if (refreshing) {
            refreshEditorial.current = false;
          }
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
  }, [query, shuffleKey, searchPage, searchOrientation]);

  const handleShuffle = () => {
    refreshEditorial.current = query.trim() === '';
    setSearchPage(randomPage());
    setShuffleKey((key) => key + 1);
  };

  const handleSelect = (photo: UnsplashPhoto) => {
    onSelect(unsplashCoverUrl(photo.urls.regular), {
      name: photo.user.name,
      url: photo.user.links.html,
      downloadLocation: photo.links.downloadLocation,
    });
    // Committing a photo as the cover is Unsplash's "download" event. Runs
    // after the selection and never rejects, so it can't delay or undo it.
    void trackPhotoDownload(photo.links.downloadLocation);
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
          onChange={(event) => handleQueryChange(event.target.value)}
        />
      </div>

      {isLoading && (
        <div className="image-picker-unsplash__state">Loading images…</div>
      )}

      {!isLoading && error && (
        <div className="image-picker-unsplash__state">{error}</div>
      )}

      {!isLoading && !error && photos.length === 0 && (
        <div className="image-picker-unsplash__state">No images found</div>
      )}

      {!isLoading && !error && photos.length > 0 && (
        <>
          <div className="image-picker-unsplash__grid">
            <div className="image-picker-unsplash__card">
              <button
                type="button"
                className="image-picker-unsplash__item image-picker-unsplash__item--shuffle"
                onClick={handleShuffle}
                aria-label="Shuffle"
              >
                <AppIcon icon="shuffle" />
                <span className="image-picker-unsplash__credit">Shuffle</span>
              </button>
            </div>
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
                    title={photo.user.name}
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
