import { describe, expect, it } from 'vitest';

import {
  collectAssetReferences,
  collectMarkdownReferences,
  isArchivedAssetReferenced,
  type ArchivedAsset,
} from './archivedAssetReferences';
import type { Folder, Page, VaultResource } from '../../vault/models';

const ROOT = '/vault';

const resource = (id: string, relativePath: string): VaultResource => ({
  id,
  kind: relativePath.endsWith('.pdf') ? 'pdf' : 'image',
  name: relativePath.split('/').pop()!,
  path: `${ROOT}/${relativePath}`,
  parentId: null,
});

/** A page as far as references care: its `![[…]]` embed targets, its Markdown body and its cover. */
const page = (options: { embeds?: string[]; markdown?: string; cover?: string | null } = {}): Page =>
  ({
    analysis: { embeds: (options.embeds ?? []).map((target) => ({ target })) },
    source: { markdown: options.markdown ?? '' },
    metadata: { cover: options.cover ?? null },
  }) as unknown as Page;

const folder = (cover: string | null): Folder => ({ metadata: { cover } }) as unknown as Folder;

const stayingFrom = (...resources: VaultResource[]) => new Map(resources.map((r) => [r.path, r] as const));

/** An archived `Projects/A/logo.png`: sitting in Archive/ now, and found at its original path before. */
const archivedLogo = (): ArchivedAsset => {
  const file = resource('archived', 'Archive/logo.png');
  return { resource: file, paths: [file.path, `${ROOT}/Projects/A/logo.png`] };
};

const referenced = (references: readonly string[], staying = stayingFrom(), asset = archivedLogo()) =>
  isArchivedAssetReferenced({ root: ROOT, references, staying, asset });

describe('collectAssetReferences — every supported form', () => {
  const collect = (pages: Page[] = [], folders: Folder[] = [], avatarSource?: string) =>
    collectAssetReferences({ pages, folders, avatarSource });

  it('reads a ![[path]] embed target, an aliased embed, and a heading-qualified one (the analysis already split them off)', () => {
    expect(collect([page({ embeds: ['Projects/A/logo.png', 'Docs/spec.pdf'] })])).toEqual([
      'Projects/A/logo.png',
      'Docs/spec.pdf',
    ]);
  });

  it('reads a standard ![alt](path) image: with a title, in <angle brackets>, with spaces, percent-encoded', () => {
    const markdown = [
      '![a](Projects/A/logo.png)',
      '![b](Assets/photo.png "A title")',
      '![c](<Assets/my photo.png>)',
      '![d](Assets/my%20photo.png)',
      '![e](./Assets/dot.png)',
    ].join('\n');

    expect(collect([page({ markdown })])).toEqual([
      'Projects/A/logo.png',
      'Assets/photo.png',
      'Assets/my photo.png',
      'Assets/my%20photo.png',
      './Assets/dot.png',
    ]);
  });

  it('reads a note cover, a hidden one too, and a folder cover, and the Space avatar', () => {
    expect(collect([page({ cover: 'Assets/cover.png' })], [folder('Assets/folder-cover.png')], 'Assets/avatar.png')).toEqual([
      'Assets/cover.png',
      'Assets/folder-cover.png',
      'Assets/avatar.png',
    ]);
  });

  it('ignores a reference written inside code, which is text about a reference', () => {
    const markdown = ['```', '![x](Assets/in-code.png)', '```', 'and `![y](Assets/inline.png)`'].join('\n');

    expect(collect([page({ markdown })])).toEqual([]);
  });

  it('leaves out what cannot be a vault file: web addresses and inline data', () => {
    const markdown = '![r](https://example.com/a.png) ![d](data:image/png;base64,AAAA)';

    expect(collect([page({ markdown, cover: 'https://images.unsplash.com/photo' })])).toEqual([]);
  });

  it('lists a reference once, however many notes hold it, and skips blanks', () => {
    expect(
      collect([page({ embeds: ['a.png', '  '] }), page({ embeds: ['a.png'], markdown: '![](a.png)' })])
    ).toEqual(['a.png']);
  });
});

