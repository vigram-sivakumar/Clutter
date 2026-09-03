import { describe, expect, it } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';

import { createEmbedSuggester } from './embedSuggestions';

const ROOT = '/vault';

function makeVault(resources: VaultResource[]): Vault {
  return new Vault(
    ROOT,
    [],
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
  it('carries the resource kind through for icon selection, never re-derived from the filename extension', () => {
    const resources = [makeResource('r1', `${ROOT}/spec.pdf`, 'pdf')];
    const vault = makeVault(resources);
    const suggest = createEmbedSuggester(vault, fakeMembershipSelector(resources));

    expect(suggest('')[0]?.resourceKind).toBe('pdf');
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
