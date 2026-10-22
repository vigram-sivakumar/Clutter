// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TagOperations } from '@core/application/tags/TagOperations';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { Workspace } from '@core/workspace/Workspace';
import type { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import type { TagExpansionStore } from '@core/application/tags/TagExpansionStore';
import type { Page } from '@core/vault/models/Page';
import type { TagMetadataEntry } from '@core/vault/models/Tag';
import { useVault } from '@app/hooks/useVault';

import { Tags } from './Sidebar.Tags';

/**
 * Renaming a tag is not one step: `TagOperations.rename` rewrites the notes that use it one at a time, and only then
 * moves the tag's definition (pinned, emoji) to the new name. Each step reaches the Vault, which the sidebar re-renders
 * from. Drawn straight from it, a pinned tag showed its OLD name from the moment Enter was pressed, then appeared under
 * Others with its new name (no definition yet), and only then jumped back to Pinned.
 *
 * These tests script a rename against a REAL Vault, step by step, and look at the real sidebar between the steps.
 */

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const defaultPageMetadata = {
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

const makePage = (pageId: string, tags: readonly string[]): Page => ({
  id: pageId,
  type: 'note',
  name: pageId,
  path: `/vault/${pageId}.md`,
  parentId: null,
  metadata: defaultPageMetadata,
  source: { markdown: '' },
  analysis: {
    headings: [],
    aliases: [],
    blockReferences: [],
    tasks: [],
    tags: tags.map((name) => ({ name, sourcePageId: pageId })),
    links: [],
    embeds: [],
  },
});

const DEFINITIONS = (): Map<string, TagMetadataEntry> =>
  new Map<string, TagMetadataEntry>([
    ['alpha', { name: 'alpha', icon: '📦', favorite: true }],
    ['beta', { name: 'beta', favorite: true }],
  ]);

function makeVault(): { vault: Vault; p1: Page; p2: Page } {
  const p1 = makePage('p1', ['alpha']);
  const p2 = makePage('p2', ['alpha', 'zeta']);
  const definitions = DEFINITIONS();
  const vault = new Vault(
    '/vault',
    [p1, p2],
    [],
    new TagBuilder().build([p1, p2], definitions),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    definitions,
    []
  );
  // `beta` is declared and pinned but unused by any note: a second pinned tag to keep order against.
  return { vault, p1, p2 };
}

/** Releases one scripted step at a time. */
function gates() {
  const queue: Array<() => void> = [];
  return {
    wait: () => new Promise<void>((resolve) => queue.push(resolve)),
    release: async () => {
      queue.shift()?.();
      // Let the Vault's notification reach React and the re-render settle.
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }
    },
  };
}

/**
 * `TagOperations.rename`'s real sequence, against the real Vault: each note is rewritten (one Vault change each), then
 * the definition moves to the new key. Each step waits for the test to release it.
 */
function scriptedRename(vault: Vault, p1: Page, p2: Page, gate: ReturnType<typeof gates>, outcome: 'ok' | 'fail' = 'ok') {
  return vi.fn(async (_oldName: string, newName: string) => {
    await gate.wait();
    vault.replacePage(makePage(p1.id, [newName]));
    await gate.wait();
    vault.replacePage(makePage(p2.id, [newName, 'zeta']));
    await gate.wait();
    if (outcome === 'fail') {
      throw new Error('disk full');
    }
    const next = DEFINITIONS();
    const definition = next.get('alpha')!;
    next.delete('alpha');
    next.set(newName, { ...definition, name: newName });
    vault.setTagMetadata(next);
  });
}

function tagOperations(rename: (oldName: string, newName: string) => Promise<void>): TagOperations {
  return {
    updateMetadata: vi.fn(() => Promise.resolve()),
    rename,
    canRename: (_old: string, next: string) => next.trim() !== '',
    countUnusedTags: () => 0,
    deleteUnusedTags: vi.fn(() => Promise.resolve(0)),
  } as unknown as TagOperations;
}

function Panel({ vault, operations }: { vault: Vault; operations: TagOperations }) {
  // The app's one subscription (AppLayout's useVault): every Vault change re-renders the sidebar.
  useVault(vault);
  return (
    <Tags
      vault={vault}
      navigation={{ openTag: vi.fn() } as unknown as NavigationRouter}
      tagOperations={operations}
      pageOperations={{ open: vi.fn() } as unknown as PageOperations}
      folderOperations={{ create: vi.fn() } as unknown as FolderOperations}
      effectivePageState={{ getPagesByTag: () => [], hasDraftForTag: () => false } as unknown as EffectivePageState}
      membershipSelector={
        {
          vaultRoot: '/vault',
          getWorkspaceFolders: () => [],
          getTemplatesFolder: () => undefined,
          getInboxFolder: () => undefined,
          getVisibleChildFolders: () => [],
          getMoveZoneRoot: () => undefined,
        } as unknown as MembershipSelector
      }
      workspace={{ activePageId: null, isSectionExpanded: () => true, setSectionExpanded: vi.fn() } as unknown as Workspace}
      tagExpansionStore={{ isExpanded: () => false, toggleExpanded: vi.fn(), subscribe: () => () => {} } as unknown as TagExpansionStore}
      collectionViewConfigStore={{ deleteKey: vi.fn() } as unknown as CollectionViewConfigStore}
      onRequestReveal={vi.fn()}
      onRequestNewTag={vi.fn()}
      onRevealInNotesSidebar={vi.fn()}
    />
  );
}

/** What the sidebar shows: the tag names under Pinned and under Others. */
function sections() {
  const rows = (title: string) => {
    const header = [...document.querySelectorAll('.section-header__title')].find((el) => el.textContent === title);
    const section = header?.closest('.section');
    return section ? [...section.querySelectorAll('.tag__title')].map((el) => el.textContent!) : [];
  };
  return { pinned: rows('Pinned'), others: rows('Others') };
}
const allNames = () => [...sections().pinned, ...sections().others];

function startRenaming(name: string) {
  const row = [...document.querySelectorAll<HTMLElement>('.entry')].find((el) => el.querySelector('.tag__title')?.textContent === name)!;
  fireEvent.click(within(row).getAllByRole('button').at(-1)!);
  fireEvent.click(screen.getByText('Rename'));
  return screen.getByRole('textbox');
}
function confirmRename(field: HTMLElement, value: string) {
  field.textContent = value;
  fireEvent.input(field);
  fireEvent.keyDown(field, { key: 'Enter' });
}

describe('renaming a pinned tag', () => {
  it('starts with alpha and beta pinned (alphabetical) and zeta under Others', () => {
    const { vault } = makeVault();
    render(<Panel vault={vault} operations={tagOperations(vi.fn())} />);

    expect(sections()).toEqual({ pinned: ['alpha', 'beta'], others: ['zeta'] });
  });

  it('shows the new name, pinned, the moment Enter is pressed — never the old name', () => {
    const { vault, p1, p2 } = makeVault();
    const gate = gates();
    render(<Panel vault={vault} operations={tagOperations(scriptedRename(vault, p1, p2, gate))} />);

    confirmRename(startRenaming('alpha'), 'gamma');

    // Nothing has reached the Vault yet.
    expect(sections()).toEqual({ pinned: ['beta', 'gamma'], others: ['zeta'] });
    expect(allNames()).not.toContain('alpha');
  });

  it('stays in Pinned, under its new name and in order, at every step of the rename — never under Others, never gone, never twice', async () => {
    const { vault, p1, p2 } = makeVault();
    const gate = gates();
    render(<Panel vault={vault} operations={tagOperations(scriptedRename(vault, p1, p2, gate))} />);
    // Every DOM change the sidebar goes through from here on.
    const seen: Array<ReturnType<typeof sections>> = [];
    const observer = new MutationObserver(() => seen.push(sections()));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    confirmRename(startRenaming('alpha'), 'gamma');
    const expected = { pinned: ['beta', 'gamma'], others: ['zeta'] };
    expect(sections()).toEqual(expected);

    await gate.release(); // first note rewritten: `gamma` exists, unpinned, beside the old pinned tag
    expect(sections()).toEqual(expected);

    await gate.release(); // second note rewritten: the old tag has no notes left
    expect(sections()).toEqual(expected);

    await gate.release(); // the definition (pinned, emoji) moves to the new name: the rename is complete
    await act(async () => {
      await Promise.resolve();
    });
    expect(sections()).toEqual(expected);

    observer.disconnect();
    expect(seen.length).toBeGreaterThan(0);
    for (const snapshot of seen) {
      // Never under Others (it is neither the new name nor the old one), and always exactly once, pinned.
      expect(snapshot.others).not.toContain('gamma');
      expect(snapshot.others).not.toContain('alpha');
      expect(snapshot.pinned.filter((name) => name === 'gamma')).toHaveLength(1);
      expect(snapshot.pinned).not.toContain('alpha');
      expect(snapshot.pinned).toEqual(['beta', 'gamma']);
    }
  });

  it('keeps its emoji and its pinned status once the rename has settled, with the Vault as the source again', async () => {
    const { vault, p1, p2 } = makeVault();
    const gate = gates();
    render(<Panel vault={vault} operations={tagOperations(scriptedRename(vault, p1, p2, gate))} />);

    confirmRename(startRenaming('alpha'), 'gamma');
    await gate.release();
    await gate.release();
    await gate.release();
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(vault.getTagByName('gamma')).toMatchObject({ name: 'gamma', favorite: true, icon: '📦', declared: true });
    expect(vault.getTagByName('alpha')).toBeUndefined();
    expect(sections()).toEqual({ pinned: ['beta', 'gamma'], others: ['zeta'] });
    expect(document.querySelector('.entry .emoji-icon')?.textContent).toBe('📦');
  });

  it('a rename that fails shows the tag as it was once it settles (the existing, silent behaviour) — pinned, old name', async () => {
    const { vault, p1, p2 } = makeVault();
    const gate = gates();
    render(<Panel vault={vault} operations={tagOperations(scriptedRename(vault, p1, p2, gate, 'fail'))} />);

    confirmRename(startRenaming('alpha'), 'gamma');
    await gate.release();
    await gate.release();
    await gate.release();
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // The notes were rewritten but the definition never moved: the Vault's own picture is shown again, nothing hidden.
    expect(allNames()).toContain('gamma');
    expect(vault.getTagByName('alpha')).toMatchObject({ favorite: true, declared: true });
  });
});

describe('renaming an unpinned tag', () => {
  it('shows the new name under Others at once, and keeps it there', async () => {
    const { vault, p1, p2 } = makeVault();
    const gate = gates();
    render(<Panel vault={vault} operations={tagOperations(scriptedRename(vault, p1, p2, gate))} />);

    confirmRename(startRenaming('zeta'), 'omega');

    expect(sections()).toEqual({ pinned: ['alpha', 'beta'], others: ['omega'] });
    expect(allNames()).not.toContain('zeta');
  });
});
