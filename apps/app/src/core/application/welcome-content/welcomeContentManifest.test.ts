import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildWelcomeManifest,
  bundledWelcomeManifest,
  type WelcomeEntry,
} from './welcomeContentManifest';
import { nodeShippedManifest, shippedFiles, SHIPPED_SOURCE_ROOT } from './welcomeContentTestRig';

const bundled = bundledWelcomeManifest(async (url) => {
  // The bundler hands the image over as a URL; tests read the same file straight from disk.
  const name = decodeURIComponent(url.split('/').pop() ?? '');
  const file = shippedFiles().find(({ rel }) => rel.endsWith(name.replace(/^\//, '')));
  if (!file) throw new Error(`no shipped file for ${url}`);

  return new Uint8Array(fs.readFileSync(file.abs));
});

const paths = (entries: readonly WelcomeEntry[]) => entries.map((entry) => `${entry.kind}:${entry.path}`);

describe('bundled welcome manifest (ADR-067)', () => {
  it('holds exactly the shipped content: 4 directories, 22 notes, 1 image, and nothing else', () => {
    const kinds = bundled.entries.reduce<Record<string, number>>((count, entry) => {
      count[entry.kind] = (count[entry.kind] ?? 0) + 1;

      return count;
    }, {});

    expect(kinds).toEqual({ directory: 4, markdown: 22, image: 1 });
    expect(bundled.entries.some((entry) => entry.path.includes('.DS_Store'))).toBe(false);
    expect(bundled.entries.some((entry) => entry.path.endsWith('.folder.md'))).toBe(false);
  });

  it('is identical to what is on disk: the bundler glob drops and adds nothing', () => {
    expect(paths(bundled.entries)).toEqual(paths(nodeShippedManifest().entries));
  });

  it('keeps both .folder.md files, on their directories, byte for byte', async () => {
    const markers = bundled.entries.filter((entry) => entry.kind === 'directory' && entry.loadMarker);

    expect(markers.map((entry) => entry.path)).toEqual(['Welcome to Clutter', 'Welcome to Clutter/Markdown essentials']);
    for (const entry of markers) {
      if (entry.kind !== 'directory' || !entry.loadMarker) continue;
      const source = fs.readFileSync(`${SHIPPED_SOURCE_ROOT}/${entry.path}/.folder.md`);

      expect(Buffer.compare(Buffer.from(await entry.loadMarker(), 'utf8'), source)).toBe(0);
    }
  });

  it('reads every note as text and the image as its exact bytes, with the shipped paths', async () => {
    for (const entry of bundled.entries) {
      if (entry.kind === 'markdown') {
        const source = fs.readFileSync(`${SHIPPED_SOURCE_ROOT}/${entry.path}`);

        expect(Buffer.compare(Buffer.from(await entry.load(), 'utf8'), source), entry.path).toBe(0);
      } else if (entry.kind === 'image') {
        const source = fs.readFileSync(`${SHIPPED_SOURCE_ROOT}/${entry.path}`);

        expect(entry.path).toBe('Assets/Typewritter.jpg');
        expect(Buffer.compare(Buffer.from(await entry.load()), source)).toBe(0);
      }
    }
  });

  it('puts Templates as the reserved folder, Assets as plain, and a directory before everything in it', () => {
    const byPath = new Map(bundled.entries.map((entry, index) => [entry.path, { entry, index }]));

    expect(byPath.get('Templates')?.entry).toMatchObject({ kind: 'directory', folder: 'reserved' });
    expect(byPath.get('Assets')?.entry).toMatchObject({ kind: 'directory', folder: 'plain' });
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
