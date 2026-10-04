import { describe, expect, it } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { Page } from '@core/vault/models/Page';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';

import { createEmbedSuggester } from './embedSuggestions';

const ROOT = '/vault';

function makeVault(resources: VaultResource[], pages: Page[] = []): Vault {
  return new Vault(
    ROOT,
    pages,
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
}

function makeResource(
  id: string,
  path: string,
  kind: VaultResource['kind'] = 'image',
  parentId: string | null = null
): VaultResource {
  return {
    id,
    kind,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
  };
}

/**
 * Fakes only the one method createEmbedSuggester actually calls — the same
 * "fake just what's used" convention wikiLinkSuggestions.test.ts's own
 * fakePageOperations/fakeFolderOperations already establish.
 */
function fakeMembershipSelector(resources: VaultResource[]): MembershipSelector {
  return { getAllVisibleResources: () => resources } as unknown as MembershipSelector;
}

describe('createEmbedSuggester — empty query', () => {
  it('returns every visible resource when the query is empty (a freshly typed ![[)', () => {
    const resources = [
      makeResource('r1', `${ROOT}/hero.png`),
      makeResource('r2', `${ROOT}/Projects/plan.pdf`, 'pdf'),
    ];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    const result = suggest('');

    expect(result).toHaveLength(2);
  });

  it('returns nothing when there are no visible resources', () => {
    const vault = makeVault([]);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector([]));

    expect(suggest('')).toEqual([]);
  });
});

describe('createEmbedSuggester — filename filtering', () => {
  it('filters by a bare filename substring', () => {
    const resources = [
      makeResource('r1', `${ROOT}/hero.png`),
      makeResource('r2', `${ROOT}/manual.pdf`, 'pdf'),
    ];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    const result = suggest('hero');

    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('hero.png');
  });

  it('is case-insensitive', () => {
    const resources = [makeResource('r1', `${ROOT}/Hero.png`)];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    expect(suggest('HERO')).toHaveLength(1);
  });

  it('matches a substring anywhere in the filename, not only a prefix', () => {
    const resources = [makeResource('r1', `${ROOT}/my-hero-shot.png`)];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    expect(suggest('hero')).toHaveLength(1);
  });
});

describe('createEmbedSuggester — folder-qualified filtering', () => {
  it('a bare folder-prefix query shows every resource under that folder', () => {
    const resources = [
      makeResource('r1', `${ROOT}/Projects/hero.png`, 'image', 'folder-projects'),
      makeResource('r2', `${ROOT}/Projects/plan.pdf`, 'pdf', 'folder-projects'),
      makeResource('r3', `${ROOT}/Other/thing.png`, 'image', 'folder-other'),
    ];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    const result = suggest('Projects/');

    expect(result.map((r) => r.path).sort()).toEqual(['Projects/hero.png', 'Projects/plan.pdf']);
  });

  it('a folder-qualified query filters further by filename within that folder', () => {
    const resources = [
      makeResource('r1', `${ROOT}/Projects/hero.png`, 'image', 'folder-projects'),
      makeResource('r2', `${ROOT}/Projects/plan.pdf`, 'pdf', 'folder-projects'),
    ];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    const result = suggest('Projects/hero');

    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('Projects/hero.png');
  });
});

describe('createEmbedSuggester — duplicate filenames', () => {
  it('exposes distinguishing breadcrumb information for resources sharing a filename', () => {
    const resources = [
      makeResource('r1', `${ROOT}/Assets/logo.png`, 'image', 'folder-assets'),
      makeResource('r2', `${ROOT}/Projects/A/logo.png`, 'image', 'folder-a'),
      makeResource('r3', `${ROOT}/Projects/B/logo.png`, 'image', 'folder-b'),
    ];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    const result = suggest('logo');

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.breadcrumb).sort()).toEqual(['Assets', 'Projects/A', 'Projects/B']);
    // Insertion must always use the actual vault-relative path, never a
    // display-only shorthand — each suggestion's own `path` is exactly
    // what gets inserted (embedCompletionSource.ts's apply()).
    expect(result.map((r) => r.path).sort()).toEqual([
      'Assets/logo.png',
      'Projects/A/logo.png',
      'Projects/B/logo.png',
    ]);
  });

  it('a root-level resource has a null breadcrumb', () => {
    const resources = [makeResource('r1', `${ROOT}/hero.png`)];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    expect(suggest('')[0]?.breadcrumb).toBeNull();
  });
});

describe('createEmbedSuggester — suggestion shape', () => {
  it('titles a suggestion with the extension-free display name, while path keeps the real extension', () => {
    const resources = [makeResource('r1', `${ROOT}/Projects/hero.png`, 'image', 'folder-projects')];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    const result = suggest('')[0];

    expect(result?.title).toBe('hero');
    expect(result?.path).toBe('Projects/hero.png');
  });

  it('carries the resource kind through for icon selection, never re-derived from the filename extension', () => {
    const resources = [makeResource('r1', `${ROOT}/spec.pdf`, 'pdf')];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    const first = suggest('')[0];
    expect(first?.kind === 'resource' && first.resourceKind).toBe('pdf');
  });

  it('never scans the filesystem — sources exclusively from the injected MembershipSelector', () => {
    const resources = [makeResource('r1', `${ROOT}/hero.png`)];
    const vault = makeVault(resources);
    let callCount = 0;
    const membershipSelector = {
      getAllVisibleResources: () => {
        callCount += 1;
        return resources;
      },
    } as unknown as MembershipSelector;

    createEmbedSuggester(vault, membershipSelector)('hero');

    expect(callCount).toBe(1);
  });
});

