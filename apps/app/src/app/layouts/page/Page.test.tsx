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
