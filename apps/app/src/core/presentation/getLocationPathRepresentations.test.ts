import { describe, expect, it } from 'vitest';
import {
  buildLocationActionMenuItems,
  getLocationPathRepresentations,
  pickLocationPathRepresentation,
} from './getLocationPathRepresentations';

const VAULT_ROOT = '/Users/me/Documents/Clutter/Vault';

describe('getLocationPathRepresentations — resource', () => {
  it('derives all three representations for a top-level resource', () => {
    const result = getLocationPathRepresentations(
      { path: `${VAULT_ROOT}/Assets/image.png` },
      'resource',
      VAULT_ROOT
    );

    expect(result).toEqual({
      atVault: 'Assets/image.png',
      fullPath: `${VAULT_ROOT}/Assets/image.png`,
      asMarkdown: '![[Assets/image.png]]',
    });
  });

  it('derives all three representations for a nested resource', () => {
    const result = getLocationPathRepresentations(
      { path: `${VAULT_ROOT}/Projects/Website/assets/hero.png` },
      'resource',
      VAULT_ROOT
    );

    expect(result).toEqual({
      atVault: 'Projects/Website/assets/hero.png',
      fullPath: `${VAULT_ROOT}/Projects/Website/assets/hero.png`,
      asMarkdown: '![[Projects/Website/assets/hero.png]]',
    });
  });

  it('keeps the extension in the Markdown embed target — a resource is never de-extensioned', () => {
    const result = getLocationPathRepresentations(
      { path: `${VAULT_ROOT}/Reports/spec.pdf` },
      'resource',
      VAULT_ROOT
    );

    expect(result.asMarkdown).toBe('![[Reports/spec.pdf]]');
  });
});

describe('getLocationPathRepresentations — page (note/daily note)', () => {
  it('produces a WikiLink target, vault-relative with the extension stripped', () => {
    const result = getLocationPathRepresentations(
      { path: `${VAULT_ROOT}/Projects/Roadmap.md` },
      'page',
      VAULT_ROOT
    );

    expect(result).toEqual({
      atVault: 'Projects/Roadmap.md',
      fullPath: `${VAULT_ROOT}/Projects/Roadmap.md`,
      asMarkdown: '[[Projects/Roadmap]]',
    });
  });

  it('produces a WikiLink target for a Daily Note the same way — same Page shape', () => {
    const result = getLocationPathRepresentations(
      { path: `${VAULT_ROOT}/Daily Notes/2026/September/2026-09-03.md` },
      'page',
      VAULT_ROOT
    );

    expect(result.asMarkdown).toBe('[[Daily Notes/2026/September/2026-09-03]]');
  });
});

describe('getLocationPathRepresentations — folder', () => {
  it('has no Markdown representation', () => {
    const result = getLocationPathRepresentations(
      { path: `${VAULT_ROOT}/Projects` },
      'folder',
      VAULT_ROOT
    );

    expect(result).toEqual({
      atVault: 'Projects',
      fullPath: `${VAULT_ROOT}/Projects`,
      asMarkdown: null,
    });
  });
});

describe('pickLocationPathRepresentation', () => {
  const representations = getLocationPathRepresentations(
    { path: `${VAULT_ROOT}/Assets/image.png` },
    'resource',
    VAULT_ROOT
  );

  it('picks atVault for at-vault', () => {
    expect(pickLocationPathRepresentation(representations, 'at-vault')).toBe(
      'Assets/image.png'
    );
  });

  it('picks fullPath for full-path', () => {
    expect(pickLocationPathRepresentation(representations, 'full-path')).toBe(
      `${VAULT_ROOT}/Assets/image.png`
    );
  });

  it('picks asMarkdown for as-markdown', () => {
    expect(pickLocationPathRepresentation(representations, 'as-markdown')).toBe(
      '![[Assets/image.png]]'
    );
  });

  it('returns null for as-markdown on a folder', () => {
    const folderRepresentations = getLocationPathRepresentations(
      { path: `${VAULT_ROOT}/Projects` },
      'folder',
      VAULT_ROOT
    );

    expect(
      pickLocationPathRepresentation(folderRepresentations, 'as-markdown')
    ).toBeNull();
  });
});

describe('buildLocationActionMenuItems', () => {
  it('includes Reveal in Finder and a Copy path submenu with all three leaves for page/resource kinds', () => {
    for (const kind of ['page', 'resource'] as const) {
      const items = buildLocationActionMenuItems(kind);

      expect(items.map((item) => item.id)).toEqual(['reveal-in-finder', 'copy-path']);
      const copyPath = items.find((item) => item.id === 'copy-path');
      expect(copyPath?.submenu?.map((leaf) => leaf.id)).toEqual([
        'copy-path-at-vault',
        'copy-path-full-path',
        'copy-path-as-markdown',
      ]);
    }
  });

  it('omits the As Markdown leaf for folder', () => {
    const items = buildLocationActionMenuItems('folder');
    const copyPath = items.find((item) => item.id === 'copy-path');

    expect(copyPath?.submenu?.map((leaf) => leaf.id)).toEqual([
      'copy-path-at-vault',
      'copy-path-full-path',
    ]);
  });
});
