import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Architecture guards for the collection layer, checked against the source
 * itself: the Assets collection plugs into the shared collection
 * infrastructure instead of growing a mini collection architecture of its own.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Code only: comments are free to *name* the shared pieces they rely on. */
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (path: string) => stripComments(readFileSync(join(SRC, path), 'utf8'));
const ALL = sourceFiles(SRC).map((path) => ({
  rel: relative(SRC, path),
  text: stripComments(readFileSync(path, 'utf8')),
}));
const importsOf = (text: string) => [...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);

describe('Assets use the shared collection infrastructure', () => {
  it('AssetCard shares the card shell with NoteCard and imports nothing note-specific', () => {
    const asset = read('features/collection/components/asset/card/AssetCard.tsx');
    const note = read('features/collection/components/note/card/NoteCard.tsx');

    expect(importsOf(asset)).toContain('../../card/CollectionCard');
    expect(importsOf(note)).toContain('../../card/CollectionCard');
    for (const forbidden of ['NoteCard', 'DocumentPreview', 'renderMarkdownBlocks', 'extractPreviewBlocks', '/note/']) {
      expect(importsOf(asset).filter((spec) => spec.includes(forbidden))).toEqual([]);
    }
    // ...and the reverse: NoteCard never reaches into assets.
    expect(importsOf(note).filter((spec) => spec.includes('/asset/'))).toEqual([]);
  });

  it('nothing under features/collection/components/asset imports from the note components', () => {
    const offenders = ALL.filter(
      (file) =>
        file.rel.startsWith('features/collection/components/asset/') &&
        importsOf(file.text).some((spec) => /\/note\/|NoteCard|NoteList|NoteTable/.test(spec))
    ).map((file) => file.rel);

    expect(offenders).toEqual([]);
  });

  it('notes and assets render their lists, tables and cards with the same generic layers', () => {
    const uses = (path: string, spec: string) => importsOf(read(path)).includes(spec);

    expect(uses('features/collection/components/note/list/NoteList.tsx', '../../list/CollectionListRow')).toBe(true);
    expect(uses('features/collection/components/asset/list/AssetList.tsx', '../../list/CollectionListRow')).toBe(true);
    expect(uses('features/collection/components/note/table/NoteTableRow.tsx', '../../table/CollectionTableRow')).toBe(true);
    expect(uses('features/collection/components/asset/table/AssetTableRow.tsx', '../../table/CollectionTableRow')).toBe(true);
    expect(uses('features/collection/components/note/table/NoteTable.tsx', '../../table/CollectionTable')).toBe(true);
    expect(uses('app/layouts/page/body/AssetsCollectionBody.tsx', '@features/collection/components/table/CollectionTable')).toBe(true);
    expect(uses('features/collection/components/note/card/NoteCardGrid.tsx', '../../card/CollectionCardGrid')).toBe(true);
    expect(uses('app/layouts/page/body/AssetsCollectionBody.tsx', '@features/collection/components/card/CollectionCardGrid')).toBe(true);
    expect(uses('app/layouts/page/body/AssetsCollectionBody.tsx', '@features/collection/components/list/CollectionListGrid')).toBe(true);
  });

  it('the Assets body defines no Add, Settings, view-mode or header controls of its own', () => {
    const body = read('app/layouts/page/body/AssetsCollectionBody.tsx');

    for (const forbidden of [
      'CollectionViewMenu',
      'CollectionHeaderActions',
      'Button',
      'aria-label="New"',
      'Add asset',
      'plugin-dialog',
      'titleActions',
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('no Asset-specific component re-implements Add / Settings / View mode / the collection header', () => {
    const assetFiles = ALL.filter(
      (file) =>
        file.rel.startsWith('features/collection/components/asset/') ||
        file.rel === 'app/layouts/page/body/AssetsCollectionBody.tsx'
    );
    expect(assetFiles.length).toBeGreaterThan(0);

    for (const file of assetFiles) {
      expect(file.text, file.rel).not.toMatch(/CollectionViewMenu|CollectionHeaderActions|aria-label="(New|Add)|titleActions|Settings/);
    }
  });

  it('CollectionViewMenu has exactly one consumer outside tests — the shared CollectionHeaderActions', () => {
    const consumers = ALL.filter(
      (file) => file.rel !== 'app/layouts/page/body/CollectionViewMenu.tsx' && /CollectionViewMenu/.test(file.text)
    )
      .filter((file) => importsOf(file.text).some((spec) => spec.endsWith('CollectionViewMenu')))
      .map((file) => file.rel);

    expect(consumers).toEqual(['app/layouts/page/body/CollectionHeaderActions.tsx']);
  });

  it('PageHost gives notes AND assets their header controls through the one renderCollectionHeaderActions', () => {
    const pageHost = read('app/layouts/page/PageHost.tsx');
    const uses = pageHost.match(/renderCollectionHeaderActions\(/g) ?? [];

    // folder + Workspace/Favorites/Tag + Assets (the definition is `renderCollectionHeaderActions = (`)
    expect(uses).toHaveLength(3);
    expect(pageHost).toMatch(/renderCollectionHeaderActions\(\{\s*onAdd: onAddAsset,\s*addLabel: 'Add asset'/);
    expect(pageHost).not.toMatch(/<CollectionViewMenu/);
    expect(pageHost).not.toMatch(/aria-label="New"/);
  });
});
