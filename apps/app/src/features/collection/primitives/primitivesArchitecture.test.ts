import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Guards for the generic Collection primitives (this directory): they stay
 * domain-free, own only their own CSS, and share one activation behavior.
 * Checked against the source itself.
 */
const ROOT = dirname(fileURLToPath(import.meta.url));
const GENERIC_DIRS = ['grid', 'card', 'row', 'list', 'table', 'media', 'scale'];

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return files(path, pattern);
    }
    return pattern.test(name) ? [path] : [];
  });
}

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const importsOf = (text: string) =>
  [...text.matchAll(/(?:from|import)\s+'([^']+)'/g)].map((match) => match[1]!);

const SOURCES = GENERIC_DIRS.flatMap((dir) => files(join(ROOT, dir), /\.(ts|tsx)$/))
  .filter((path) => !/\.test\.tsx?$/.test(path))
  .map((path) => ({ rel: relative(ROOT, path), text: strip(readFileSync(path, 'utf8')) }));
const STYLESHEETS = GENERIC_DIRS.flatMap((dir) => files(join(ROOT, dir), /\.css$/)).map((path) => ({
  rel: relative(ROOT, path),
  text: readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
}));

const FORBIDDEN_IMPORT =
  /^@core(\/|$)|^@app(\/|$)|^@features\/(notes|tasks|markdown|pdf)(\/|$)|(^|\/)(note|asset|folder|page|view)(\/|$)/;

describe('the Collection primitives are domain-free', () => {
  it('finds the primitives it is guarding', () => {
    expect(SOURCES.length).toBeGreaterThan(10);
    expect(STYLESHEETS.length).toBeGreaterThan(5);
  });

  it('import nothing domain-specific: @core, @app, note/asset/folder/page/view, notes/tasks/markdown/pdf', () => {
    const offenders = SOURCES.flatMap((file) =>
      importsOf(file.text)
        .filter((spec) => FORBIDDEN_IMPORT.test(spec))
        .map((spec) => `${file.rel} -> ${spec}`)
    );

    expect(offenders).toEqual([]);
  });

  it('do not import the live Collection implementation', () => {
    const offenders = SOURCES.flatMap((file) =>
      importsOf(file.text)
        .filter((spec) =>
          /collection\/components\/|CollectionEntry|CollectionBody|NoteCard|FolderCard|AssetCard|CollectionListRow/.test(spec)
        )
        .map((spec) => `${file.rel} -> ${spec}`)
    );

    expect(offenders).toEqual([]);
  });

  it('only reach outside themselves for shared primitives (@shared/icon, @shared/interaction) and React', () => {
    const outside = SOURCES.flatMap((file) =>
      importsOf(file.text)
        .filter((spec) => !spec.startsWith('.') && spec !== 'react')
        .map((spec) => ({ file: file.rel, spec }))
    );

    expect(outside.filter(({ spec }) => !/^@shared\/(icon|interaction)$/.test(spec))).toEqual([]);
  });

  it('are not imported by the live Collection implementation (the two are parallel)', () => {
    const liveRoot = join(ROOT, '..', 'components');
    const offenders = files(liveRoot, /\.(ts|tsx)$/)
      .filter((path) => /primitives\//.test(strip(readFileSync(path, 'utf8'))))
      .map((path) => relative(ROOT, path));

    expect(offenders).toEqual([]);
  });
});

describe('the Collection primitives share one activation behavior', () => {
  it('none re-implements it: the Enter/Space → click dispatch and the nested-control guard live in @shared/interaction', () => {
    const copies = SOURCES.filter((file) => /currentTarget\.click\(\)|button, a, input/.test(file.text)).map(
      (file) => file.rel
    );

    expect(copies).toEqual([]);
  });

  it('every primitive that takes an onClick builds its interaction with buildActivationProps', () => {
    for (const rel of ['card/CollectionCard.tsx', 'row/CollectionRow.tsx', 'table/CollectionTableRow.tsx']) {
      const file = SOURCES.find((candidate) => candidate.rel === rel)!;
      expect(importsOf(file.text), rel).toContain('@shared/interaction');
      expect(file.text, rel).toContain('buildActivationProps');
    }
  });
});

describe('the Collection primitives own only their own CSS', () => {
  // Each stylesheet's root class; every class in it must be that root or its __element / --modifier.
  const OWN: Record<string, string> = {
    'grid/CollectionGrid.css': 'cx-collection-grid',
    'card/CollectionCard.css': 'cx-collection-card',
    'card/CardTitleSection.css': 'cx-card-title-section',
    'row/CollectionRow.css': 'cx-collection-row',
    'list/CollectionDataList.css': 'cx-collection-list',
    'table/CollectionTable.css': 'cx-collection-table',
    'table/CollectionTableRow.css': 'cx-collection-table-row',
    'table/cells/CollectionTableCell.css': 'cx-collection-table-cell',
    'media/CollectionMedia.css': 'cx-collection-media',
    'media/CollectionImage.css': 'cx-collection-image',
    'scale/ScaledCanvas.css': 'cx-scaled-canvas',
  };

  it('has a declared owner for every stylesheet', () => {
    expect(STYLESHEETS.map((sheet) => sheet.rel).sort()).toEqual(Object.keys(OWN).sort());
  });

  it('every class in a stylesheet belongs to that component — no descendant selector reaches into another', () => {
    const offenders: string[] = [];
    for (const sheet of STYLESHEETS) {
      const root = OWN[sheet.rel]!;
      const own = new RegExp(`^${root}(__[a-z-]+)?(--[a-z-]+)?$`);
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

  it('use the temporary cx- prefix, so they cannot restyle the live Collection', () => {
    const live = STYLESHEETS.flatMap((sheet) =>
      [...sheet.text.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!).filter((name) => !name.startsWith('cx-'))
    );

    expect(live).toEqual([]);
  });

  it('never use margin (CLAUDE.md)', () => {
    const offenders = STYLESHEETS.filter((sheet) => /(^|[\s;{])margin(-[a-z]+)?\s*:/.test(sheet.text)).map(
      (sheet) => sheet.rel
    );

    expect(offenders).toEqual([]);
  });
});
