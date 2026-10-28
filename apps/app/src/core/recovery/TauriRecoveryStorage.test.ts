import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A tiny in-memory stand-in for the fs plugin, recording the order of operations. */
const fsState = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  log: [] as string[],
  failRename: false,
}));

vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => '/Users/me/Library/Application Support/com.example.app/' }));
vi.mock('@tauri-apps/plugin-fs', () => {
  const notFound = () => new Error('No such file or directory (os error 2)');
  return {
    mkdir: async (path: string) => void (fsState.log.push(`mkdir ${path}`), fsState.dirs.add(path)),
    writeTextFile: async (path: string, text: string) => void (fsState.log.push(`write ${path}`), fsState.files.set(path, text)),
    rename: async (from: string, to: string) => {
      fsState.log.push(`rename ${from} -> ${to}`);
      if (fsState.failRename) throw new Error('rename failed');
      fsState.files.set(to, fsState.files.get(from)!);
      fsState.files.delete(from);
    },
    remove: async (path: string) => void (fsState.log.push(`remove ${path}`), fsState.files.delete(path)),
    exists: async (path: string) => fsState.files.has(path),
    readTextFile: async (path: string) => {
      if (!fsState.files.has(path)) throw notFound();
      return fsState.files.get(path)!;
    },
    readDir: async (dir: string) => {
      if (![...fsState.dirs].some((known) => known === dir)) throw notFound();
      return [...fsState.files.keys()]
        .filter((path) => path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/'))
        .map((path) => ({ name: path.slice(dir.length + 1), isFile: true, isDirectory: false, isSymlink: false }));
    },
  };
});

import { TauriRecoveryStorage } from './TauriRecoveryStorage';

const ROOT = '/Users/me/Library/Application Support/com.example.app/recovery';

beforeEach(() => {
  fsState.files.clear();
  fsState.dirs.clear();
  fsState.log.length = 0;
  fsState.failRename = false;
});

describe('TauriRecoveryStorage (against a mocked fs plugin: no real disk, no real Tauri)', () => {
  it('keeps records in the application data directory, under the vault key, outside any vault', async () => {
    const storage = new TauriRecoveryStorage();

    await storage.writeAtomic('space-1', 'a.aaaaaaaa.json', '{"x":1}');

    expect(fsState.files.get(`${ROOT}/space-1/a.aaaaaaaa.json`)).toBe('{"x":1}');
  });

  it('writes a temporary file and renames it over the record, so a failure leaves the earlier record intact', async () => {
    const storage = new TauriRecoveryStorage();
    await storage.writeAtomic('space-1', 'a.aaaaaaaa.json', 'first');
    fsState.log.length = 0;
    fsState.failRename = true;

    await expect(storage.writeAtomic('space-1', 'a.aaaaaaaa.json', 'second')).rejects.toThrow('rename failed');

    expect(fsState.files.get(`${ROOT}/space-1/a.aaaaaaaa.json`)).toBe('first');
    expect(fsState.files.has(`${ROOT}/space-1/a.aaaaaaaa.json.tmp`)).toBe(false); // the temporary file is cleaned up
    expect(fsState.log[0]).toMatch(/mkdir/);
    expect(fsState.log.indexOf(`write ${ROOT}/space-1/a.aaaaaaaa.json.tmp`)).toBeLessThan(
      fsState.log.findIndex((entry) => entry.startsWith('rename'))
    );
  });

  it('lists record files and interrupted-write temp files, reads them, and treats a missing directory or file as empty', async () => {
    const storage = new TauriRecoveryStorage();
    expect(await storage.list('space-1')).toEqual([]);
    expect(await storage.read('space-1', 'a.aaaaaaaa.json')).toBeNull();

    await storage.writeAtomic('space-1', 'a.aaaaaaaa.json', 'one');
    fsState.files.set(`${ROOT}/space-1/a.aaaaaaaa.json.tmp`, 'interrupted');
    fsState.files.set(`${ROOT}/space-1/notes.txt`, 'not a record');

    expect((await storage.list('space-1')).sort()).toEqual(['a.aaaaaaaa.json', 'a.aaaaaaaa.json.tmp']);
    expect(await storage.read('space-1', 'a.aaaaaaaa.json')).toBe('one');
  });

  it('removes a record, and removing one that is already gone is not an error', async () => {
    const storage = new TauriRecoveryStorage();
    await storage.writeAtomic('space-1', 'a.aaaaaaaa.json', 'one');

    await storage.remove('space-1', 'a.aaaaaaaa.json');
    await expect(storage.remove('space-1', 'a.aaaaaaaa.json')).resolves.toBeUndefined();

    expect(fsState.files.size).toBe(0);
  });
});
