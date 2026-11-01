import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A tiny in-memory stand-in for the two things recovery storage talks to: the native `recovery_write` /
 * `recovery_remove` commands (which hold the files, keyed by vault key and record name, never by a path) and the fs
 * plugin's read-only commands. No real disk, no real Tauri.
 */
const store = vi.hoisted(() => ({
  files: new Map<string, string>(),
  calls: [] as Array<{ command: string; args: Record<string, unknown> }>,
  failWrite: false,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: Record<string, unknown>) => {
    store.calls.push({ command, args });
    const key = `${args.key}/${args.name}`;
    if (command === 'recovery_write') {
      if (store.failWrite) throw 'the record could not be written';
      store.files.set(key, args.text as string);
    } else if (command === 'recovery_remove') {
      store.files.delete(key);
    } else {
      throw new Error(`unexpected command ${command}`);
    }
  },
}));
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => '/Users/me/Library/Application Support/com.example.app/' }));
vi.mock('@tauri-apps/plugin-fs', () => {
  const notFound = () => new Error('No such file or directory (os error 2)');
  const folder = (path: string) => path.replace('/Users/me/Library/Application Support/com.example.app/recovery/', '');
  return {
    readTextFile: async (path: string) => {
      const text = store.files.get(folder(path));
      if (text === undefined) throw notFound();
      return text;
    },
    readDir: async (dir: string) => {
      const key = folder(dir);
      const names = [...store.files.keys()].filter((path) => path.startsWith(`${key}/`)).map((path) => path.slice(key.length + 1));
      if (names.length === 0) throw notFound();
      return names.map((name) => ({ name, isFile: true, isDirectory: false, isSymlink: false }));
    },
  };
});

import { TauriRecoveryStorage } from './TauriRecoveryStorage';

beforeEach(() => {
  store.files.clear();
  store.calls.length = 0;
  store.failWrite = false;
});

describe('TauriRecoveryStorage (against mocked native commands and a mocked read-only fs plugin)', () => {
  it('writes through the native command with a vault key, a record name and the text, and never a path', async () => {
    const storage = new TauriRecoveryStorage();

    await storage.writeAtomic('space-1', 'a.aaaaaaaa.json', '{"x":1}');

    expect(store.calls).toEqual([{ command: 'recovery_write', args: { key: 'space-1', name: 'a.aaaaaaaa.json', text: '{"x":1}' } }]);
    expect(store.files.get('space-1/a.aaaaaaaa.json')).toBe('{"x":1}');
  });

  it('a write the native side refuses is reported, and the earlier record is still there', async () => {
    const storage = new TauriRecoveryStorage();
    await storage.writeAtomic('space-1', 'a.aaaaaaaa.json', 'first');
    store.failWrite = true;

    await expect(storage.writeAtomic('space-1', 'a.aaaaaaaa.json', 'second')).rejects.toBe('the record could not be written');

    expect(store.files.get('space-1/a.aaaaaaaa.json')).toBe('first');
  });

  it('lists record files and interrupted-write temp files, reads them, and treats a missing directory or file as empty', async () => {
    const storage = new TauriRecoveryStorage();
    expect(await storage.list('space-1')).toEqual([]);
    expect(await storage.read('space-1', 'a.aaaaaaaa.json')).toBeNull();

    await storage.writeAtomic('space-1', 'a.aaaaaaaa.json', 'one');
    store.files.set('space-1/a.aaaaaaaa.json.tmp', 'interrupted');
    store.files.set('space-1/notes.txt', 'not a record');

    expect((await storage.list('space-1')).sort()).toEqual(['a.aaaaaaaa.json', 'a.aaaaaaaa.json.tmp']);
    expect(await storage.read('space-1', 'a.aaaaaaaa.json')).toBe('one');
  });

  it('removes a record through the native command, and removing one that is already gone is not an error', async () => {
    const storage = new TauriRecoveryStorage();
    await storage.writeAtomic('space-1', 'a.aaaaaaaa.json', 'one');

    await storage.remove('space-1', 'a.aaaaaaaa.json');
    await expect(storage.remove('space-1', 'a.aaaaaaaa.json')).resolves.toBeUndefined();

    expect(store.files.size).toBe(0);
    expect(store.calls.filter((call) => call.command === 'recovery_remove')).toHaveLength(2);
  });
});
