import { beforeEach, describe, expect, it, vi } from 'vitest';

const mkdir = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(),
  mkdir: (...args: unknown[]) => mkdir(...args),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  copyFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
}));

import { LocalVaultProvider } from './LocalFileSystem';

beforeEach(() => mkdir.mockReset());

// Opening a vault no longer creates its root (see Application.missingRoot.test.ts), but explicit
// creation — a future "Create new vault", `.clutter`, Assets — still goes through this primitive.
describe('LocalVaultProvider.createDirectory (explicit creation)', () => {
  it('still creates the directory recursively', async () => {
    mkdir.mockResolvedValue(undefined);
    await new LocalVaultProvider('/v').createDirectory('/v/New Vault');
    expect(mkdir).toHaveBeenCalledWith('/v/New Vault', { recursive: true });
  });

  it('resolves a relative path under the root', async () => {
    mkdir.mockResolvedValue(undefined);
    await new LocalVaultProvider('/v').createDirectory('.clutter');
    expect(mkdir).toHaveBeenCalledWith('/v/.clutter', { recursive: true });
  });
});
