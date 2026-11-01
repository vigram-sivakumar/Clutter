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
// Copies and binary writes go to the native no-clobber commands, not the plugin: `invoke` is the spy for those.
const core = vi.hoisted(() => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/api/core', () => core);

import { LocalVaultProvider } from './LocalFileSystem';
import { VaultRootMissingError } from './VaultRootMissingError';

const ROOT = '/vault';

const mutations: [string, (fs: LocalVaultProvider) => Promise<unknown>, keyof typeof plugin | 'invoke'][] = [
  ['writeFile', (fs) => fs.writeFile(`${ROOT}/a.md`, 'x'), 'writeTextFile'],
  ['writeBinaryFile', (fs) => fs.writeBinaryFile(`${ROOT}/a.png`, new Uint8Array()), 'invoke'],
  ['deleteFile', (fs) => fs.deleteFile(`${ROOT}/a.md`), 'invoke'],
  ['moveFile', (fs) => fs.moveFile(`${ROOT}/a.md`, `${ROOT}/b.md`), 'rename'],
  ['copyFile', (fs) => fs.copyFile('/tmp/a.png', `${ROOT}/a.png`), 'invoke'],
  ['createDirectory', (fs) => fs.createDirectory(`${ROOT}/Assets`), 'invoke'],
  ['duplicate (a file)', (fs) => fs.duplicate(`${ROOT}/a.md`, 'file'), 'invoke'],
  ['duplicate (a folder)', (fs) => fs.duplicate(`${ROOT}/Folder`, 'directory'), 'invoke'],
];

describe('LocalVaultProvider.seal: nothing is written once sealed', () => {
  it.each(mutations)('refuses %s and never reaches the filesystem', async (_name, run, pluginCall) => {
    const provider = new LocalVaultProvider(ROOT);
    provider.seal();
    const spy = pluginCall === 'invoke' ? core.invoke : plugin[pluginCall];
    spy.mockClear();

    await expect(run(provider)).rejects.toBeInstanceOf(VaultRootMissingError);

    expect(spy).not.toHaveBeenCalled();
  });

  it('still reads and checks existence', async () => {
    const provider = new LocalVaultProvider(ROOT);
    provider.seal();

    await expect(provider.readFile(`${ROOT}/a.md`)).resolves.toBe('text');
    await expect(provider.exists(`${ROOT}/a.md`)).resolves.toBe(false);
  });

  it('writes normally before it is sealed', async () => {
    const provider = new LocalVaultProvider(ROOT);

    await provider.copyFile('/tmp/a.png', `${ROOT}/a.png`);

    expect(core.invoke).toHaveBeenCalledWith('copy_file_no_clobber', { from: '/tmp/a.png', to: `${ROOT}/a.png` });
  });
});
