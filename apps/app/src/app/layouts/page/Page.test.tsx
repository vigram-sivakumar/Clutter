// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Page } from './Page';

afterEach(() => {
  cleanup();
});

function getTitle(): HTMLElement {
  return screen.getByRole('textbox');
}

function makeBodyFocusRef() {
  const focus = vi.fn();
  const focusAtNewLineAtStart = vi.fn();
  return { current: { focus, focusAtNewLineAtStart } };
}

describe('Page — title autofocus', () => {
  it('autofocuses the title when it is editable and empty (missing)', () => {
    render(<Page title="" titleEditable body={<div />} />);

    expect(document.activeElement).toBe(getTitle());
  });

  it('does not autofocus when the title already has a meaningful value', () => {
    render(<Page title="Meeting Notes" titleEditable body={<div />} />);

    expect(document.activeElement).not.toBe(getTitle());
  });

  it('does not autofocus an empty title when it is not editable (e.g. a folder collection view)', () => {
    render(<Page title="" titleEditable={false} body={<div />} />);

    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('Page — cover layout placement', () => {
  it('defaults to Side: PageCover renders as a .page__document sibling, not inside .page__content', () => {
    render(<Page title="Note" body={<div />} coverImage="cover.png" />);

    const page = document.querySelector('.page')!;
    const content = document.querySelector('.page__content')!;
    expect(Array.from(page.children).some((c) => c.classList.contains('page__cover'))).toBe(
      true
    );
    expect(content.querySelector('.page__cover')).toBeNull();
  });

  it('Above: PageCover renders inside .page__content, immediately before .page__header', () => {
    render(
      <Page title="Note" body={<div />} coverImage="cover.png" coverLayout="above" />
    );

    const page = document.querySelector('.page')!;
    const content = document.querySelector('.page__content')!;
    // Never a direct .page child in Above layout.
    expect(Array.from(page.children).some((c) => c.classList.contains('page__cover'))).toBe(
      false
    );
    expect(content.firstElementChild!.classList.contains('page__cover')).toBe(true);
    expect(content.children[1]!.classList.contains('page__header')).toBe(true);
  });

  it('renders no cover element at all when there is no coverImage, regardless of coverLayout', () => {
    render(<Page title="Note" body={<div />} coverLayout="above" />);

    expect(document.querySelector('.page__cover')).toBeNull();
  });
});

describe('Page — cover/emoji overlap attribute (Above layout, user emoji only)', () => {
  it('Above + cover + emoji: sets data-emoji-overlap on the cover', () => {
    render(
      <Page
        title="Note"
        body={<div />}
        coverImage="cover.png"
        coverLayout="above"
        emoji="🎉"
      />
    );

    expect(document.querySelector('.page__cover')).toHaveProperty(
      'dataset.emojiOverlap',
      'true'
    );
  });

  it('Above + cover + no emoji: does not set data-emoji-overlap', () => {
    render(<Page title="Note" body={<div />} coverImage="cover.png" coverLayout="above" />);

    expect(document.querySelector('.page__cover')).not.toHaveProperty(
      'dataset.emojiOverlap'
    );
  });

  it('Side + cover + emoji: the cover still gets the hasEmoji fact, but Side CSS never matches it (no .page__content ancestor)', () => {
    render(
      <Page title="Note" body={<div />} coverImage="cover.png" coverLayout="side" emoji="🎉" />
    );

    const cover = document.querySelector('.page__cover')!;
    // Fact is still passed through (PageCover doesn't know about layout) —
    // what actually prevents the overlap in Side is the CSS ancestor
    // selector, verified structurally: the cover is a .page child, not a
    // .page__content descendant.
    expect(cover.parentElement!.classList.contains('page')).toBe(true);
    expect(document.querySelector('.page__content > .page__cover')).toBeNull();
  });

  it('a system icon (not emoji) never sets data-emoji-overlap', () => {
    render(
      <Page
        title="Daily Note"
        body={<div />}
        coverImage="cover.png"
        coverLayout="above"
        icon="calendar"
      />
    );

    expect(document.querySelector('.page__cover')).not.toHaveProperty(
      'dataset.emojiOverlap'
    );
  });
});

describe('Page — title Enter advances focus to the body', () => {
  it('calls bodyFocusRef.focusAtNewLineAtStart() when Enter is pressed in the title', () => {
    const bodyFocusRef = makeBodyFocusRef();
    render(
      <Page title="" titleEditable body={<div />} bodyFocusRef={bodyFocusRef} />
    );

    const title = getTitle();
    title.textContent = 'My Title';
    fireEvent.input(title);
    fireEvent.keyDown(title, { key: 'Enter' });

    expect(bodyFocusRef.current.focusAtNewLineAtStart).toHaveBeenCalledTimes(1);
    expect(bodyFocusRef.current.focus).not.toHaveBeenCalled();
  });

  it('does not call bodyFocusRef.focusAtNewLineAtStart() on Escape', () => {
    const bodyFocusRef = makeBodyFocusRef();
    render(
      <Page title="" titleEditable body={<div />} bodyFocusRef={bodyFocusRef} />
    );

    const title = getTitle();
    title.textContent = 'My Title';
    fireEvent.input(title);
    fireEvent.keyDown(title, { key: 'Escape' });

    expect(bodyFocusRef.current.focusAtNewLineAtStart).not.toHaveBeenCalled();
  });

  it('does not throw when no bodyFocusRef is provided', () => {
    render(<Page title="" titleEditable body={<div />} />);

    const title = getTitle();
    expect(() => fireEvent.keyDown(title, { key: 'Enter' })).not.toThrow();
  });
});

describe('Page — non-editable title (e.g. a Daily Note, via titleEditable=false)', () => {
  it('renders the title as static text, not an editable textbox', () => {
    render(<Page title="Thursday, August 28" titleEditable={false} body={<div />} />);

    expect(screen.queryByRole('textbox')).toBeNull();
    const title = screen.getByText('Thursday, August 28');
    expect(title).not.toBeNull();
    expect(title.getAttribute('contenteditable')).toBeNull();
  });

  it('remains unchanged after typing', () => {
    render(<Page title="Thursday, August 28" titleEditable={false} body={<div />} />);

    const title = screen.getByText('Thursday, August 28');
    fireEvent.keyDown(title, { key: 'X' });
    fireEvent.keyPress(title, { key: 'X' });

    expect(title.textContent).toBe('Thursday, August 28');
    expect(screen.queryByText('Thursday, August 28X')).toBeNull();
  });

  it('remains unchanged after Backspace/Delete', () => {
    render(<Page title="Thursday, August 28" titleEditable={false} body={<div />} />);

    const title = screen.getByText('Thursday, August 28');
    fireEvent.keyDown(title, { key: 'Backspace' });
    fireEvent.keyDown(title, { key: 'Delete' });

    expect(title.textContent).toBe('Thursday, August 28');
  });

  it('remains unchanged after paste', () => {
    render(<Page title="Thursday, August 28" titleEditable={false} body={<div />} />);

    const title = screen.getByText('Thursday, August 28');
    fireEvent.paste(title, {
      clipboardData: { getData: () => 'hijacked title' },
    });

    expect(title.textContent).toBe('Thursday, August 28');
    expect(screen.queryByText('hijacked title')).toBeNull();
  });

  it('leaves the body editable even though the title is not', () => {
    render(
      <Page
        title="Thursday, August 28"
        titleEditable={false}
        body={<div data-testid="body" contentEditable suppressContentEditableWarning />}
      />
    );

    const body = screen.getByTestId('body');
    body.textContent = 'Some notes for today';
    fireEvent.input(body);

    expect(body.textContent).toBe('Some notes for today');
  });
});

describe('Page — title commit', () => {
  it('calls onTitleCommit with the typed value when Enter commits the title', () => {
    const onTitleCommit = vi.fn();
    render(
      <Page title="" titleEditable body={<div />} onTitleCommit={onTitleCommit} />
    );

    const title = getTitle();
    title.textContent = 'Test note';
    fireEvent.input(title);
    fireEvent.keyDown(title, { key: 'Enter' });

    expect(onTitleCommit).toHaveBeenCalledWith('Test note');
  });

  it('calls onTitleCommit on a plain blur with changed text, not just Enter', () => {
    const onTitleCommit = vi.fn();
    render(
      <Page title="" titleEditable body={<div />} onTitleCommit={onTitleCommit} />
    );

    const title = getTitle();
    title.textContent = 'Test note';
    fireEvent.input(title);
    fireEvent.blur(title);

    expect(onTitleCommit).toHaveBeenCalledWith('Test note');
  });

  it('does not call onTitleCommit on Escape', () => {
    const onTitleCommit = vi.fn();
    render(
      <Page title="" titleEditable body={<div />} onTitleCommit={onTitleCommit} />
    );

    const title = getTitle();
    title.textContent = 'Test note';
    fireEvent.input(title);
    fireEvent.keyDown(title, { key: 'Escape' });

    expect(onTitleCommit).not.toHaveBeenCalled();
  });

  it('does not throw when no onTitleCommit is provided (persisted-page branch today)', () => {
    render(<Page title="" titleEditable body={<div />} />);

    const title = getTitle();
    title.textContent = 'Test note';
    fireEvent.input(title);
    expect(() => fireEvent.blur(title)).not.toThrow();
  });
});
