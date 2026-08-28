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
  return { current: { focus } };
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

describe('Page — title Enter advances focus to the body', () => {
  it('calls bodyFocusRef.focus() when Enter is pressed in the title', () => {
    const bodyFocusRef = makeBodyFocusRef();
    render(
      <Page title="" titleEditable body={<div />} bodyFocusRef={bodyFocusRef} />
    );

    const title = getTitle();
    title.textContent = 'My Title';
    fireEvent.input(title);
    fireEvent.keyDown(title, { key: 'Enter' });

    expect(bodyFocusRef.current.focus).toHaveBeenCalledTimes(1);
  });

  it('does not call bodyFocusRef.focus() on Escape', () => {
    const bodyFocusRef = makeBodyFocusRef();
    render(
      <Page title="" titleEditable body={<div />} bodyFocusRef={bodyFocusRef} />
    );

    const title = getTitle();
    title.textContent = 'My Title';
    fireEvent.input(title);
    fireEvent.keyDown(title, { key: 'Escape' });

    expect(bodyFocusRef.current.focus).not.toHaveBeenCalled();
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
