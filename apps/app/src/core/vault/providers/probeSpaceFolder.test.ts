import { beforeEach, describe, expect, it, vi } from 'vitest';

const isTauri = vi.fn();
const stat = vi.fn();
const readDir = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => isTauri() }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  stat: (...args: unknown[]) => stat(...args),
  readDir: (...args: unknown[]) => readDir(...args),
}));

import { probeSpaceFolder } from './probeSpaceFolder';

beforeEach(() => {
  isTauri.mockReturnValue(true);
  stat.mockReset();
  readDir.mockReset();
});

describe('probeSpaceFolder', () => {
  it('accepts a readable directory', async () => {
    stat.mockResolvedValue({ isDirectory: true });
    readDir.mockResolvedValue([]);
    expect(await probeSpaceFolder('/a')).toBe(true);
  });

  it('rejects a file', async () => {
    stat.mockResolvedValue({ isDirectory: false });
    expect(await probeSpaceFolder('/a.md')).toBe(false);
  });

  it('rejects a missing or out-of-scope path without throwing', async () => {
    stat.mockRejectedValue(new Error('forbidden path'));
    expect(await probeSpaceFolder('/nope')).toBe(false);
  });

  it('rejects an unreadable directory', async () => {
    stat.mockResolvedValue({ isDirectory: true });
    readDir.mockRejectedValue(new Error('denied'));
    expect(await probeSpaceFolder('/locked')).toBe(false);
  });

  it('accepts anything in the web runtime, which has no real folders', async () => {
    isTauri.mockReturnValue(false);
    expect(await probeSpaceFolder('/web-dev-vault')).toBe(true);
    expect(stat).not.toHaveBeenCalled();
  });
});
