// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ShortcutKey } from './ShortcutKey';

afterEach(cleanup);

describe('ShortcutKey', () => {
  it('is a square when it has only an icon', () => {
    const { container } = render(<ShortcutKey leading={<svg data-testid="icon" />} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('shortcut-key--square');
  });

  it('is not a square with a label, with or without an icon', () => {
    const { container, rerender } = render(<ShortcutKey label="N" />);
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass('shortcut-key--square');

    rerender(<ShortcutKey leading={<svg />} label="Esc" />);
    expect(container.firstElementChild).not.toHaveClass('shortcut-key--square');
  });
});
