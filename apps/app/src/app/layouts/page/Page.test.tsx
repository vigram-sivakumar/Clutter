// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRef } from 'react';
import { Page, type PageFocusHandle } from './Page';

afterEach(() => {
  cleanup();
});

function getTitle(): HTMLElement {
  return screen.getByRole('textbox');
}

function makeBodyFocusRef() {
  const focus = vi.fn();
  const focusAtNewLineAtStart = vi.fn();
  const focusAtPoint = vi.fn();
  const focusAtTop = vi.fn();
  return { current: { focus, focusAtNewLineAtStart, focusAtPoint, focusAtTop } };
}

function getDescription(): HTMLElement {
  const description = document.querySelector('.page-description [role="textbox"]');
  if (!description) {
    throw new Error('No editable description rendered');
  }
  return description as HTMLElement;
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

describe('Page — description visibility and autoFocus ("Add a description")', () => {
  it('renders no description at all when empty and the editor has not been requested', () => {
    render(<Page title="Meeting Notes" body={<div />} />);

    expect(document.querySelector('.page-description')).toBeNull();
  });

  it('renders an existing description even when the editor was never explicitly requested', () => {
    render(<Page title="Meeting Notes" description="Weekly sync" body={<div />} />);

    expect(document.querySelector('.page-description')).not.toBeNull();
  });

  it('renders an empty, editable description once showDescriptionEditor is set ("Add a description" was clicked)', () => {
    render(
      <Page
        title="Meeting Notes"
        descriptionEditable
        showDescriptionEditor
        body={<div />}
      />
    );

    expect(getDescription().textContent).toBe('');
  });

  it('autofocuses the description when the editor was just opened on an empty description', () => {
    render(
      <Page
        title="Meeting Notes"
        descriptionEditable
        showDescriptionEditor
        body={<div />}
      />
    );

    expect(document.activeElement).toBe(getDescription());
  });

  it('does not autofocus a description that already has content', () => {
    render(
      <Page
        title="Meeting Notes"
        description="Weekly sync"
        descriptionEditable
        showDescriptionEditor
        body={<div />}
      />
    );

    expect(document.activeElement).not.toBe(getDescription());
  });

  it('renders the description as static text when not editable', () => {
    render(<Page title="Meeting Notes" description="Weekly sync" body={<div />} />);

    expect(() => getDescription()).toThrow();
    expect(document.querySelector('.page-description')?.textContent).toBe(
      'Weekly sync'
    );
  });
});

describe('Page — description edit/flush/cancel (continuous channel)', () => {
  it('calls onDescriptionEdit on every keystroke', () => {
    const onDescriptionEdit = vi.fn();
    render(
      <Page
        title="Meeting Notes"
        descriptionEditable
        showDescriptionEditor
        onDescriptionEdit={onDescriptionEdit}
        body={<div />}
      />
    );

    const description = getDescription();
    description.textContent = 'Weekly sync';
    fireEvent.input(description);

    expect(onDescriptionEdit).toHaveBeenCalledWith('Weekly sync');
  });

  it('calls onDescriptionFlush on a plain blur, regardless of debounce state', () => {
    const onDescriptionFlush = vi.fn();
    render(
      <Page
        title="Meeting Notes"
        descriptionEditable
        showDescriptionEditor
        onDescriptionFlush={onDescriptionFlush}
        body={<div />}
      />
    );

    const description = getDescription();
    description.textContent = 'Weekly sync';
    fireEvent.input(description);
    fireEvent.blur(description);

    expect(onDescriptionFlush).toHaveBeenCalledTimes(1);
  });

  it('calls onDescriptionCancel on Escape, not onDescriptionFlush', () => {
    const onDescriptionFlush = vi.fn();
    const onDescriptionCancel = vi.fn();
    render(
      <Page
        title="Meeting Notes"
        descriptionEditable
        showDescriptionEditor
        onDescriptionFlush={onDescriptionFlush}
        onDescriptionCancel={onDescriptionCancel}
        body={<div />}
      />
    );

    const description = getDescription();
    description.textContent = 'Weekly sync';
    fireEvent.input(description);
    fireEvent.keyDown(description, { key: 'Escape' });

    expect(onDescriptionCancel).toHaveBeenCalledTimes(1);
    expect(onDescriptionFlush).not.toHaveBeenCalled();
  });

  it('calls onDescriptionCommit (discrete, draft branch) on Enter, not onDescriptionEdit', () => {
    const onDescriptionCommit = vi.fn();
    render(
      <Page
        title="My Draft"
        descriptionEditable
        showDescriptionEditor
        onDescriptionCommit={onDescriptionCommit}
        body={<div />}
      />
    );

    const description = getDescription();
    description.textContent = 'Weekly sync';
    fireEvent.input(description);
    fireEvent.keyDown(description, { key: 'Enter' });

    expect(onDescriptionCommit).toHaveBeenCalledWith('Weekly sync');
  });
});

describe('Page body inert-space focus', () => {
  it('routes a mousedown on the body itself to bodyFocusRef.focusAtPoint and prevents the native blur', () => {
    const bodyFocusRef = makeBodyFocusRef();
    const { container } = render(<Page title="T" body={<div />} bodyFocusRef={bodyFocusRef} />);

    const body = container.querySelector('.page__body') as HTMLElement;
    const notPrevented = fireEvent.mouseDown(body, { clientX: 12, clientY: 34 });

    expect(bodyFocusRef.current.focusAtPoint).toHaveBeenCalledWith(12, 34);
    expect(notPrevented).toBe(false);
  });

  it("routes a mousedown on the body's direct wrapper child (the editor's padding) too", () => {
    const bodyFocusRef = makeBodyFocusRef();
    render(
      <Page title="T" body={<div data-testid="wrapper"><span /></div>} bodyFocusRef={bodyFocusRef} />
    );

    fireEvent.mouseDown(screen.getByTestId('wrapper'));
    expect(bodyFocusRef.current.focusAtPoint).toHaveBeenCalledTimes(1);
  });

  it('leaves a mousedown on anything deeper (text, buttons, widgets) alone', () => {
    const bodyFocusRef = makeBodyFocusRef();
    render(<Page title="T" body={<div><button data-testid="deep" /></div>} bodyFocusRef={bodyFocusRef} />);

    const notPrevented = fireEvent.mouseDown(screen.getByTestId('deep'));

    expect(bodyFocusRef.current.focusAtPoint).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it('does nothing without a body focus handle (e.g. a collection page)', () => {
    const { container } = render(<Page title="T" body={<div />} />);

    const notPrevented = fireEvent.mouseDown(container.querySelector('.page__body') as HTMLElement);
    expect(notPrevented).toBe(true);
  });
});

// One visual row per field (jsdom has no layout): the caret is always on both its first and last
// row, so every ArrowUp/ArrowDown crosses a boundary — what these tests exercise is which region
// the crossing lands in. Row-level "stay within the field" behaviour is EditableText's own tests'.
describe('Page vertical navigation: title → description → body', () => {
  const originalGetClientRects = Range.prototype.getClientRects;

  function stubSingleRow() {
    Range.prototype.getClientRects = function (this: Range) {
      return (this.startContainer instanceof Text
        ? [{ top: 0, bottom: 20, height: 20, left: 11, right: 11, width: 0, x: 11, y: 0 }]
        : []) as unknown as DOMRectList;
    };
  }

  afterEach(() => {
    Range.prototype.getClientRects = originalGetClientRects;
  });

  function setup(options: { description?: string } = {}) {
    stubSingleRow();
    const bodyFocusRef = makeBodyFocusRef();
    const pageFocusRef = createRef<PageFocusHandle>();
    const hasDescription = options.description !== undefined;
    render(
      <Page
        title="Title"
        titleEditable
        description={options.description}
        descriptionEditable={hasDescription}
        showDescriptionEditor={hasDescription}
        body={<div />}
        bodyFocusRef={bodyFocusRef}
        pageFocusRef={pageFocusRef}
      />
    );
    const fields = screen.getAllByRole('textbox');
    const [title, description] = fields as [HTMLElement, HTMLElement | undefined];
    return { title, description, bodyFocusRef, pageFocusRef };
  }

  function press(element: HTMLElement, key: 'ArrowUp' | 'ArrowDown') {
    const range = document.createRange();
    element.focus();
    range.selectNodeContents(element);
    range.collapse(true);
    if (element.firstChild) {
      range.setStart(element.firstChild, 0);
    }
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    return fireEvent.keyDown(element, { key });
  }

  it('title ArrowDown with no description goes straight to the body, carrying the caret x', () => {
    const { title, bodyFocusRef } = setup();

    press(title, 'ArrowDown');

    expect(bodyFocusRef.current.focusAtTop).toHaveBeenCalledTimes(1);
    expect(bodyFocusRef.current.focusAtTop).toHaveBeenCalledWith(11);
  });

  it('title ArrowDown with a description goes to the description, never skipping it', () => {
    const { title, description, bodyFocusRef } = setup({ description: 'About' });

    const notPrevented = press(title, 'ArrowDown');

    expect(document.activeElement).toBe(description);
    expect(bodyFocusRef.current.focusAtTop).not.toHaveBeenCalled();
    expect(notPrevented).toBe(false);
  });

  it('description ArrowDown goes to the body', () => {
    const { description, bodyFocusRef } = setup({ description: 'About' });

    press(description!, 'ArrowDown');

    expect(bodyFocusRef.current.focusAtTop).toHaveBeenCalledWith(11);
  });

  it('description ArrowUp goes back to the title', () => {
    const { title, description } = setup({ description: 'About' });

    press(description!, 'ArrowUp');

    expect(document.activeElement).toBe(title);
  });

  it('an empty (but shown) description is still a stop in the sequence', () => {
    const { title, description, bodyFocusRef } = setup({ description: '' });

    press(title, 'ArrowDown');
    expect(document.activeElement).toBe(description);

    press(description!, 'ArrowDown');
    expect(bodyFocusRef.current.focusAtTop).toHaveBeenCalledTimes(1);
  });

  it('the body leaves upward into the description when there is one (pageFocusRef)', () => {
    const { description, pageFocusRef } = setup({ description: 'About' });

    expect(pageFocusRef.current!.focusAboveBody(42)).toBe(true);
    expect(document.activeElement).toBe(description);
  });

  it('the body leaves upward straight into the title when there is no description', () => {
    const { title, pageFocusRef } = setup();

    expect(pageFocusRef.current!.focusAboveBody(42)).toBe(true);
    expect(document.activeElement).toBe(title);
  });

  it('with no editable title or description above, leaving the body upward reports false', () => {
    stubSingleRow();
    const pageFocusRef = createRef<PageFocusHandle>();
    render(<Page title="Read-only" body={<div />} bodyFocusRef={makeBodyFocusRef()} pageFocusRef={pageFocusRef} />);

    expect(pageFocusRef.current!.focusAboveBody(0)).toBe(false);
  });

  it('ArrowUp from the title (nothing above) and ArrowDown with no body are left to the browser', () => {
    stubSingleRow();
    render(<Page title="Title" titleEditable body={<div />} />);
    const title = getTitle();

    expect(press(title, 'ArrowUp')).toBe(true);
    expect(press(title, 'ArrowDown')).toBe(true);
  });
});
