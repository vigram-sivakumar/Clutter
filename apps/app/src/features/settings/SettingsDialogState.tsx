import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS_PAGE, type SettingsPageId } from './settings-sidebar/SettingsSidebar';

/**
 * Whether the Settings dialog is open, and which page it shows. Held above the per-Space layout (which is remounted
 * on every Space switch) so switching Space from inside Settings leaves the dialog open on the same page; the
 * dialog's content then re-reads the new Space's settings.
 */
export interface SettingsDialogState {
  readonly open: boolean;
  setOpen(open: boolean): void;
  readonly pageId: SettingsPageId;
  setPageId(pageId: SettingsPageId): void;
  /**
   * Moves the selection from `from` to `to` — only if `from` is what is selected AT THE MOMENT it runs. Callers that
   * outlive a render (a rename's handlers, called long after the render that created them) must use this rather than
   * read `pageId` and decide: what they read is the page from when they were made, not the page now.
   */
  replacePageId(from: SettingsPageId, to: SettingsPageId): void;
}

const SettingsDialogStateContext = createContext<SettingsDialogState | null>(null);

export function SettingsDialogStateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pageId, setPageId] = useState<SettingsPageId>(DEFAULT_SETTINGS_PAGE);
  const replacePageId = useCallback(
    (from: SettingsPageId, to: SettingsPageId) => setPageId((current) => (current === from ? to : current)),
    []
  );
  const value = useMemo(() => ({ open, setOpen, pageId, setPageId, replacePageId }), [open, pageId, replacePageId]);
  return <SettingsDialogStateContext.Provider value={value}>{children}</SettingsDialogStateContext.Provider>;
}

/** The shared state, or null when no provider is above (the caller then keeps its own). */
export function useSharedSettingsDialogState(): SettingsDialogState | null {
  return useContext(SettingsDialogStateContext);
}

/** The shared state if there is one, else local state of the same shape. */
export function useSettingsDialogState(): SettingsDialogState {
  const shared = useSharedSettingsDialogState();
  const [open, setOpen] = useState(false);
  const [pageId, setPageId] = useState<SettingsPageId>(DEFAULT_SETTINGS_PAGE);
  const replacePageId = (from: SettingsPageId, to: SettingsPageId) =>
    setPageId((current) => (current === from ? to : current));
  return shared ?? { open, setOpen, pageId, setPageId, replacePageId };
}
