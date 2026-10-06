// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmptyEntry } from './EmptyEntry';

afterEach(cleanup);

describe('EmptyEntry', () => {
  it('shows its message as a plain, non-interactive status row', () => {
    const { container } = render(<EmptyEntry>No folders</EmptyEntry>);

    expect(screen.getByRole('status')).toHaveTextContent('No folders');
    expect(container.querySelector('.entry-interactive')).toBeNull();
  });

  it('takes the indent of the rows it stands in for', () => {
    const { container } = render(<EmptyEntry level={2}>No folders</EmptyEntry>);

    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--tree-level')).toBe('2');
  });

  it('renders a leading slot', () => {
    render(<EmptyEntry leading={<span data-testid="lead" />}>No folders</EmptyEntry>);

    expect(screen.getByTestId('lead')).toBeInTheDocument();
  });

  it('with onClick it is a quiet call to action, activated by click and Enter', () => {
    const onClick = vi.fn();
    render(<EmptyEntry onClick={onClick}>Create a folder</EmptyEntry>);

    const row = screen.getByRole('button');
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
