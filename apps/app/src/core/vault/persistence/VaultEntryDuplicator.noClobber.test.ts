// @vitest-environment jsdom
/**
 * Duplicating a folder never merges into a folder that is already there, never overwrites a file, and takes back
 * only what it made when it fails.
 *
 * Runs the real path end to end: `VaultEntryDuplicator` -> the production `LocalVaultProvider` -> the real
 * `@tauri-apps/plugin-fs` JavaScript -> a fake IPC that behaves like the Rust side. The fake disk models what matters
 * here: `mkdir` without `recursive` fails on an existing name (`File exists (os error 17)`), `remove` without
 * `recursive` refuses a folder that is not empty, `copy_file_no_clobber` answers `EEXIST` for a taken name. A hook lets a
 * test make another process act at an exact moment, which is how a collision that no `exists` check could see is made.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DestinationExistsError } from '../providers/VaultFileSystem';
import { LocalVaultProvider } from '../providers/LocalFileSystem';
import { VaultEntryDuplicator } from './VaultEntryDuplicator';

const text = (value: string) => new TextEncoder().encode(value);
const read = (disk: FakeDisk, path: string) => (disk.files.has(path) ? new TextDecoder().decode(disk.files.get(path)) : undefined);

type Hook = (command: string, args: Record<string, unknown>) => void;

class FakeDisk {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Set<string>();
  readonly log: string[] = [];
  /** Called before each command is carried out: where "another process" acts. */
  before: Hook = () => {};
  /** Makes the n-th (1-based) copy fail with an I/O error, as a full disk would. */
  failCopyNumber: number | null = null;
  private copies = 0;

  private taken = (path: string) => this.files.has(path) || this.directories.has(path);
  private hasChildren = (dir: string) => [...this.files.keys(), ...this.directories].some((path) => path.startsWith(`${dir}/`));

  invoke = async (command: string, args: Record<string, unknown>, options?: { headers?: Record<string, string> }): Promise<unknown> => {
    this.log.push(`${command} ${String(args.path ?? args.to ?? '')}`.trim());
    this.before(command, args);
    switch (command) {
      case 'plugin:fs|exists':
        return this.taken(args.path as string);
      case 'plugin:fs|stat':
        return { isFile: false, isDirectory: true, isSymlink: false, size: 0, mtime: null, atime: null, birthtime: null, readonly: false };
      case 'plugin:fs|mkdir': {
        const path = args.path as string;
        const recursive = (args.options as { recursive?: boolean } | undefined)?.recursive ?? false;
        if (recursive) {
          this.directories.add(path);
          return undefined;
        }
        if (this.taken(path)) throw `failed to create directory at path: ${path} with error: File exists (os error 17)`;
        this.directories.add(path);
        return undefined;
      }
      case 'plugin:fs|remove': {
        const path = args.path as string;
        if (this.files.delete(path)) return undefined;
        if (this.directories.has(path)) {
          if (this.hasChildren(path)) throw `failed to remove directory at path: ${path} with error: Directory not empty (os error 66)`;
          this.directories.delete(path);
          return undefined;
        }
        throw `failed to get metadata of path: ${path} with error: No such file or directory (os error 2)`;
      }
      case 'plugin:fs|read_dir': {
        const dir = args.path as string;
        const entries: { name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean }[] = [];
        for (const path of this.files.keys()) if (path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/')) entries.push({ name: path.slice(dir.length + 1), isDirectory: false, isFile: true, isSymlink: false });
        for (const path of this.directories) if (path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/')) entries.push({ name: path.slice(dir.length + 1), isDirectory: true, isFile: false, isSymlink: false });
        return entries;
      }
      case 'copy_file_no_clobber': {
        this.copies += 1;
        if (this.failCopyNumber === this.copies) throw 'Input/output error (os error 5)';
        const bytes = this.files.get(args.from as string);
        if (!bytes) throw new Error(`No such file: ${String(args.from)}`);
        if (this.taken(args.to as string)) throw `EEXIST: destination already exists: ${String(args.to)}`;
        this.files.set(args.to as string, Uint8Array.from(bytes));
        return undefined;
      }
      default:
        throw new Error(`unexpected command ${command} (${JSON.stringify(options)})`);
    }
  };

  /** A snapshot to prove untouched things stayed untouched. */
  snapshot(root: string): Record<string, string> {
    const inside = (path: string) => path === root || path.startsWith(`${root}/`);
    const result: Record<string, string> = {};
    for (const [path, bytes] of this.files) if (inside(path)) result[path] = new TextDecoder().decode(bytes);
    for (const path of this.directories) if (inside(path)) result[`${path}/`] = '(dir)';
    return result;
  }
}

let disk: FakeDisk;
const duplicator = () => new VaultEntryDuplicator(new LocalVaultProvider('/vault'));

beforeEach(() => {
  disk = new FakeDisk();
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke: disk.invoke };
  disk.directories.add('/vault');
  disk.directories.add('/vault/Notes');
  disk.directories.add('/vault/Notes/Sub');
  disk.files.set('/vault/Notes/a.md', text('A'));
  disk.files.set('/vault/Notes/b.md', text('B'));
  disk.files.set('/vault/Notes/Sub/c.md', text('C'));
});
afterEach(() => {
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe('duplicating a folder when the destination folder already exists', () => {
  it('chooses the next free name and leaves the existing folder exactly as it was', async () => {
    disk.directories.add('/vault/Notes copy');
    disk.files.set('/vault/Notes copy/mine.md', text('somebody else\'s note'));
    disk.files.set('/vault/Notes copy/a.md', text('NOT the original A'));
    const existing = disk.snapshot('/vault/Notes copy');

    const destination = await duplicator().duplicateDirectory('/vault/Notes');

    expect(destination).toBe('/vault/Notes copy 2');
    expect(disk.snapshot('/vault/Notes copy')).toEqual(existing);
    expect(read(disk, '/vault/Notes copy/a.md')).toBe('NOT the original A');
    expect(read(disk, '/vault/Notes copy/mine.md')).toBe('somebody else\'s note');
    expect(read(disk, '/vault/Notes copy 2/a.md')).toBe('A');
    expect(read(disk, '/vault/Notes copy 2/Sub/c.md')).toBe('C');
  });

  it('a folder that appears at the chosen name after the name was checked is never entered: the next name is used', async () => {
    let planted = false;
    disk.before = (command, args) => {
      // After the free name was chosen (`exists` said no) and just before the folder is made.
      if (command === 'plugin:fs|mkdir' && args.path === '/vault/Notes copy' && !planted) {
        planted = true;
        disk.directories.add('/vault/Notes copy');
        disk.files.set('/vault/Notes copy/theirs.md', text('theirs'));
      }
    };

    const destination = await duplicator().duplicateDirectory('/vault/Notes');

    expect(planted).toBe(true);
    expect(destination).toBe('/vault/Notes copy 2');
    expect(disk.snapshot('/vault/Notes copy')).toEqual({ '/vault/Notes copy/': '(dir)', '/vault/Notes copy/theirs.md': 'theirs' });
    expect(read(disk, '/vault/Notes copy 2/a.md')).toBe('A');
  });

  it('a name that keeps being taken is given up on after a bounded number of tries, creating and changing nothing', async () => {
    let counter = 0;
    disk.before = (command, args) => {
      if (command === 'plugin:fs|mkdir' && String(args.path).startsWith('/vault/Notes copy')) {
        disk.directories.add(String(args.path));
        counter += 1;
      }
    };
    const before = disk.snapshot('/vault/Notes');

    await expect(duplicator().duplicateDirectory('/vault/Notes')).rejects.toBeInstanceOf(DestinationExistsError);

    expect(counter).toBe(8);
    expect(disk.snapshot('/vault/Notes')).toEqual(before);
    expect([...disk.files.keys()].filter((path) => path.startsWith('/vault/Notes copy'))).toEqual([]);
  });

  it('with no collision it behaves as before: the folder and everything in it is copied', async () => {
    const destination = await duplicator().duplicateDirectory('/vault/Notes');

    expect(destination).toBe('/vault/Notes copy');
    expect(read(disk, '/vault/Notes copy/a.md')).toBe('A');
    expect(read(disk, '/vault/Notes copy/b.md')).toBe('B');
    expect(read(disk, '/vault/Notes copy/Sub/c.md')).toBe('C');
    expect(disk.directories.has('/vault/Notes copy/Sub')).toBe(true);
  });

  it('creates the destination folder with the exclusive form of mkdir, never the recursive one that merges', async () => {
    const mkdirs: unknown[] = [];
    const original = disk.invoke;
    disk.invoke = async (command, args, options) => {
      if (command === 'plugin:fs|mkdir') mkdirs.push((args.options as { recursive?: boolean } | undefined)?.recursive);
      return original(command, args, options);
    };
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke: disk.invoke };

    await duplicator().duplicateDirectory('/vault/Notes');

    expect(mkdirs).toEqual([false, false]); // the destination, then its one subfolder
  });
});

describe('duplicating a folder while a destination file or folder appears', () => {
  it('a file that appears at a destination name during the copy is never replaced; what this attempt made is removed; the intruder stays', async () => {
    disk.before = (command, args) => {
      // Between the first file and the second: somebody puts a file where the second one is about to go.
      if (command === 'copy_file_no_clobber' && String(args.to).endsWith('/b.md') && !disk.files.has('/vault/Notes copy/b.md')) {
        disk.files.set('/vault/Notes copy/b.md', text('INTRUDER'));
      }
    };
    const source = disk.snapshot('/vault/Notes');

    await expect(duplicator().duplicateDirectory('/vault/Notes')).rejects.toBeInstanceOf(DestinationExistsError);

    expect(read(disk, '/vault/Notes copy/b.md')).toBe('INTRUDER');
    // Everything this attempt created is gone: the files it copied and its folders that are now empty.
    expect(read(disk, '/vault/Notes copy/a.md')).toBeUndefined();
    expect(disk.directories.has('/vault/Notes copy/Sub')).toBe(false);
    // The folder that holds the intruder is not empty, so it is kept (never recursively deleted).
    expect(disk.directories.has('/vault/Notes copy')).toBe(true);
    expect(disk.snapshot('/vault/Notes copy')).toEqual({ '/vault/Notes copy/': '(dir)', '/vault/Notes copy/b.md': 'INTRUDER' });
    expect(disk.snapshot('/vault/Notes')).toEqual(source);
  });

  it('a nested folder that appears at a destination path is never merged into; the copy stops, removes its own work and keeps the intruder\'s folder and files', async () => {
    disk.before = (command, args) => {
      if (command === 'plugin:fs|mkdir' && args.path === '/vault/Notes copy/Sub') {
        disk.directories.add('/vault/Notes copy/Sub');
        disk.files.set('/vault/Notes copy/Sub/theirs.md', text('theirs'));
      }
    };
    const source = disk.snapshot('/vault/Notes');

    await expect(duplicator().duplicateDirectory('/vault/Notes')).rejects.toBeInstanceOf(DestinationExistsError);

    expect(read(disk, '/vault/Notes copy/Sub/theirs.md')).toBe('theirs');
    expect(read(disk, '/vault/Notes copy/Sub/c.md')).toBeUndefined();
    expect(disk.snapshot('/vault/Notes copy')).toEqual({
      '/vault/Notes copy/': '(dir)',
      '/vault/Notes copy/Sub/': '(dir)',
      '/vault/Notes copy/Sub/theirs.md': 'theirs',
    });
    expect(disk.snapshot('/vault/Notes')).toEqual(source);
  });
});

describe('duplicating a folder that fails part way', () => {
  it('removes exactly what it created, files then folders, and leaves the source and everything else as they were', async () => {
    disk.directories.add('/vault/Other');
    disk.files.set('/vault/Other/keep.md', text('keep'));
    disk.files.set('/vault/top.md', text('top'));
    disk.failCopyNumber = 3; // a, b copied; c.md in Sub fails
    const everythingBefore = disk.snapshot('/vault');

    await expect(duplicator().duplicateDirectory('/vault/Notes')).rejects.toBe('Input/output error (os error 5)');

    expect(disk.snapshot('/vault')).toEqual(everythingBefore);
    expect([...disk.files.keys(), ...disk.directories].filter((path) => path.startsWith('/vault/Notes copy'))).toEqual([]);
  });

  it('a failure on the very first file leaves no folder behind', async () => {
    disk.failCopyNumber = 1;
    const before = disk.snapshot('/vault');

    await expect(duplicator().duplicateDirectory('/vault/Notes')).rejects.toBeDefined();

    expect(disk.snapshot('/vault')).toEqual(before);
  });

  it('never asks to remove anything it did not create, and never removes recursively', async () => {
    disk.failCopyNumber = 3;

    await expect(duplicator().duplicateDirectory('/vault/Notes')).rejects.toBeDefined();

    const removed = disk.log.filter((entry) => entry.startsWith('plugin:fs|remove')).map((entry) => entry.replace('plugin:fs|remove ', ''));
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.every((path) => path.startsWith('/vault/Notes copy'))).toBe(true);
    expect(removed.some((path) => path.startsWith('/vault/Notes/') || path === '/vault/Notes')).toBe(false);
  });

  it('the original source and every pre-existing destination entry are untouched after any failure', async () => {
    disk.directories.add('/vault/Notes copy');
    disk.files.set('/vault/Notes copy/existing.md', text('existing'));
    disk.failCopyNumber = 2;
    const sourceBefore = disk.snapshot('/vault/Notes');
    const existingBefore = disk.snapshot('/vault/Notes copy');

    await expect(duplicator().duplicateDirectory('/vault/Notes')).rejects.toBeDefined();

    expect(disk.snapshot('/vault/Notes')).toEqual(sourceBefore);
    expect(disk.snapshot('/vault/Notes copy')).toEqual(existingBefore);
    expect([...disk.directories].some((path) => path.startsWith('/vault/Notes copy 2'))).toBe(false);
  });
});
