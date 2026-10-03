import { describe, expect, it, vi } from 'vitest';

import { saveRemoteImage } from './saveRemoteImage';

const imported = { reference: 'Assets/a-1.png', absolutePath: '/vault/Assets/a-1.png', reused: false };
const summary = { rewritten: 2, failed: [], skippedArchived: 1, skippedHidden: 0 };

describe('saveRemoteImage', () => {
  it('saves, registers, then rewrites — in that order — and returns one structured result', async () => {
    const order: string[] = [];

    const result = await saveRemoteImage({
      save: async () => (order.push('save'), imported),
      register: async () => void order.push('register'),
      rewrite: async () => (order.push('rewrite'), summary),
    });

    expect(order).toEqual(['save', 'register', 'rewrite']);
    expect(result).toEqual({ ...summary, reference: 'Assets/a-1.png', assetPath: '/vault/Assets/a-1.png', reusedExisting: false });
  });

  it('a failed download rewrites nothing', async () => {
    const register = vi.fn();
    const rewrite = vi.fn();

    await expect(
      saveRemoteImage({ save: async () => { throw new Error('404'); }, register, rewrite })
    ).rejects.toThrow('404');
    expect(register).not.toHaveBeenCalled();
    expect(rewrite).not.toHaveBeenCalled();
  });

  it('a file the vault never registered rewrites nothing, so no reference can point at an unknown file', async () => {
    const rewrite = vi.fn();

    await expect(
      saveRemoteImage({
        save: async () => imported,
        register: async () => { throw new Error('not picked up'); },
        rewrite,
      })
    ).rejects.toThrow('not picked up');
    expect(rewrite).not.toHaveBeenCalled();
  });

  it('reports a reused copy', async () => {
    const result = await saveRemoteImage({
      save: async () => ({ ...imported, reused: true }),
      register: async () => undefined,
      rewrite: async () => ({ rewritten: 0, failed: [], skippedArchived: 0, skippedHidden: 0 }),
    });

    expect(result.reusedExisting).toBe(true);
  });
});
