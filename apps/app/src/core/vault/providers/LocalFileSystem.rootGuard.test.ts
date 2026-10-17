import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny stand-in for the fs plugin with the two behaviours that matter here: `mkdir` with
// `recursive` creates every missing ancestor (like `mkdir -p`, which is what would re-create a
// deleted vault root), and a file write fails when its parent folder is absent.
const NOT_FOUND = 'NOT_FOUND';
const disk = vi.hoisted(() => ({ dirs: new Set<string>(), files: new Map<string, string>() }));

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/')) || '/';
}

vi.mock('@tauri-apps/plugin-fs', () => ({
  stat: vi.fn(async (path: string) => {
    if (disk.dirs.has(path)) return { isDirectory: true, size: 0, birthtime: null, mtime: null };
    if (disk.files.has(path)) return { isDirectory: false, size: 0, birthtime: null, mtime: null };
    throw NOT_FOUND;
  }),
  exists: vi.fn(async (path: string) => disk.dirs.has(path) || disk.files.has(path)),
  mkdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
    if (options?.recursive) {
      for (let dir = path; dir !== '/' && dir !== ''; dir = parentOf(dir)) disk.dirs.add(dir);
    } else if (disk.dirs.has(parentOf(path))) {
      disk.dirs.add(path);
    } else {
      throw NOT_FOUND;
    }
  }),
  writeTextFile: vi.fn(async (path: string, contents: string) => {
    if (!disk.dirs.has(parentOf(path))) throw NOT_FOUND;
    disk.files.set(path, contents);
  }),
  readTextFile: vi.fn(async (path: string) => {
    const contents = disk.files.get(path);
    if (contents === undefined) throw NOT_FOUND;
    return contents;
  }),
  readDir: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  copyFile: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
}));
// The platform's "is this error a missing path" classifier has its own tests (probeSpaceFolder.test.ts);
// here it is pinned so these tests don't depend on a native error message.
vi.mock('./probeSpaceFolder', () => ({ isNotFoundError: (error: unknown) => error === NOT_FOUND }));

import { mergeAndWriteWorkspaceStateFile } from '../initialize/workspaceStateFile';
import { ensureAssetsDirectory } from '../initialize/ensureAssetsDirectory';
import { ensureClutterDirectory } from '../initialize/ensureClutterDirectory';
import { LocalVaultProvider } from './LocalFileSystem';
import { VaultRootMissingError } from './VaultRootMissingError';

const ROOT = '/Users/me/Vault';

beforeEach(() => {
  disk.dirs.clear();
  disk.files.clear();
});

describe('LocalVaultProvider: a vault root that has gone is never recreated', () => {
  const provider = () => new LocalVaultProvider(ROOT);

  it('refuses createDirectory and creates nothing — not the folder, not the root', async () => {
    await expect(provider().createDirectory(`${ROOT}/Notes/Deep`)).rejects.toBeInstanceOf(
      VaultRootMissingError
    );
    expect(disk.dirs.size).toBe(0);
  });

  it('keeps the original error as the cause', async () => {
    const error = await provider()
      .createDirectory(`${ROOT}/Notes`)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VaultRootMissingError);
    expect((error as VaultRootMissingError).cause).toBe(NOT_FOUND);
    expect((error as VaultRootMissingError).rootPath).toBe(ROOT);
  });

  it('refuses a directory duplicate for the same reason', async () => {
    await expect(provider().duplicate(`${ROOT}/Notes`, 'directory')).rejects.toBeInstanceOf(
      VaultRootMissingError
    );
    expect(disk.dirs.size).toBe(0);
  });

  it('stops workspace-session / metadata persistence from recreating the root via .clutter', async () => {
    await expect(
      mergeAndWriteWorkspaceStateFile(provider(), ROOT, { workspaceSession: { activeView: null } })
    ).rejects.toBeInstanceOf(VaultRootMissingError);
    expect(disk.dirs.size).toBe(0);
    expect(disk.files.size).toBe(0);
  });

  it('stops the .clutter and Assets ensure-helpers (tags, archive, collections, cover imports)', async () => {
    await expect(ensureClutterDirectory(provider(), ROOT)).rejects.toBeInstanceOf(VaultRootMissingError);
    await expect(ensureAssetsDirectory(provider(), ROOT)).rejects.toBeInstanceOf(VaultRootMissingError);
    expect(disk.dirs.size).toBe(0);
  });

  it('fails a file write into the missing root instead of creating it', async () => {
    await expect(provider().writeFile(`${ROOT}/Note.md`, 'x')).rejects.toBe(NOT_FOUND);
    expect(disk.dirs.size).toBe(0);
  });

  it('does not mistake a permission-style stat failure for a missing root', async () => {
    const { stat } = await import('@tauri-apps/plugin-fs');
    vi.mocked(stat).mockRejectedValueOnce('PERMISSION_DENIED');
    disk.dirs.add(ROOT);
    // The guard steps aside and the mkdir itself runs (and would report its own error).
    await expect(provider().createDirectory(`${ROOT}/Notes`)).resolves.toBeUndefined();
    expect(disk.dirs.has(`${ROOT}/Notes`)).toBe(true);
  });
});

