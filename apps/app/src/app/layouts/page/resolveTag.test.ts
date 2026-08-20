import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { Page } from '@core/vault/models/Page';

import { createTagResolver } from './resolveTag';

function fakeNavigation(openTag: (name: string) => void): NavigationRouter {
  return { openTag } as unknown as NavigationRouter;
}

const defaultPageMetadata = {
  icon: null,
  cover: null,
  description: '',
  favorite: false,
  status: 'active' as const,
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

function makePage(id: string, tagNames: readonly string[]): Page {
  return {
    id,
    type: 'note',
    name: id,
    path: `/vault/${id}.md`,
    parentId: null,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: tagNames.map((name) => ({ name, sourcePageId: id })),
      links: [],
      embeds: [],
    },
  };
}

function makeVault(pages: Page[]): Vault {
  return new Vault(
    '/vault',
    pages,
    [],
    new TagBuilder().build(pages),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

/**
 * Deliberately no `Vault`/pages fixtures in most cases below: per the
 * locked model in `tagResolution.ts`, a Tag's occurrence in the currently
 * open document is itself the definition for `status` purposes — there is
 * no separate "does this already exist in the vault" check `status` needs
 * fixtures for. `Vault` is only consulted for `displayLabel` (see the
 * "displayLabel" describe block below), which is where fixtures matter.
 */
describe('createTagResolver', () => {
  it('a tag with existing usage elsewhere in the vault resolves as "resolved"', () => {
    const resolveTag = createTagResolver(fakeNavigation(vi.fn()), makeVault([]));

    expect(resolveTag('project').status).toBe('resolved');
  });

  it('a tag typed for the first time in the still-unsaved current document also resolves as "resolved" — not "unresolved" merely due to save/ingest timing', () => {
    const resolveTag = createTagResolver(fakeNavigation(vi.fn()), makeVault([]));

    expect(resolveTag('brandNewNeverSavedTag').status).toBe('resolved');
  });

  it('never returns "unresolved" for any tag name — Tag has no unresolved state, unlike WikiLink', () => {
    const resolveTag = createTagResolver(fakeNavigation(vi.fn()), makeVault([]));

    expect(resolveTag('anything').status).not.toBe('unresolved');
  });

  it('activate calls navigation.openTag with the exact name passed to the resolver', () => {
    const openTag = vi.fn();
    const resolveTag = createTagResolver(fakeNavigation(openTag), makeVault([]));

    resolveTag('Project').activate();

    expect(openTag).toHaveBeenCalledWith('Project');
    expect(openTag).toHaveBeenCalledTimes(1);
  });

  it('a newly typed, never-before-seen tag still activates via navigation.openTag — no separate "create" step, unlike WikiLink', () => {
    const openTag = vi.fn();
    const resolveTag = createTagResolver(fakeNavigation(openTag), makeVault([]));

    resolveTag('newtag').activate();

    expect(openTag).toHaveBeenCalledWith('newtag');
  });

  describe('displayLabel', () => {
    it('formats a tag with no separator identically to its raw name', () => {
      const resolveTag = createTagResolver(fakeNavigation(vi.fn()), makeVault([]));

      expect(resolveTag('project').displayLabel).toBe('project');
    });

    it('falls back to formatting this occurrence\'s own raw name when the tag is not yet in the vault (typed for the first time, not yet saved)', () => {
      const resolveTag = createTagResolver(fakeNavigation(vi.fn()), makeVault([]));

      expect(resolveTag('Product-design').displayLabel).toBe('Product design');
      expect(resolveTag('product_design').displayLabel).toBe('product design');
    });

    it('uses the vault-wide preferred casing/separator, established by whichever occurrence was saved first, for any later variant', () => {
      // Page "a" (processed first) established "Product-design"; page "b"
      // later uses a different casing/separator for the same logical tag.
      const vault = makeVault([
        makePage('a', ['Product-design']),
        makePage('b', ['product_design']),
      ]);
      const resolveTag = createTagResolver(fakeNavigation(vi.fn()), vault);

      expect(resolveTag('product_design').displayLabel).toBe('Product design');
      expect(resolveTag('PRODUCT-DESIGN').displayLabel).toBe('Product design');
      expect(resolveTag('product-Design').displayLabel).toBe('Product design');
      // The occurrence that established the casing resolves to itself too.
      expect(resolveTag('Product-design').displayLabel).toBe('Product design');
    });
  });
});
