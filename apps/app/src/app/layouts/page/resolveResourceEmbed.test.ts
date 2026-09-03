import { describe, expect, it } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { resolveResourceEmbed } from './resolveResourceEmbed';

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

describe('resolveResourceEmbed — exact matches', () => {
  it('resolves an exact root-level resource', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);

    expect(resolveResourceEmbed(vault, 'hero.png')).toBe(resource);
  });

  it('resolves an exact nested resource', () => {
    const resource = makeResource('r1', `${ROOT}/Projects/A/hero.png`, 'image', 'folder-a');
    const vault = makeVault([resource]);

    expect(resolveResourceEmbed(vault, 'Projects/A/hero.png')).toBe(resource);
  });

  it('resolves an exact resource inside the managed Assets/ folder', () => {
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'image', 'folder-assets');
    const vault = makeVault([resource]);

    expect(resolveResourceEmbed(vault, 'Assets/hero.png')).toBe(resource);
  });

  it('resolves a pdf resource identically to an image resource', () => {
    const resource = makeResource('r1', `${ROOT}/spec.pdf`, 'pdf');
    const vault = makeVault([resource]);

    expect(resolveResourceEmbed(vault, 'spec.pdf')).toBe(resource);
  });
});

describe('resolveResourceEmbed — missing / not found', () => {
  it('returns undefined for a resource that never existed', () => {
    const vault = makeVault([]);

    expect(resolveResourceEmbed(vault, 'nothing.png')).toBeUndefined();
  });

  it('returns undefined after the underlying resource was renamed away from this path (simulates a stale reference)', () => {
    const resource = makeResource('r1', `${ROOT}/hero-renamed.png`);
    const vault = makeVault([resource]);

    expect(resolveResourceEmbed(vault, 'hero.png')).toBeUndefined();
  });

  it('returns undefined after the underlying resource was moved away from this path', () => {
    const resource = makeResource('r1', `${ROOT}/Projects/hero.png`, 'image', 'folder-projects');
    const vault = makeVault([resource]);

    expect(resolveResourceEmbed(vault, 'hero.png')).toBeUndefined();
  });
});

describe('resolveResourceEmbed — duplicate filenames require a folder-qualified path', () => {
  it('a bare filename does not arbitrarily resolve to either of two same-named resources in different folders', () => {
    const a = makeResource('r1', `${ROOT}/Projects/A/hero.png`, 'image', 'folder-a');
    const b = makeResource('r2', `${ROOT}/Projects/B/hero.png`, 'image', 'folder-b');
    const vault = makeVault([a, b]);

    expect(resolveResourceEmbed(vault, 'hero.png')).toBeUndefined();
  });

  it('a folder-qualified path resolves unambiguously to the correct one of two same-named resources', () => {
    const a = makeResource('r1', `${ROOT}/Projects/A/hero.png`, 'image', 'folder-a');
    const b = makeResource('r2', `${ROOT}/Projects/B/hero.png`, 'image', 'folder-b');
    const vault = makeVault([a, b]);

    expect(resolveResourceEmbed(vault, 'Projects/A/hero.png')).toBe(a);
    expect(resolveResourceEmbed(vault, 'Projects/B/hero.png')).toBe(b);
  });
});

describe('resolveResourceEmbed — extension is required', () => {
  it('an extension-free path does not resolve, even when a resource with that stem exists', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);

    expect(resolveResourceEmbed(vault, 'hero')).toBeUndefined();
  });

  it('the wrong extension does not resolve', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);

    expect(resolveResourceEmbed(vault, 'hero.pdf')).toBeUndefined();
  });
});

describe('resolveResourceEmbed — no filesystem scan', () => {
  it('resolves purely from the already-live Vault state, never touching disk', () => {
    // No fileSystem/VaultFileSystem is constructed or passed anywhere in
    // this test file at all — resolveResourceEmbed's own signature (Vault,
    // string) => VaultResource | undefined structurally cannot perform I/O.
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);

    expect(resolveResourceEmbed(vault, 'hero.png')).toBe(resource);
  });
});
