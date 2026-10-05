import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Architecture guards for the collection layer, checked against the source
 * itself: the generic presentation components stay domain-free, every
 * collection (notes, folders, assets) reaches them only through a mapper
 * function, each component owns only its own CSS, and there is one
 * activation behavior.
 *
 *   Domain -> mapper (note/ folder/ asset/) -> generic components
 *                                              (grid/ card/ row/ list/ table/ media/ scale/)
 */
const COMPONENTS = dirname(fileURLToPath(import.meta.url));
const SRC = join(COMPONENTS, '..', '..', '..');
const GENERIC_DIRS = ['grid', 'card', 'row', 'list', 'table', 'media', 'scale'];
const DOMAIN_DIRS = ['note', 'folder', 'asset'];

function filesOf(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return filesOf(path, pattern);
    }
    return pattern.test(name) ? [path] : [];
  });
}

/** Code only: comments are free to *name* things. */
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const importsOf = (text: string) => [...text.matchAll(/(?:from|import)\s+'([^']+)'/g)].map((m) => m[1]!);
const read = (path: string) => strip(readFileSync(join(SRC, path), 'utf8'));

const sourcesIn = (dirs: string[]) =>
  dirs
    .flatMap((dir) => filesOf(join(COMPONENTS, dir), /\.(ts|tsx)$/))
    .filter((path) => !/\.test\.tsx?$/.test(path))
    .map((path) => ({ rel: relative(COMPONENTS, path), text: strip(readFileSync(path, 'utf8')) }));
const GENERIC = sourcesIn(GENERIC_DIRS);
const DOMAIN = sourcesIn(DOMAIN_DIRS);
const STYLESHEETS = GENERIC_DIRS.flatMap((dir) => filesOf(join(COMPONENTS, dir), /\.css$/)).map((path) => ({
  rel: relative(COMPONENTS, path),
  text: readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
}));
const ALL_SRC = filesOf(SRC, /\.(ts|tsx)$/)
  .filter((path) => !/\.test\.tsx?$/.test(path))
  .map((path) => ({ rel: relative(SRC, path), text: strip(readFileSync(path, 'utf8')) }));

const FORBIDDEN_IN_GENERIC =
  /^@core(\/|$)|^@app(\/|$)|^@features\/(notes|tasks|markdown|pdf)(\/|$)|(^|\/)(note|asset|folder|page|view)(\/|$)/;

