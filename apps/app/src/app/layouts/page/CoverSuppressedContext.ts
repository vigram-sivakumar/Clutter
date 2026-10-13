import { createContext, useContext } from 'react';

/**
 * Whether the app layout currently wants the cover image out of the way (window too narrow, or the
 * sidebar is open in a narrow window). Display-only: Page ORs it into PageCover's `hidden`, and it is
 * never written to a note's `coverHidden`. Provided once by AppLayout; defaults to "not suppressed".
 */
export const CoverSuppressedContext = createContext(false);

export function useCoverSuppressed(): boolean {
  return useContext(CoverSuppressedContext);
}
