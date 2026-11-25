// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingBar } from './LoadingBar';

afterEach(cleanup);

describe('LoadingBar', () => {
  it('exposes an accessible indeterminate progress bar using the shared artwork', () => {
    render(<LoadingBar label="Opening Clutter…" />);
    const bar = screen.getByRole('progressbar', { name: 'Opening Clutter…' });
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).toHaveTextContent('');
    expect(bar.querySelector('.gradient-grainy')).toHaveAttribute('aria-hidden', 'true');
  });
});
