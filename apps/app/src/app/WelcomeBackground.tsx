import { useEffect, useState } from 'react';
import { CoverAttribution } from '@components/cover-attribution/CoverAttribution';
import {
  searchPhotos,
  trackPhotoDownload,
} from '@core/integrations/unsplash/UnsplashApi';
import {
  coverAttributionFor,
  type CoverAttribution as CoverAttributionData,
} from '@core/integrations/unsplash/unsplashAttribution';
import { StartupFrame } from './StartupFrame';
import './WelcomeBackground.css';

/**
 * The Welcome screen's own search terms — soft gradient blobs that sit quietly behind a dialog. A list of its
 * own, not the cover picker's default queries, which change independently. Each has well over
 * `WELCOME_MAX_PAGE` pages of results.
 */
const WELCOME_ART_QUERIES = [
  'gradient blob',
  'abstract gradient',
  'blurred gradient background',
  'fluid gradient',
  'mesh gradient',
  'colorful gradient',
] as const;
const WELCOME_MAX_PAGE = 3;

/**
 * Shown when no photo can be found (the search fails or finds nothing): one fixed Unsplash photo. Its
 * photographer isn't recorded, so its credit is the legacy "by Unsplash" — never an invented name. Still a
 * remote image: with no network at all the frame stays the plain themed surface.
 */
const WELCOME_BACKUP_IMAGE =
  'https://images.unsplash.com/photo-1635776062360-af423602aff3?q=80&w=2832&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D';

interface ShownBackground {
  readonly url: string;
  readonly attribution: CoverAttributionData | null;
}

const BACKUP_BACKGROUND: ShownBackground = {
  url: WELCOME_BACKUP_IMAGE,
  attribution: coverAttributionFor(WELCOME_BACKUP_IMAGE, null),
};

function pickOne<T>(items: readonly T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * The first-run Welcome screen's frame: a random Unsplash artwork (the existing Unsplash search, download
 * tracking and cover credit, unchanged) behind the dialog. Until one has loaded it is the plain themed
 * surface; if none can be found, the fixed backup image.
 */
export function WelcomeBackground() {
  const [shown, setShown] = useState<ShownBackground | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const results = await searchPhotos(
          pickOne(WELCOME_ART_QUERIES)!,
          Math.floor(Math.random() * WELCOME_MAX_PAGE) + 1,
          'landscape'
        );
        const chosen = pickOne(results);
        if (cancelled) return;
        if (!chosen) {
          setShown(BACKUP_BACKGROUND);
          return;
        }
        setShown({
          url: chosen.urls.regular,
          attribution: coverAttributionFor(chosen.urls.regular, {
            name: chosen.user.name,
            url: chosen.user.links.html,
          }),
        });
        // Showing the photo is Unsplash's "download" event; never rejects, so it can't affect the screen.
        void trackPhotoDownload(chosen.links.downloadLocation);
      } catch (error) {
        console.warn(
          'The Welcome background search failed; using the backup image:',
          error instanceof Error ? error.message : error
        );
        if (!cancelled) setShown(BACKUP_BACKGROUND);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <StartupFrame backgroundImage={shown?.url}>{null}</StartupFrame>
      {shown?.attribution && (
        <CoverAttribution
          attribution={shown.attribution}
          className="welcome-background__credit"
        />
      )}
    </>
  );
}
