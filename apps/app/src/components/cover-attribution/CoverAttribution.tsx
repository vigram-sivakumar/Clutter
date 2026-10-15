import type { KeyboardEvent, MouseEvent } from 'react';
import {
  UNSPLASH_HOME_URL,
  type CoverAttribution as CoverAttributionData,
} from '@core/integrations/unsplash/unsplashAttribution';
import { AppIcon } from '@shared/icon';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import './CoverAttribution.css';

export interface CoverAttributionProps {
  readonly attribution: CoverAttributionData;
  readonly className?: string;
}

/** What a credit says in words — also the text of a thumbnail's tooltip, where there is no room for the line. */
export function coverAttributionLabel(attribution: CoverAttributionData): string {
  return attribution.kind === 'credit'
    ? `Photo by ${attribution.name} on Unsplash`
    : 'Photo on Unsplash';
}

function keepKeyboardLocal(event: KeyboardEvent<HTMLAnchorElement>): void {
  // A card's own Enter/Space activation must not fire for a keypress on the credit's link.
  event.stopPropagation();
}

function openLink(event: MouseEvent<HTMLAnchorElement>, url: string): void {
  // The credit sits on clickable surfaces (a cover, a card): following the link
  // must not also trigger them.
  event.preventDefault();
  event.stopPropagation();
  void openExternalUrl(url);
}

/**
 * The Unsplash credit for a cover, as one restrained line:
 * "Photo by [Photographer] on Unsplash" — the name linking to the photographer's
 * profile, "Unsplash" to unsplash.com, both carrying the referral parameters
 * (`unsplashAttribution.ts`). A long name is truncated, never the surrounding
 * words or the links; the full name is the link's tooltip and accessible name.
 * A cover saved before credits were recorded has no photographer to name, so it
 * reads "Photo on Unsplash" (ADR-054).
 */
// The spaces live in the text itself (not only in the CSS gap) so copying the line, and
// assistive tech, read it as a sentence; the flex layout collapses them visually.
export function CoverAttribution({ attribution, className }: CoverAttributionProps) {
  return (
    <p className={['cover-attribution', className].filter(Boolean).join(' ')}>
      {attribution.kind === 'credit' ? (
        <>
          {/* The signature icon stands for "Photo by"; the words stay for assistive tech and copy-paste. */}
          <AppIcon icon="signature" className="cover-attribution__icon" aria-hidden="true" />
          <span className="cover-attribution__sr-only">Photo by </span>
          <a
            className="cover-attribution__name"
            href={attribution.profileUrl}
            title={attribution.name}
            aria-label={`${attribution.name} on Unsplash`}
            onClick={(event) => openLink(event, attribution.profileUrl)}
            onKeyDown={keepKeyboardLocal}
          >
            {attribution.name}
          </a>
        </>
      ) : (
        <span className="cover-attribution__text">Photo</span>
      )}
      <span className="cover-attribution__text"> on </span>
      <a
        className="cover-attribution__unsplash"
        href={UNSPLASH_HOME_URL}
        onClick={(event) => openLink(event, UNSPLASH_HOME_URL)}
        onKeyDown={keepKeyboardLocal}
      >
        Unsplash
      </a>
    </p>
  );
}
