import type { SaveToVaultResult } from '@core/application/asset/saveRemoteImage';

/**
 * What to tell the user after "Save to vault" finished. The saved image looks the same wherever it was
 * used — an embed or a cover now points at the local copy — so without a message nothing shows that it
 * happened. A save that could not repoint every use says so instead of claiming it all worked.
 */
export function saveToVaultFeedback(result: Pick<SaveToVaultResult, 'failed'>): {
  readonly tone: 'default' | 'error';
  readonly text: string;
} {
  const failed = result.failed.length;

  if (failed > 0) {
    return {
      tone: 'error',
      text: `Saved to Assets, but ${failed} ${failed === 1 ? 'use still points' : 'uses still point'} to the web image`,
    };
  }

  return { tone: 'default', text: 'Saved to Assets' };
}
