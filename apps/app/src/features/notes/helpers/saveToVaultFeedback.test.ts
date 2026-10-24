import { describe, expect, it } from 'vitest';
import { saveToVaultFeedback } from './saveToVaultFeedback';

describe('saveToVaultFeedback', () => {
  it('confirms a save that updated every use', () => {
    expect(saveToVaultFeedback({ failed: [] })).toEqual({ tone: 'default', text: 'Saved to Assets' });
  });

  it('does not claim success when some uses could not be updated', () => {
    const failed = [{}, {}] as never;
    expect(saveToVaultFeedback({ failed })).toEqual({
      tone: 'error',
      text: 'Saved to Assets, but 2 uses still point to the web image',
    });
    expect(saveToVaultFeedback({ failed: [{}] as never }).text).toBe(
      'Saved to Assets, but 1 use still points to the web image'
    );
  });
});