describe('createEmbedSuggester — preview URL for the popup thumbnail', () => {
  it('gives each resource a loadable URL for its own file when a resolver is supplied', () => {
    const resources = [makeResource('r1', `${ROOT}/hero.png`), makeResource('r2', `${ROOT}/Projects/plan.pdf`, 'pdf')];
    const suggest = createEmbedSuggester(makeVault(resources), fakeMembershipSelector(resources), (path) => `app://${path}`);

    expect(
      suggest('').map((s) => [s.path, s.kind === 'resource' ? s.previewUrl : undefined])
    ).toEqual([
      ['hero.png', 'app:///vault/hero.png'],
      ['Projects/plan.pdf', 'app:///vault/Projects/plan.pdf'],
    ]);
  });

  it('has no preview URL without a resolver', () => {
    const resources = [makeResource('r1', `${ROOT}/hero.png`)];
    const suggest = createEmbedSuggester(makeVault(resources), fakeMembershipSelector(resources));

    expect(suggest('')[0]).not.toHaveProperty('previewUrl');
  });
});

const pageMetadata = {
  icon: null,
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  description: '',
  favorite: false,
  status: 'active' as const,
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

function makePage(path: string, type: Page['type'] = 'note', id = path): Page {
  return {
    id,
    type,
    path: `${ROOT}/${path}`,
    name: path.slice(path.lastIndexOf('/') + 1),
    parentId: null,
    metadata: pageMetadata,
    source: { markdown: '' },
    analysis: { headings: [], aliases: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
  } as unknown as Page;
}

describe('createEmbedSuggester — notes and Daily Notes alongside assets', () => {
  const resources = [makeResource('r1', `${ROOT}/hero.png`), makeResource('r2', `${ROOT}/Projects/plan.pdf`, 'pdf')];
  const pages = [
    makePage('My Project Notes.md'),
    makePage('Projects/Roadmap.md'),
    makePage('2026-08-24.md', 'daily-note'),
    makePage('2026-07-02.md', 'daily-note'),
  ];
  const suggest = (query: string, isArchived?: (page: Page) => boolean) =>
    createEmbedSuggester(makeVault(resources, pages), fakeMembershipSelector(resources), undefined, isArchived)(query);
  const paths = (query: string, isArchived?: (page: Page) => boolean) => suggest(query, isArchived).map((s) => s.path);

  it('a freshly typed ![[ offers images and PDFs, then notes, then Daily Notes', () => {
    expect(suggest('').map((s) => [s.kind, s.path])).toEqual([
      ['resource', 'hero.png'],
      ['resource', 'Projects/plan.pdf'],
      ['page', 'My Project Notes'],
      ['page', 'Projects/Roadmap'],
      ['page', '2026-07-02'],
      ['page', '2026-08-24'],
    ]);
  });

  it('finds a regular note by its title, as a page suggestion with no extension in its path', () => {
    const [note] = suggest('my project');
    expect(note).toMatchObject({ kind: 'page', path: 'My Project Notes', title: 'My Project Notes', breadcrumb: null });
    expect(paths('my project')).toEqual(['My Project Notes']);
  });

  it('a folder-qualified query reaches notes in that folder', () => {
    expect(paths('Projects/')).toEqual(['Projects/plan.pdf', 'Projects/Roadmap']);
  });

  it.each(['2026-08', '2026-08-24', 'Aug', 'Aug 24', 'Aug 24, 2026', 'August 24', 'monday'])(
    'finds the Daily Note 2026-08-24 by %s, keeping its ISO name as the path',
    (query) => {
      const found = suggest(query).filter((s) => s.kind === 'page' && s.dailyNote);
      expect(found.map((s) => s.path)).toContain('2026-08-24');
    }
  );

  it('does not match a Daily Note by a date it is not', () => {
    expect(paths('Sep')).toEqual([]);
    expect(paths('Aug 25')).toEqual([]);
  });

  it('includes an archived Daily Note, but not an archived regular note', () => {
    const archived = () => true;
    expect(paths('', archived)).toEqual(['hero.png', 'Projects/plan.pdf', '2026-07-02', '2026-08-24']);
    expect(paths('Aug', archived)).toEqual(['2026-08-24']);
    expect(paths('Roadmap', archived)).toEqual([]);
  });

  it('still finds images and PDFs by name', () => {
    expect(paths('hero')).toEqual(['hero.png']);
    expect(paths('plan.pdf')).toEqual(['Projects/plan.pdf']);
  });

  it('marks a Daily Note so the popup lists it under Daily notes', () => {
    expect(suggest('2026-07')[0]).toMatchObject({ kind: 'page', dailyNote: true, path: '2026-07-02' });
  });
});
