// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Entry } from './Entry';

afterEach(() => {
  cleanup();
});

describe('Entry: keyboard activation', () => {
  it('Enter on the row itself invokes onClick', () => {
    const onClick = vi.fn();
    render(<Entry onClick={onClick}>Row</Entry>);

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Space on the row itself invokes onClick', () => {
    const onClick = vi.fn();
    render(<Entry onClick={onClick}>Row</Entry>);

    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a key other than Enter/Space does nothing', () => {
    const onClick = vi.fn();
    render(<Entry onClick={onClick}>Row</Entry>);

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });

    expect(onClick).not.toHaveBeenCalled();
  });

  it('a disabled entry ignores Enter/Space', () => {
    const onClick = vi.fn();
    render(
      <Entry onClick={onClick} disabled>
        Row
      </Entry>
    );

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });

    expect(onClick).not.toHaveBeenCalled();
  });

  it('an entry with no onClick gets no keyboard handler at all', () => {
    const { container } = render(<Entry>Row</Entry>);
    const row = container.querySelector('.entry');

    expect(row).not.toHaveAttribute('role');
    expect(row).not.toHaveAttribute('tabindex');
  });

  it('Enter focused on a nested interactive element (e.g. a trailing action button) does not double-fire the row onClick', () => {
    const onClick = vi.fn();
    render(
      <Entry
        onClick={onClick}
        actions={<button type="button">More</button>}
      >
        Row
      </Entry>
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), { key: 'Enter' });

    // The nested button's own native activation is what should handle
    // this key press (not exercised here, jsdom doesn't simulate it) —
    // what matters is the row's onClick was never invoked a second time
    // via Entry's own handler.
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Entry: mouse click behavior is unchanged', () => {
  it('a plain click on the row still invokes onClick', () => {
    const onClick = vi.fn();
    render(<Entry onClick={onClick}>Row</Entry>);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('clicking a nested interactive element still does not invoke the row onClick', () => {
    const onClick = vi.fn();
    render(
      <Entry onClick={onClick} actions={<button type="button">More</button>}>
        Row
      </Entry>
    );

    fireEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
