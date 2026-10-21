import { describe, expect, it, vi } from 'vitest';

// The fs plugin is stubbed with spies: what matters is whether a call reaches it once the provider is sealed.
const plugin = vi.hoisted(() => ({
  stat: vi.fn(async () => ({ isDirectory: true, size: 0, birthtime: null, mtime: null })),
  exists: vi.fn(async () => false),
  mkdir: vi.fn(async () => undefined),
  writeTextFile: vi.fn(async () => undefined),
  readTextFile: vi.fn(async () => 'text'),
  readDir: vi.fn(async () => []),
  remove: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  copyFile: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  readFile: vi.fn(async () => new Uint8Array()),
}));
vi.mock('@tauri-apps/plugin-fs', () => plugin);

import { LocalVaultProvider } from './LocalFileSystem';
import { VaultRootMissingError } from './VaultRootMissingError';

const ROOT = '/vault';

const mutations: [string, (fs: LocalVaultProvider) => Promise<unknown>, keyof typeof plugin][] = [
  ['writeFile', (fs) => fs.writeFile(`${ROOT}/a.md`, 'x'), 'writeTextFile'],
  ['writeBinaryFile', (fs) => fs.writeBinaryFile(`${ROOT}/a.png`, new Uint8Array()), 'writeFile'],
  ['deleteFile', (fs) => fs.deleteFile(`${ROOT}/a.md`), 'remove'],
  ['moveFile', (fs) => fs.moveFile(`${ROOT}/a.md`, `${ROOT}/b.md`), 'rename'],
  ['copyFile', (fs) => fs.copyFile('/tmp/a.png', `${ROOT}/a.png`), 'copyFile'],
  ['createDirectory', (fs) => fs.createDirectory(`${ROOT}/Assets`), 'mkdir'],
  ['duplicate (a file)', (fs) => fs.duplicate(`${ROOT}/a.md`, 'file'), 'copyFile'],
  ['duplicate (a folder)', (fs) => fs.duplicate(`${ROOT}/Folder`, 'directory'), 'mkdir'],
];

describe('LocalVaultProvider.seal: nothing is written once sealed', () => {
  it.each(mutations)('refuses %s and never reaches the filesystem', async (_name, run, pluginCall) => {
    const provider = new LocalVaultProvider(ROOT);
    provider.seal();
    plugin[pluginCall].mockClear();

    await expect(run(provider)).rejects.toBeInstanceOf(VaultRootMissingError);

    expect(plugin[pluginCall]).not.toHaveBeenCalled();
  });

  it('still reads and checks existence', async () => {
    const provider = new LocalVaultProvider(ROOT);
    provider.seal();

    await expect(provider.readFile(`${ROOT}/a.md`)).resolves.toBe('text');
    await expect(provider.exists(`${ROOT}/a.md`)).resolves.toBe(false);
  });

  it('writes normally before it is sealed', async () => {
    const provider = new LocalVaultProvider(ROOT);

    await provider.writeFile(`${ROOT}/a.md`, 'x');
    await provider.copyFile('/tmp/a.png', `${ROOT}/a.png`);

    expect(plugin.writeTextFile).toHaveBeenCalled();
    expect(plugin.copyFile).toHaveBeenCalled();
  });
});
