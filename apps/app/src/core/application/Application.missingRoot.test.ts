import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({ isTauri: true }));
const fs = vi.hoisted(() => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
}));
const probe = vi.hoisted(() => ({ status: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => tauri.isTauri,
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/plugin-fs', () => fs);
vi.mock('../vault/providers/probeSpaceFolder', () => ({
  probeSpaceFolder: (...args: unknown[]) => probe.status(...args),
  isFolderConfirmedMissing: async () => false,
  isNotFoundError: () => false,
}));

import { Application } from './Application';
import { VaultRootMissingError } from '../vault/providers/VaultRootMissingError';

beforeEach(() => {
  tauri.isTauri = true;
  Object.values(fs).forEach((mock) => mock.mockReset());
  probe.status.mockReset();
  fs.exists.mockResolvedValue(false);
  fs.readDir.mockRejectedValue('Permission denied (os error 13)');
  fs.readTextFile.mockRejectedValue('Permission denied (os error 13)');
  fs.stat.mockRejectedValue('Permission denied (os error 13)');
});

describe('Application.bootstrap: a missing vault root', () => {
  it('is reported as VaultRootMissingError and never created or written', async () => {
    probe.status.mockResolvedValue('missing');

    await expect(Application.bootstrap('/Users/me/Gone')).rejects.toBeInstanceOf(
      VaultRootMissingError
    );

    expect(probe.status).toHaveBeenCalledWith('/Users/me/Gone');
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeTextFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('carries the missing path', async () => {
    probe.status.mockResolvedValue('missing');
    const error = await Application.bootstrap('/Users/me/Gone').catch((e: unknown) => e);
    expect((error as VaultRootMissingError).rootPath).toBe('/Users/me/Gone');
  });

  it('does not treat a permission or scope failure as a missing folder, and still creates nothing', async () => {
    probe.status.mockResolvedValue('unavailable');

    const error = await Application.bootstrap('/Users/me/Locked').catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(VaultRootMissingError);
    expect(fs.mkdir).not.toHaveBeenCalled();
  });
});

describe('Application.bootstrap: web runtime', () => {
  it('still starts an in-memory vault without probing any real folder', async () => {
    tauri.isTauri = false;

    const application = await Application.bootstrap('/web-dev-vault', undefined, {
      parsedNoteCacheBackend: null,
    });

    expect(application.vault.root).toBe('/web-dev-vault');
    expect(probe.status).not.toHaveBeenCalled();
    expect(fs.mkdir).not.toHaveBeenCalled();
  });
});
