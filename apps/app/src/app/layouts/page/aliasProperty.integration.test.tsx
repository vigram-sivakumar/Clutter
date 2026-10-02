// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import type { Page } from '@core/vault/models/Page';
import { Vault } from '@core/vault/models/Vault';

import { createAliasSuggester } from './aliasSuggestions';
import { PropertiesHarness } from './propertiesTestHarness';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => cleanup());

function page(id: string, path: string, aliases: string[] = []): Page {
  return {
    id,
    type: 'note',
    name: path.slice(path.lastIndexOf('/') + 1, -3),
    path,
    parentId: null,
    metadata: { status: 'active', aliases, tags: [], createdAt: null, updatedAt: null },
    source: { markdown: '' },
    analysis: { headings: [], aliases: aliases.map((value) => ({ value })), blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
  } as unknown as Page;
}

/** The Aliases editor over a real suggester built from a small vault. */
function setup(currentAliases: string[]) {
  const vault = new Vault(
    '/vault',
    [
      page('p1', '/vault/Current.md', currentAliases),
      page('a', '/vault/Other.md', ['Heyo', 'Hello world']),
      page('b', '/vault/Design.md', ['Design system', 'UI architecture']),
      page('c', '/vault/Hotel notes.md'),
    ],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  render(
    <PropertiesHarness
      initial={['properties:', '  visible:', '    - aliases']}
      aliases={currentAliases}
      aliasSuggestions={createAliasSuggester(vault, 'p1')}
    />
  );
}

const input = () => screen.getByRole('textbox', { name: 'Aliases' }) as HTMLInputElement;
const suggestionLabels = () => screen.queryAllByRole('menuitem').map((item) => item.textContent);
const pills = () => [...document.querySelectorAll('.pill')].map((pill) => pill.textContent);

function type(text: string) {
  act(() => input().focus());
  fireEvent.change(input(), { target: { value: text } });
}

describe('the Aliases property’s autocomplete, end to end', () => {
  it('typing `h` suggests the vault’s aliases — Heyo, Hello world — and never a note title like "Hotel notes"', () => {
    setup([]);

    type('h');

    expect(suggestionLabels()).toEqual(['Hello world', 'Heyo']);
  });

  it('does not offer an alias the page already has', () => {
    setup(['Heyo']);

    type('h');

    expect(suggestionLabels()).toEqual(['Hello world']);
  });

  it('picking a suggestion adds it as a pill through the Aliases commit path, as plain text', () => {
    setup(['Existing']);

    type('he');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Heyo' }));

    expect(pills()).toEqual(expect.arrayContaining(['Existing', 'Heyo']));
    // Added, not linked: no page is involved in the value.
    expect(screen.queryByRole('menuitem', { name: 'Heyo' })).toBeNull();
  });
});
