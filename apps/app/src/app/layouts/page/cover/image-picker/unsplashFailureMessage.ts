import { UnsplashRequestError } from '@core/integrations/unsplash/UnsplashRequestError';

/** Where the failure happened: what the user was doing decides what a "not found" or a "not configured" means to them. */
export type UnsplashFailureContext = 'search' | 'link';

/**
 * The words for a failed Unsplash request, shared by the search picker and the pasted-link picker so the two never
 * word one failure differently. Chosen by the error's `kind`, never by its message text; an error that is not an
 * `UnsplashRequestError` gets the neutral failure. Copy follows docs/writing-principles.md (name what failed, say what
 * to do, no blame, no ending period).
 *
 * The raw error is never returned. What a developer needs (the kind and the HTTP status) goes to the console;
 * nothing else does: not the address, the search words or the photo, which can carry what the user typed.
 */
export function unsplashFailureMessage(error: unknown, context: UnsplashFailureContext): string {
  const kind = error instanceof UnsplashRequestError ? error.kind : 'failed';

  console.warn('Unsplash request failed.', { kind, status: error instanceof UnsplashRequestError ? error.status : undefined });

  switch (kind) {
    case 'rate-limited':
      return 'Unsplash request limit reached. Wait a few minutes, then try again';
    case 'unreachable':
      return 'Unsplash is temporarily unreachable. Check your connection and try again';
    case 'unavailable':
      return 'Unsplash is temporarily unavailable. Try again in a few minutes';
    case 'not-configured':
      return context === 'link'
        ? 'Unsplash links can’t be added right now. Use an image address instead'
        : 'Unsplash isn’t available right now';
    case 'not-found':
      return context === 'link'
        ? 'Couldn’t find this photo on Unsplash. Check the link and try again'
        : 'Couldn’t load Unsplash images. Try again';
    default:
      return context === 'link' ? 'Couldn’t add this photo from Unsplash. Try again' : 'Couldn’t load Unsplash images. Try again';
  }
}