describe('isArchivedAssetReferenced — the rule', () => {
  it('is not referenced when nothing points at it', () => {
    expect(referenced([])).toBe(false);
    expect(referenced(['Projects/A/other.png', 'Assets/unrelated.pdf'])).toBe(false);
  });

  it('is referenced by a reference to the path it came from', () => {
    expect(referenced(['Projects/A/logo.png'])).toBe(true);
  });

  it('is referenced through every written form of that path: ./, percent-encoding', () => {
    expect(referenced(['./Projects/A/logo.png'])).toBe(true);

    const spaced: ArchivedAsset = {
      resource: resource('s', 'Archive/my logo.png'),
      paths: [`${ROOT}/Archive/my logo.png`, `${ROOT}/Projects/A/my logo.png`],
    };
    expect(referenced(['Projects/A/my%20logo.png'], stayingFrom(), spaced)).toBe(true);
    expect(referenced(['Projects/A/my logo.png'], stayingFrom(), spaced)).toBe(true);
  });

  it('is referenced by a reference to where it sits now, inside Archive/ (which still resolves today)', () => {
    expect(referenced(['Archive/logo.png'])).toBe(true);
  });

  it('is NOT protected by a reference that a different, staying file satisfies: a same-named file in another folder', () => {
    const other = resource('b', 'Projects/B/logo.png');

    // `![[Projects/B/logo.png]]` resolves to B, which stays. It says nothing about the archived A.
    expect(referenced(['Projects/B/logo.png'], stayingFrom(other))).toBe(false);
  });

  it('is protected when the same-named reference does not resolve to anything: a bare name cannot be told apart', () => {
    const other = resource('b', 'Projects/B/logo.png');

    // `![[logo.png]]` names no file at the vault root — it could mean A or B, so A is kept.
    expect(referenced(['logo.png'], stayingFrom(other))).toBe(true);
  });

  it('is protected by an unresolved reference with the same file name under any other path, written any way', () => {
    expect(referenced(['Old Folder/logo.png'])).toBe(true);
    expect(referenced(['../Projects/A/logo.png'])).toBe(true);
    expect(referenced(['LOGO.PNG'])).toBe(true);
    expect(referenced(['elsewhere/lo%67o.png'])).toBe(true);
    expect(referenced(['logo.png#anything'])).toBe(true);
  });

  it('is not protected by an unresolved reference to a different file name', () => {
    expect(referenced(['logo.jpg', 'Projects/A/logos.png', 'Projects/A/my-logo.png'])).toBe(false);
  });

  it('is not protected by a reference a staying file at the very same path satisfies (a new file now sits there)', () => {
    const replacement = resource('new', 'Projects/A/logo.png');

    expect(referenced(['Projects/A/logo.png'], stayingFrom(replacement))).toBe(false);
  });

  it('treats a PDF the same as an image', () => {
    const pdf: ArchivedAsset = {
      resource: resource('p', 'Archive/spec.pdf'),
      paths: [`${ROOT}/Archive/spec.pdf`, `${ROOT}/Docs/spec.pdf`],
    };

    expect(referenced(['Docs/spec.pdf'], stayingFrom(), pdf)).toBe(true);
    expect(referenced(['Docs/other.pdf'], stayingFrom(), pdf)).toBe(false);
  });

  it('is referenced if any one of many references names it', () => {
    expect(referenced(['a.png', 'b.png', 'Projects/A/logo.png', 'c.png'])).toBe(true);
  });
});

