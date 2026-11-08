import type { ToastApi } from './ToastProvider';

/** The same refused name repeated inside this window (Enter, then the blur that follows) is one toast, not two. */
const REPEAT_WINDOW_MS = 2500;

let lastShown: { readonly name: string; readonly at: number } | null = null;

/**
 * Tells the user a rename was refused because that name is already taken, in every place a note, folder or tag is
 * renamed. The field's own reaction (the shake while it stays open, or the revert on blur) is separate and unchanged;
 * this only says why. A toast, not a save-failure notice: nothing failed to save, the name was refused up front.
 *
 * The same name shown again within a moment — Enter rejected, then the blur that follows it — is not announced twice.
 */
export function showNameTaken(toast: ToastApi, name: string): void {
  const refused = name.trim();
  const now = Date.now();

  if (lastShown && lastShown.name === refused && now - lastShown.at < REPEAT_WINDOW_MS) {
    return;
  }

  lastShown = { name: refused, at: now };
  toast.show({
    tone: 'error',
    text: (
      <>
        The name “<span className="toast__name" title={refused}>{refused}</span>” is already taken
      </>
    ),
  });
}

/** Forgets the last toast, so a test starts without one. */
export function resetNameTakenToast(): void {
  lastShown = null;
}
