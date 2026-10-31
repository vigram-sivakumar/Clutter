// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { folderEntry, noteEntry } from '@features/collection/testing/collectionEntry';
import { toFolderListItem } from '../folder/toFolderListItem';
import { toNoteCardProps } from './toNoteCardProps';
import { toNoteListItem } from './toNoteListItem';
import { toNoteTableRow } from './toNoteTableRow';
import { showsDescriptionSnippet } from './toNoteTagContent';
import { CollectionCard } from '../card/CollectionCard';

afterEach(cleanup);

const VISIBLE = ['name', 'description', 'created', 'updated'] as const;
const note = noteEntry({ description: 'About this note' });
// A Tag collection's matching-content entry: stands for one line of the note.
const tagLine = noteEntry({ description: 'About this note', tagLine: 'a line with #tag', source: 'Source note' });

describe('the description snippet beneath a title', () => {
  it('a note shows its description — list, table and card', () => {
    expect(showsDescriptionSnippet(note, VISIBLE)).toBe(true);
    expect(toNoteListItem(note, { visible: VISIBLE }).description).toBe('About this note');
    expect(toNoteTableRow(note, { visible: VISIBLE }).cells.name).toMatchObject({ description: 'About this note' });
    const { container } = render(<CollectionCard {...toNoteCardProps(note, { visible: VISIBLE })} />);
    expect(container.textContent).toContain('About this note');
  });

  it('a note without a description draws none and no empty snippet', () => {
    const bare = noteEntry({});

    expect(toNoteListItem(bare, { visible: VISIBLE }).description).toBeUndefined();
    expect(toNoteTableRow(bare, { visible: VISIBLE }).cells.name).toMatchObject({ description: undefined });
  });

  it('with the Description property off, no note draws one', () => {
    expect(toNoteListItem(note, { visible: ['name'] }).description).toBeUndefined();
  });

  it('a Tag collection\'s matching-line entry — a line, not the note — does not borrow the note\'s description', () => {
    expect(showsDescriptionSnippet(tagLine, VISIBLE)).toBe(false);
    expect(toNoteListItem(tagLine, { visible: VISIBLE }).description).toBeUndefined();
    expect(toNoteTableRow(tagLine, { visible: VISIBLE }).cells.name).toMatchObject({ description: undefined, descriptionPlaceholder: undefined });
    const { container } = render(<CollectionCard {...toNoteCardProps(tagLine, { visible: VISIBLE })} />);
    expect(container.textContent).not.toContain('About this note');
  });

  it('a folder\'s list item never carries a description as its snippet — its slot holds its contents line', () => {
    const item = toFolderListItem(folderEntry({ subfolderCount: 1, noteCount: 2 }), { visible: VISIBLE });

    expect(item.description).not.toContain('About');
  });
});
