import { createContext, useContext } from 'react';

/**
 * What a page's cover image can do with the file itself, supplied by whoever owns those flows
 * (AppLayout: the Save to vault dialog and the OS save dialog). `reference` is the raw persisted
 * cover — an http(s) URL, or a vault-relative path for an image that already lives in the vault.
 */
export interface CoverImageActions {
  /** Copies a remote image into the vault and points everything that used the URL at the copy. */
  readonly saveToVault: (url: string) => void;
  /** Saves the image file anywhere the user picks. */
  readonly download: (reference: string) => void;
}

const CoverImageActionsContext = createContext<CoverImageActions | null>(null);

export const CoverImageActionsProvider = CoverImageActionsContext.Provider;

/** `null` where nothing provides them (e.g. a test or a standalone render): no menu items then. */
export function useCoverImageActions(): CoverImageActions | null {
  return useContext(CoverImageActionsContext);
}

export function isRemoteCoverReference(reference: string): boolean {
  return reference.startsWith('http://') || reference.startsWith('https://');
}
