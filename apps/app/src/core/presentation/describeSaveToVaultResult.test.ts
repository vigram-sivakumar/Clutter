import { describe, expect, it } from 'vitest';

import { describeSaveToVaultResult } from './describeSaveToVaultResult';

const base = {
  reference: 'Assets/a.png',
  assetPath: '/v/Assets/a.png',
  reusedExisting: false,
  rewritten: 0,
  failed: [],
  skippedArchived: 0,
  skippedHidden: 0,
};

describe('describeSaveToVaultResult', () => {
  it('says exactly what happened', () => {
    expect(
      describeSaveToVaultResult({
        ...base,
        rewritten: 9,
        failed: [{ kind: 'page', id: 'x', usage: 'embed', message: 'boom' }],
      })
    ).toBe('Saved the image to the vault. Updated 9 references. 1 reference could not be updated.');
  });

  it('reports what was left alone on purpose', () => {
    expect(describeSaveToVaultResult({ ...base, rewritten: 1, skippedArchived: 2, skippedHidden: 1 })).toBe(
      'Saved the image to the vault. Updated 1 reference. 2 uses in archived notes or folders left unchanged. 1 hidden cover left unchanged.'
    );
  });

  it('reports a reused copy with nothing to update', () => {
    expect(describeSaveToVaultResult({ ...base, reusedExisting: true })).toBe(
      'This image was already saved in the vault. No notes or covers needed updating.'
    );
  });
});
