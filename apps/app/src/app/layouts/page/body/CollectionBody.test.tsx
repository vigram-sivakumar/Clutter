// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionBody } from './CollectionBody';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

afterEach(() => {
  cleanup();
});

function noteEntry(overrides: Partial<CollectionEntryModel> = {}): CollectionEntryModel {
  return {
    id: 'note-1',
    type: 'note',
    title: 'My note',
    icon: 'note',
    emoji: null,
    selected: false,
    onClick: vi.fn(),
    ...overrides,
  };
}

function folderEntry(overrides: Partial<CollectionEntryModel> = {}): CollectionEntryModel {
  return {
    id: 'folder-1',
    type: 'folder',
    title: 'My Folder',
    icon: 'folder',
    emoji: null,
    selected: false,
    onClick: vi.fn(),
    ...overrides,
  };
}

describe('CollectionBody — compact Markdown title rendering', () => {
  it('renders a plain-text note title verbatim, unchanged from before', () => {
    const { getByText } = render(<CollectionBody notes={[noteEntry({ title: 'Plain title' })]} />);

    expect(getByText('Plain title')).toBeDefined();
  });

  it('renders mixed Markdown in a note title as compact Markdown, not raw syntax', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ title: '**Ship** [[Project Alpha]] by @2020-01-15 #urgent' })]}
      />
    );

    const content = container.querySelector('.entry__content')!;
    expect(content.querySelector('strong')).toHaveTextContent('Ship');
    expect(content.querySelector('.compact-markdown-wikilink')).toHaveTextContent('Project Alpha');
    expect(content.querySelector('.compact-markdown-tag')).toHaveTextContent('#urgent');
    expect(content.querySelector('.compact-markdown-date')).toHaveTextContent('@15 January 2020');
    expect(content).not.toHaveTextContent('**Ship**');
    expect(content).not.toHaveTextContent('[[Project Alpha]]');
  });

  it('resolves a note WikiLink through the injected resolveWikiLink, not the fallback', () => {
    const resolveWikiLink = vi.fn().mockReturnValue({
      status: 'resolved' as const,
      displayLabel: 'Resolved Label',
      activate: () => {},
    });

    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ title: '[[Projects/Alpha|Alpha]]' })]}
        resolveWikiLink={resolveWikiLink}
      />
    );

    expect(resolveWikiLink).toHaveBeenCalledWith('Projects/Alpha', 'Alpha');
    expect(container.querySelector('.compact-markdown-wikilink')).toHaveTextContent('Resolved Label');
  });

  it('a plain folder title (never Markdown-bearing) renders unaffected through the same path', () => {
    const { getByText } = render(<CollectionBody folders={[folderEntry({ title: 'My Folder' })]} />);

    expect(getByText('My Folder')).toBeDefined();
  });

  it('row click still fires normally when the title contains Markdown', () => {
    const onClick = vi.fn();
    const { getByText } = render(
      <CollectionBody notes={[noteEntry({ title: '**Ship** it', onClick })]} />
    );

    fireEvent.click(getByText('Ship').closest('.entry')!);

    expect(onClick).toHaveBeenCalled();
  });
});
