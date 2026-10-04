import { createContext, useContext } from 'react';

/**
 * What an image shown in a page can do with the file itself — a cover image's menu and an image
 * embedded in the editor both use these — supplied by whoever owns those flows (AppLayout: the Save
 * to vault dialog and the OS save dialog). `reference` is an http(s) URL, or a vault-relative path
 * for an image that already lives in the vault.
 */
export interface ImageFileActions {
  /** Copies a remote image into the vault and points everything that used the URL at the copy. */
  readonly saveToVault: (url: string) => void;
  /** Saves the image file anywhere the user picks. */
  readonly download: (reference: string) => void;
}

const ImageFileActionsContext = createContext<ImageFileActions | null>(null);

export const ImageFileActionsProvider = ImageFileActionsContext.Provider;

/** `null` where nothing provides them (e.g. a test or a standalone render): no menu items then. */
export function useImageFileActions(): ImageFileActions | null {
  return useContext(ImageFileActionsContext);
}

export function isRemoteImageReference(reference: string): boolean {
  return reference.startsWith('http://') || reference.startsWith('https://');
}