describe('the generic collection components are domain-free', () => {
  it('finds the components it is guarding', () => {
    expect(GENERIC.length).toBeGreaterThan(10);
    expect(DOMAIN.length).toBeGreaterThan(8);
    expect(STYLESHEETS.length).toBeGreaterThan(8);
  });

  it('import nothing domain-specific: @core, @app, note/asset/folder/page/view, notes/tasks/markdown/pdf', () => {
    const offenders = GENERIC.flatMap((file) =>
      importsOf(file.text)
        .filter((spec) => FORBIDDEN_IN_GENERIC.test(spec))
        .map((spec) => `${file.rel} -> ${spec}`)
    );

    expect(offenders).toEqual([]);
  });

  it('only reach outside themselves for shared primitives (@shared/icon, @shared/interaction) and React', () => {
    const outside = GENERIC.flatMap((file) =>
      importsOf(file.text)
        .filter((spec) => !spec.startsWith('.') && spec !== 'react')
        .map((spec) => ({ file: file.rel, spec }))
    );

    expect(outside.filter(({ spec }) => !/^@shared\/(icon|interaction)$/.test(spec))).toEqual([]);
  });

  it('are never imported back by the page models or the view layer (dependencies point down)', () => {
    const offenders = ALL_SRC.filter(
      (file) =>
        /^features\/collection\/(page|view)\//.test(file.rel) &&
        importsOf(file.text).some((spec) => /collection\/components\/(grid|card|row|list|table|media|scale)\//.test(spec))
    ).map((file) => file.rel);

    expect(offenders).toEqual([]);
  });
});

describe('every collection reaches the generic components through mappers, not components of its own', () => {
  it('note/, folder/ and asset/ define no card, row, list, table, cell or grid component', () => {
    // NotePreviewCard is the one exception: the floating WikiLink hover preview, which is not a collection card.
    // (A `to*Row` / `to*CardProps` file is a mapper function, not a component: component files are PascalCase.)
    const perType = DOMAIN.filter((file) => /(^|\/)(?!to[A-Z])[A-Z]\w*(Card|Row|List|Table|Cell|Grid)\.tsx$/.test(file.rel))
      .map((file) => file.rel)
      .filter((rel) => rel !== 'note/preview/NotePreviewCard.tsx');

    expect(perType).toEqual([]);
  });

  it('the domain folders do not import each other', () => {
    const offenders = DOMAIN.flatMap((file) => {
      const own = file.rel.split('/')[0]!;
      return importsOf(file.text)
        .filter((spec) => DOMAIN_DIRS.some((dir) => dir !== own && new RegExp(`(^|/)${dir}/`).test(spec)))
        .map((spec) => `${file.rel} -> ${spec}`);
    });

    expect(offenders).toEqual([]);
  });

  it('the notes, assets and archive bodies render their lists, tables and cards with the same generic components', () => {
    const uses = (path: string, spec: string) => importsOf(read(path)).includes(spec);
    const generic = (name: string) => `@features/collection/components/${name}`;

    for (const body of ['app/layouts/page/body/CollectionBody.tsx', 'app/layouts/page/body/AssetsCollectionBody.tsx']) {
      expect(uses(body, generic('list/CollectionDataList')), body).toBe(true);
      expect(uses(body, generic('table/CollectionDataTable')), body).toBe(true);
      expect(uses(body, generic('grid/CollectionGrid')), body).toBe(true);
      expect(uses(body, generic('card/CollectionCard')), body).toBe(true);
    }

    // The Archive renders its folders and notes through CollectionBody's own helpers — no second implementation.
    const archive = read('app/layouts/page/body/ArchiveCollectionBody.tsx');
    expect(archive).toContain('renderFolderGrid(');
    expect(archive).toContain('renderNoteTable(');
    expect(archive).toContain('renderNoteList(');
    expect(importsOf(archive).filter((spec) => /collection\/components\/(grid|card|row|list|table)\//.test(spec))).toEqual([]);
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
    const assetFiles = ALL_SRC.filter(
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
    const consumers = ALL_SRC.filter(
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

describe('the collection components share one activation behavior', () => {
  it('the Enter/Space → click dispatch and the nested-control guard live only in @shared/interaction', () => {
    const copies = ALL_SRC.filter((file) => /currentTarget\.click\(\)|button, a, input, select/.test(file.text))
      .map((file) => file.rel)
      .filter((rel) => !rel.startsWith('shared/interaction/'));

    expect(copies).toEqual([]);
  });

  it('every component that takes an onClick builds its interaction with buildActivationProps', () => {
    for (const rel of ['card/CollectionCard.tsx', 'row/CollectionRow.tsx', 'table/CollectionTableRow.tsx']) {
      const file = GENERIC.find((candidate) => candidate.rel === rel)!;
      expect(importsOf(file.text), rel).toContain('@shared/interaction');
      expect(file.text, rel).toContain('buildActivationProps');
    }
  });
});

describe('the generic collection components own only their own CSS', () => {
  // Each stylesheet's root class; every class in it must be that root or its __element / --modifier.
  const OWN: Record<string, string> = {
    'grid/CollectionGrid.css': 'collection-grid',
    'card/CollectionCard.css': 'collection-card',
    'card/CardTitleSection.css': 'card-title-section',
    'row/CollectionRow.css': 'collection-row',
    'list/CollectionDataList.css': 'collection-list',
    'table/CollectionTable.css': 'collection-table',
    'table/CollectionTableRow.css': 'collection-table-row',
    'table/cells/CollectionTableCell.css': 'collection-table-cell',
    'media/CollectionMedia.css': 'collection-media',
    'media/CollectionImage.css': 'collection-image',
    'scale/ScaledCanvas.css': 'scaled-canvas',
  };

  it('has a declared owner for every stylesheet', () => {
    expect(STYLESHEETS.map((sheet) => sheet.rel).sort()).toEqual(Object.keys(OWN).sort());
  });

  it('every class in a stylesheet belongs to that component — no descendant selector reaches into another', () => {
    const offenders: string[] = [];
    for (const sheet of STYLESHEETS) {
      const own = new RegExp(`^${OWN[sheet.rel]!}(__[a-z-]+)?(--[a-z-]+)?$`);
      // Only selector text (before `{`), not declaration values.
      const selectors = [...sheet.text.matchAll(/([^{}]+)\{/g)].map((match) => match[1]!);
      for (const selector of selectors) {
        for (const [, name] of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
          if (!own.test(name!)) {
            offenders.push(`${sheet.rel}: .${name}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('never use margin (CLAUDE.md)', () => {
    const offenders = STYLESHEETS.filter((sheet) => /(^|[\s;{])margin(-[a-z]+)?\s*:/.test(sheet.text)).map(
      (sheet) => sheet.rel
    );

    expect(offenders).toEqual([]);
  });
});
