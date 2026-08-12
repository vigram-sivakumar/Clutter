import { useState } from 'react';

export interface ConfirmationRequest {
  readonly title: string;
  readonly message?: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
}

/**
 * The one confirmation-surface state machine — "is there a pending
 * confirmation, what does it say, what happens on confirm" — shared by
 * every entry point that gates an action behind the app's Confirmation/
 * Dialog components (the topbar's ResourceTopBarActions menu, the
 * sidebar's folder row actions), so the open/confirm/cancel shape exists
 * in exactly one place instead of being reimplemented per entry point.
 *
 * This is what replaced window.confirm()-based helpers
 * (deleteFolderWithConfirmation.ts/archiveFolderWithConfirmation.ts): a
 * native browser dialog that does not reliably render in the Tauri
 * desktop shell, and was the direct cause of "sidebar can't archive/delete
 * a non-empty folder, silently" — window.confirm() resolving falsy
 * without ever presenting UI.
 */
export function useConfirmationSurface() {
  const [pending, setPending] = useState<ConfirmationRequest | null>(null);

  return {
    pending,
    request(request: ConfirmationRequest): void {
      setPending(request);
    },
    cancel(): void {
      setPending(null);
    },
    confirm(): void {
      pending?.onConfirm();
      setPending(null);
    },
  };
}
