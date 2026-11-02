import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildWelcomeManifest,
  bundledWelcomeManifest,
  type WelcomeEntry,
} from './welcomeContentManifest';
import { allFilesInShippedFolder, nodeShippedManifest, shippedFiles, SHIPPED_SOURCE_ROOT } from './welcomeContentTestRig';
import { EXCLUDED_FROM_INSTALL } from './welcomeContentManifest';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';

const bundled = bundledWelcomeManifest(async (url) => {
  // The bundler hands the image over as a URL; tests read the same file straight from disk.
  const name = decodeURIComponent(url.split('/').pop() ?? '');
  const file = shippedFiles().find(({ rel }) => rel.endsWith(name.replace(/^\//, '')));
  if (!file) throw new Error(`no shipped file for ${url}`);

  return new Uint8Array(fs.readFileSync(file.abs));
});

const paths = (entries: readonly WelcomeEntry[]) => entries.map((entry) => `${entry.kind}:${entry.path}`);

describe('bundled welcome manifest (ADR-067)', () => {
  it('holds exactly the shipped content: 2 directories, 22 notes, no image, and nothing else (24 entries)', () => {
    const kinds = bundled.entries.reduce<Record<string, number>>((count, entry) => {
      count[entry.kind] = (count[entry.kind] ?? 0) + 1;

      return count;
    }, {});

    expect(kinds).toEqual({ directory: 2, markdown: 22 });
    expect(bundled.entries).toHaveLength(24);
    expect(bundled.entries.some((entry) => entry.path.includes('.DS_Store'))).toBe(false);
    expect(bundled.entries.some((entry) => entry.path.endsWith('.folder.md'))).toBe(false);
  });

  it('is identical to what is on disk: the bundler glob drops and adds nothing', () => {
    expect(paths(bundled.entries)).toEqual(paths(nodeShippedManifest().entries));
  });

  it('keeps the .folder.md file, on its directory, byte for byte', async () => {
    const markers = bundled.entries.filter((entry) => entry.kind === 'directory' && entry.loadMarker);

    expect(markers.map((entry) => entry.path)).toEqual(['Welcome to Clutter']);
    for (const entry of markers) {
      if (entry.kind !== 'directory' || !entry.loadMarker) continue;
      const source = fs.readFileSync(`${SHIPPED_SOURCE_ROOT}/${entry.path}/.folder.md`);

      expect(Buffer.compare(Buffer.from(await entry.loadMarker(), 'utf8'), source)).toBe(0);
    }
  });

  it('reads every note as text, byte for byte, with the shipped paths', async () => {
    for (const entry of bundled.entries) {
      if (entry.kind !== 'markdown') continue;
      const source = fs.readFileSync(`${SHIPPED_SOURCE_ROOT}/${entry.path}`);

      expect(Buffer.compare(Buffer.from(await entry.load(), 'utf8'), source), entry.path).toBe(0);
    }
  });

  it('never installs a file on the exclusion list, whether or not it is in the folder (it is never deleted by the installer)', () => {
    expect(EXCLUDED_FROM_INSTALL).toEqual(['Welcome to Clutter/Get started copy.md']);
    for (const excluded of EXCLUDED_FROM_INSTALL) {
      expect(bundled.entries.some((entry) => entry.path === excluded)).toBe(false);
      expect(shippedFiles().some(({ rel }) => rel === excluded)).toBe(false);
    }
    // Present or not, the folder's own contents decide: every installed note is a file that is there.
    const inFolder = new Set(allFilesInShippedFolder());
    for (const entry of bundled.entries) {
      if (entry.kind === 'markdown') expect(inFolder.has(entry.path), entry.path).toBe(true);
    }
    // And a duplicate placed back in the folder is still not installed.
    const manifest = buildWelcomeManifest([
      { path: 'Welcome to Clutter/Get started.md', loadText: async () => 'a' },
      { path: 'Welcome to Clutter/Get started copy.md', loadText: async () => 'a' },
    ]);
    expect(manifest.entries.map((entry) => entry.path)).toEqual(['Welcome to Clutter', 'Welcome to Clutter/Get started.md']);
  });

  it('no two installed notes or markers share a frontmatter id, and every one has an id', () => {
    const parser = new FrontmatterParser();
    const ids = shippedFiles()
      .filter(({ rel }) => rel.endsWith('.md'))
      .map(({ rel, abs }) => ({ rel, id: String(parser.parse(fs.readFileSync(abs, 'utf8')).frontmatter.id ?? '') }));

    expect(ids.filter(({ id }) => id === '')).toEqual([]);
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const { rel, id } of ids) {
      if (seen.has(id)) duplicates.push(`${rel} repeats ${seen.get(id)}`);
      seen.set(id, rel);
    }
    expect(duplicates).toEqual([]);
  });

  it('no installed note points at a local cover file that is not shipped', () => {
    const shipped = new Set(shippedFiles().map(({ rel }) => rel));
    const broken: string[] = [];
    for (const { rel, abs } of shippedFiles().filter(({ rel }) => rel.endsWith('.md'))) {
      const cover = /^cover:\s*(\S.*)$/m.exec(fs.readFileSync(abs, 'utf8').split('\n---')[0] ?? '')?.[1]?.trim();
      if (cover && !/^https?:\/\//.test(cover) && !shipped.has(cover)) broken.push(`${rel} -> ${cover}`);
    }

    expect(broken).toEqual([]);
  });

  it('an image entry, when one is shipped, is read as its exact bytes', async () => {
    const bytes = Uint8Array.of(0xff, 0xd8, 0xff, 0x00, 0x80);
    const manifest = buildWelcomeManifest([{ path: 'Assets/pic.jpg', loadBytes: async () => bytes }]);

    expect(manifest.entries.map((entry) => `${entry.kind}:${entry.path}`)).toEqual(['directory:Assets', 'image:Assets/pic.jpg']);
    const image = manifest.entries[1]!;
    expect(image.kind === 'image' && [...(await image.load())]).toEqual([...bytes]);
  });

  it('puts Templates as the reserved folder, Assets as plain, and a directory before everything in it', () => {
    const byPath = new Map(bundled.entries.map((entry, index) => [entry.path, { entry, index }]));

    expect(byPath.get('Templates')?.entry).toMatchObject({ kind: 'directory', folder: 'reserved' });
    expect(byPath.get('Welcome to Clutter')?.entry).toMatchObject({ kind: 'directory', folder: 'marker' });

    for (const { entry, index } of byPath.values()) {
      const slash = entry.path.lastIndexOf('/');
      if (slash < 0) continue;

      expect(byPath.get(entry.path.slice(0, slash))!.index, entry.path).toBeLessThan(index);
    }
  });
});

describe('plan digest', () => {
  const files = [
    { path: 'A/.folder.md', loadText: async () => 'folder' },
    { path: 'A/note.md', loadText: async () => 'text' },
    { path: 'A/pic.jpg', loadBytes: async () => Uint8Array.of(1, 2, 3) },
  ];

  it('is stable for the same content and differs when any path, note, marker or image byte differs', async () => {
    const base = await buildWelcomeManifest(files).plan();

    expect(await buildWelcomeManifest(files).plan()).toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(await buildWelcomeManifest([{ ...files[0]!, loadText: async () => 'folder!' }, files[1]!, files[2]!]).plan()).not.toBe(base);
    expect(await buildWelcomeManifest([files[0]!, { ...files[1]!, loadText: async () => 'text!' }, files[2]!]).plan()).not.toBe(base);
    expect(await buildWelcomeManifest([files[0]!, files[1]!, { ...files[2]!, loadBytes: async () => Uint8Array.of(1, 2, 4) }]).plan()).not.toBe(base);
    expect(await buildWelcomeManifest([files[0]!, { ...files[1]!, path: 'A/other.md' }, files[2]!]).plan()).not.toBe(base);
  });
});
