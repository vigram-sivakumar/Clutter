import { describe, expect, it, vi } from 'vitest';
import { forgetRemovedSpaceAccess } from './forgetRemovedSpaceAccess';
import { STORAGE_KEY, type SpaceRegistryStorage } from './spaceRegistry';

function memory(initial?: unknown): SpaceRegistryStorage & { saved: Map<string, string> } {
  const saved = new Map<string, string>();
  if (initial !== undefined) saved.set(STORAGE_KEY, JSON.stringify(initial));

  return { saved, getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => void saved.set(key, value) };
}

const registry = (paths: string[], extra: object = {}) => ({ paths, activePath: paths[0] ?? null, ...extra });

describe('forgetRemovedSpaceAccess', () => {
  it('forgets a Space once it is gone from the saved registry, and only that one', () => {
    const forget = vi.fn().mockResolvedValue(undefined);
    const storage = forgetRemovedSpaceAccess(memory(registry(['/a', '/b', '/c'])), forget)!;

    storage.setItem(STORAGE_KEY, JSON.stringify(registry(['/a', '/c'])));

    expect(forget).toHaveBeenCalledTimes(1);
    expect(forget).toHaveBeenCalledWith('/b');
  });

  it('forgets nothing when nothing was removed, and forgets a path only once', () => {
    const forget = vi.fn().mockResolvedValue(undefined);
    const storage = forgetRemovedSpaceAccess(memory(registry(['/a', '/b'])), forget)!;

    storage.setItem(STORAGE_KEY, JSON.stringify(registry(['/a', '/b'])));
    storage.setItem(STORAGE_KEY, JSON.stringify(registry(['/a'])));
    storage.setItem(STORAGE_KEY, JSON.stringify(registry(['/a'])));

    expect(forget.mock.calls).toEqual([['/b']]);
  });

  it('never forgets either end of a rename that is still pending', () => {
    const forget = vi.fn().mockResolvedValue(undefined);
    const storage = forgetRemovedSpaceAccess(memory(registry(['/old', '/b'])), forget)!;

    storage.setItem(STORAGE_KEY, JSON.stringify(registry(['/b'], { pendingRename: { from: '/old', to: '/new', spaceId: null } })));

    expect(forget).not.toHaveBeenCalled();
  });

  it('does not forget when the registry could not be saved', () => {
    const forget = vi.fn().mockResolvedValue(undefined);
    const inner = memory(registry(['/a', '/b']));
    inner.setItem = () => {
      throw new Error('quota');
    };
    const storage = forgetRemovedSpaceAccess(inner, forget)!;

    expect(() => storage.setItem(STORAGE_KEY, JSON.stringify(registry(['/a'])))).toThrow();
    expect(forget).not.toHaveBeenCalled();
  });

  it('a failed forget is logged and never fails the save', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const forget = vi.fn().mockRejectedValue('boom');
    const storage = forgetRemovedSpaceAccess(memory(registry(['/a', '/b'])), forget)!;

    expect(() => storage.setItem(STORAGE_KEY, JSON.stringify(registry(['/a'])))).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
  });

  it('passes a missing storage through', () => {
    expect(forgetRemovedSpaceAccess(null, vi.fn())).toBeNull();
  });
});
