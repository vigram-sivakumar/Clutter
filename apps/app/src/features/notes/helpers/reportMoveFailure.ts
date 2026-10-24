import type { ToastApi } from '@components/toast/ToastProvider';
import { AssetMoveRefusedError } from '@core/vault/persistence/AssetMovePolicy';

/**
 * Reports a move that did not happen. A move of an Asset refused because its references could not be kept
 * pointing at the file is already explained, wherever the menu was, through the Application's asset-move
 * feedback — a second toast would say the same thing twice, so that one is left alone.
 */
export function reportMoveFailure(toast: ToastApi, noun: 'note' | 'folder' | 'file', error: unknown): void {
  if (error instanceof AssetMoveRefusedError) {
    return;
  }

  toast.fail(`Couldn’t move this ${noun}`, error);
}
