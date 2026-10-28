// @vitest-environment jsdom
/**
 * Duplicating a folder copies binary files byte for byte.
 *
 * (Regression test for a confirmed defect: the walk used to read every file as text and write it back, which replaced
 * every invalid UTF-8 byte with U+FFFD and damaged images and PDFs. It now copies each file with `copyFile`.)
 *
 * This runs the REAL code path end to end: `VaultEntryDuplicator` -> the production `LocalVaultProvider` -> the REAL
 * `@tauri-apps/plugin-fs` JavaScript (`readTextFile` / `writeTextFile`) -> a fake IPC that behaves like the Rust side
 * of those commands (it hands back and stores the raw bytes it is given). Nothing about text decoding is mocked: the
 * UTF-8 decode in `readTextFile` and the UTF-8 encode in `writeTextFile` are the plugin's own.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalVaultProvider } from '../providers/LocalFileSystem';
import { VaultEntryDuplicator } from './VaultEntryDuplicator';

/** Known bytes, including sequences that are not valid UTF-8. */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0xff, 0xfe, 0x80, 0x81, 0xc0, 0xc1, 0xf5, 0x00]);
const PDF = Uint8Array.from([...new TextEncoder().encode('%PDF-1.4\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0xff]);
const TEXT = new TextEncoder().encode('# A note\n\nPlain UTF-8 text, including é, 日本語 and an emoji 🙂.\n');

/** Compared as plain number arrays: jsdom and Node have different `Uint8Array` classes, which `toEqual` would trip on. */
const bytes = (value: Uint8Array | undefined): number[] => (value ? Array.from(value) : []);

const isValidUtf8 = (bytes: Uint8Array): boolean => {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
};

class FakeDisk {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Set<string>();
  readonly log: string[] = [];

  invoke = async (command: string, args: Record<string, unknown>, options?: { headers?: Record<string, string> }): Promise<unknown> => {
    this.log.push(command);
    switch (command) {
      case 'plugin:fs|exists':
        return this.files.has(args.path as string) || this.directories.has(args.path as string);
      case 'plugin:fs|stat':
        return { isFile: false, isDirectory: true, isSymlink: false, size: 0, mtime: null, atime: null, birthtime: null, readonly: false };
      case 'plugin:fs|mkdir':
        this.directories.add(args.path as string);
        return undefined;
      case 'plugin:fs|read_dir': {
        const dir = args.path as string;
        const entries: { name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean }[] = [];
        for (const path of this.files.keys()) if (path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/')) entries.push({ name: path.slice(dir.length + 1), isDirectory: false, isFile: true, isSymlink: false });
        for (const path of this.directories) if (path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/')) entries.push({ name: path.slice(dir.length + 1), isDirectory: true, isFile: false, isSymlink: false });
        return entries;
      }
      case 'plugin:fs|read_text_file': {
        // The Rust side returns the file's raw bytes; the JavaScript plugin decodes them.
        const bytes = this.files.get(args.path as string);
        if (!bytes) throw new Error(`No such file: ${String(args.path)}`);
        return Array.from(bytes);
      }
      case 'plugin:fs|copy_file': {
        // The Rust side copies the file's bytes without interpreting them.
        const bytes = this.files.get(args.fromPath as string);
        if (!bytes) throw new Error(`No such file: ${String(args.fromPath)}`);
        this.files.set(args.toPath as string, Uint8Array.from(bytes));
        return undefined;
      }
      case 'plugin:fs|write_text_file': {
        // The JavaScript plugin sends the encoded bytes as the body and the path in a header.
        const path = decodeURIComponent(options!.headers!.path as string);
        this.files.set(path, Uint8Array.from(args as unknown as Uint8Array));
        return undefined;
      }
      default:
        throw new Error(`unexpected command ${command}`);
    }
  };
}

let disk: FakeDisk;
beforeEach(() => {
  disk = new FakeDisk();
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke: disk.invoke };
  disk.directories.add('/vault');
  disk.directories.add('/vault/Photos');
  disk.files.set('/vault/Photos/note.md', TEXT);
  disk.files.set('/vault/Photos/cover.png', PNG);
  disk.files.set('/vault/Photos/paper.pdf', PDF);
});
afterEach(() => {
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe('VaultEntryDuplicator.duplicateDirectory with binary files', () => {
  it('the test bytes really are invalid UTF-8, so any text conversion is detectable', () => {
    expect(isValidUtf8(TEXT)).toBe(true);
    expect(isValidUtf8(PNG)).toBe(false);
    expect(isValidUtf8(PDF)).toBe(false);
  });

  it('a text note survives the copy byte for byte', async () => {
    const destination = await new VaultEntryDuplicator(new LocalVaultProvider('/vault')).duplicateDirectory('/vault/Photos');

    expect(destination).toBe('/vault/Photos copy');
    expect(bytes(disk.files.get(`${destination}/note.md`))).toEqual(bytes(TEXT));
  });

  it('copies binary files byte for byte', async () => {
    const destination = await new VaultEntryDuplicator(new LocalVaultProvider('/vault')).duplicateDirectory('/vault/Photos');

    expect(bytes(disk.files.get(`${destination}/cover.png`))).toEqual(bytes(PNG));
    expect(bytes(disk.files.get(`${destination}/paper.pdf`))).toEqual(bytes(PDF));
    // The copy is exactly as long as the original: no byte was replaced by a longer sequence.
    expect(disk.files.get(`${destination}/cover.png`)!.length).toBe(PNG.length);
    // The source files are untouched.
    expect(bytes(disk.files.get('/vault/Photos/cover.png'))).toEqual(bytes(PNG));
    expect(bytes(disk.files.get('/vault/Photos/paper.pdf'))).toEqual(bytes(PDF));
  });

  it('copies nested folders too, binary files at every depth', async () => {
    disk.directories.add('/vault/Photos/Raw');
    disk.files.set('/vault/Photos/Raw/shot.png', PNG);

    const destination = await new VaultEntryDuplicator(new LocalVaultProvider('/vault')).duplicateDirectory('/vault/Photos');

    expect(disk.directories.has(`${destination}/Raw`)).toBe(true);
    expect(bytes(disk.files.get(`${destination}/Raw/shot.png`))).toEqual(bytes(PNG));
  });

  it('no file goes through the text primitives any more: each is copied with the byte-level copy', async () => {
    await new VaultEntryDuplicator(new LocalVaultProvider('/vault')).duplicateDirectory('/vault/Photos');

    expect(disk.log.filter((command) => command === 'plugin:fs|copy_file')).toHaveLength(3);
    expect(disk.log).not.toContain('plugin:fs|read_text_file');
    expect(disk.log).not.toContain('plugin:fs|write_text_file');
  });
});