describe('a same-named file elsewhere never proves a reference is satisfied', () => {
  const stayingB = () => stayingFrom(resource('b', 'Projects/B/logo.png'));

  it.each([
    ['a bare file name', 'logo.png'],
    ['a folder that holds neither', 'Projects/logo.png'],
    ['a path with a dot segment', 'Projects/A/./logo.png'],
    ['a path that climbs out of the other folder', 'Projects/B/../A/logo.png'],
    ['the other folder spelled in another case', 'projects/b/logo.png'],
    ['a made-up folder', 'Somewhere/Else/logo.png'],
  ])('keeps the archived file for %s, with a same-named file staying in Projects/B', (_label, reference) => {
    // `reference` is not the exact path of any file. A same-named B exists, but B's existence says nothing about
    // which one the reference meant: it could be A, so A is kept.
    expect(referenced([reference], stayingB())).toBe(true);
  });

  it('keeps each of two same-named archived files for a bare reference: neither can be told from the other', () => {
    const first = archivedLogo();
    // Archiving the second collided with the first, so Archive/ holds it as "logo 2.png" — a note still says logo.png.
    const second: ArchivedAsset = {
      resource: resource('second', 'Archive/logo 2.png'),
      paths: [`${ROOT}/Archive/logo 2.png`, `${ROOT}/Projects/B/logo.png`],
    };
    const bare = ['logo.png'];

    expect(referenced(bare, stayingFrom(), first)).toBe(true);
    expect(referenced(bare, stayingFrom(), second)).toBe(true);
  });

  it('a file that was renamed on archiving is still found by the name it had, and by the name it has', () => {
    const renamed: ArchivedAsset = {
      resource: resource('r', 'Archive/logo 2.png'),
      paths: [`${ROOT}/Archive/logo 2.png`, `${ROOT}/Projects/B/logo.png`],
    };

    expect(referenced(['Old/logo.png'], stayingFrom(), renamed)).toBe(true);
    expect(referenced(['Old/logo 2.png'], stayingFrom(), renamed)).toBe(true);
    expect(referenced(['Old/logo 3.png'], stayingFrom(), renamed)).toBe(false);
  });

  it('only an EXACT path to the staying file settles a reference: that one does not keep the other file', () => {
    expect(referenced(['Projects/B/logo.png'], stayingB())).toBe(false);
  });

  it('exact-path resolution stays the rule: a name is only ever a reason to keep, so removing the same-named file changes nothing for an unresolved reference', () => {
    expect(referenced(['logo.png'], stayingFrom())).toBe(true);
    expect(referenced(['logo.png'], stayingB())).toBe(true);
  });
});

describe('collectMarkdownReferences — an open note’s live text', () => {
  it('reads embeds (alias and heading split off) and images, as saved notes are read', () => {
    const markdown = ['![[Projects/A/logo.png|logo]]', '![[Docs/spec.pdf#page]]', '![x](Assets/a.png "t")', '![y](<Assets/b c.png>)'].join('\n');

    expect(collectMarkdownReferences([markdown])).toEqual(['Projects/A/logo.png', 'Docs/spec.pdf', 'Assets/a.png', 'Assets/b c.png']);
  });

  it('ignores code, web addresses, plain links and wikilinks', () => {
    const markdown = [
      '`![[in-code.png]]`',
      '![r](https://example.com/a.png)',
      '[Open document](Assets/document.pdf)',
      '[[Some Note]]',
    ].join('\n');

    expect(collectMarkdownReferences([markdown])).toEqual([]);
  });

  it('reads several notes and lists each reference once', () => {
    expect(collectMarkdownReferences(['![[a.png]]', '![[a.png]] ![](b.png)'])).toEqual(['a.png', 'b.png']);
  });
});

describe('plain Markdown links are not asset references (ADR-039)', () => {
  it('a [text](file) link to a vault file is not collected: Clutter opens such a link externally and never resolves it to a file', () => {
    const markdown = 'See [Open document](Assets/document.pdf) and [the logo](Projects/A/logo.png).';

    expect(collectAssetReferences({ pages: [page({ markdown })], folders: [] })).toEqual([]);
    expect(collectMarkdownReferences([markdown])).toEqual([]);
  });

  it('an image wrapped in a link still counts: the image is a reference even though the link is not', () => {
    const markdown = '[![logo](Projects/A/logo.png)](https://example.com)';

    expect(collectAssetReferences({ pages: [page({ markdown })], folders: [] })).toEqual(['Projects/A/logo.png']);
  });
});