describe('LocalVaultProvider: creation inside an existing vault is unchanged', () => {
  beforeEach(() => disk.dirs.add(ROOT));

  it('still creates nested folders, .clutter and Assets', async () => {
    const provider = new LocalVaultProvider(ROOT);
    await provider.createDirectory(`${ROOT}/Notes/Deep`);
    await ensureClutterDirectory(provider, ROOT);
    await ensureAssetsDirectory(provider, ROOT);

    expect(disk.dirs.has(`${ROOT}/.clutter`)).toBe(true);
    expect(disk.dirs.has(`${ROOT}/Assets`)).toBe(true);
    expect(disk.dirs.has(`${ROOT}/Notes/Deep`)).toBe(true);
  });

  it('still persists workspace state', async () => {
    await mergeAndWriteWorkspaceStateFile(new LocalVaultProvider(ROOT), ROOT, { a: 1 });
    expect(JSON.parse(disk.files.get(`${ROOT}/.clutter/workspace.json`)!)).toEqual({ a: 1 });
  });
});

describe('LocalVaultProvider.seal: nothing queued for a discarded vault can land', () => {
  const sealed = () => {
    const provider = new LocalVaultProvider(ROOT);
    provider.seal();
    return provider;
  };

  beforeEach(() => disk.dirs.add(ROOT)); // the folder exists again — e.g. restored from the Trash

  it.each([
    ['createDirectory', (p: LocalVaultProvider) => p.createDirectory(`${ROOT}/Notes`)],
    ['writeFile', (p: LocalVaultProvider) => p.writeFile(`${ROOT}/a.md`, 'x')],
    ['writeBinaryFile', (p: LocalVaultProvider) => p.writeBinaryFile(`${ROOT}/a.png`, new Uint8Array())],
    ['deleteFile', (p: LocalVaultProvider) => p.deleteFile(`${ROOT}/a.md`)],
    ['moveFile', (p: LocalVaultProvider) => p.moveFile(`${ROOT}/a.md`, `${ROOT}/b.md`)],
    ['copyFile', (p: LocalVaultProvider) => p.copyFile('/x', `${ROOT}/a.md`)],
    ['duplicate (directory)', (p: LocalVaultProvider) => p.duplicate(`${ROOT}/Notes`, 'directory')],
  ])('refuses %s', async (_name, run) => {
    await expect(run(sealed())).rejects.toBeInstanceOf(VaultRootMissingError);
    expect(disk.dirs).toEqual(new Set([ROOT]));
    expect(disk.files.size).toBe(0);
  });

  it('refuses a debounced workspace-session write that fires after the seal, even with the folder back', async () => {
    const provider = sealed();
    await expect(
      mergeAndWriteWorkspaceStateFile(provider, ROOT, { workspaceSession: { activeView: null } })
    ).rejects.toBeInstanceOf(VaultRootMissingError);
    expect(disk.dirs.has(`${ROOT}/.clutter`)).toBe(false);
    expect(disk.files.size).toBe(0);
  });

  it('still reads', async () => {
    disk.files.set(`${ROOT}/a.md`, 'hello');
    await expect(sealed().readFile(`${ROOT}/a.md`)).resolves.toBe('hello');
    await expect(sealed().exists(`${ROOT}/a.md`)).resolves.toBe(true);
  });

  it('only seals its own instance: a freshly opened provider for the same folder writes normally', async () => {
    sealed();
    await new LocalVaultProvider(ROOT).createDirectory(`${ROOT}/Notes`);
    expect(disk.dirs.has(`${ROOT}/Notes`)).toBe(true);
  });
});

