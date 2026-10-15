import { describe, expect, it, vi } from 'vitest';

const open = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...args: unknown[]) => open(...args) }));

import { pickSpaceFolder } from './pickSpaceFolder';

describe('pickSpaceFolder', () => {
  it('asks for a single existing directory and returns it', async () => {
    open.mockResolvedValue('/Users/me/Notes');
    expect(await pickSpaceFolder()).toBe('/Users/me/Notes');
    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false });
  });

  it('returns null when the user cancels', async () => {
    open.mockResolvedValue(null);
    expect(await pickSpaceFolder()).toBeNull();
  });
});
