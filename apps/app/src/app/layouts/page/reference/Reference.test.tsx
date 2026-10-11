// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { References } from './Reference';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => cleanup());

const toggle = (title: string) => fireEvent.click(screen.getByRole('button', { name: title }));

describe('References', () => {
  it('renders nothing when no group has content', () => {
    const { container } = render(<References />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the groups it is given, in Tasks, Notes, Daily notes order, with no counts', () => {
    render(<References dailyNotes={<div>daily row</div>} tasks={<div>task row</div>} />);

    const titles = [...document.querySelectorAll('.section-header__title')].map((node) => node.textContent);

    expect(titles).toEqual(['References', 'Tasks', 'Daily notes']);
    expect(screen.queryByRole('button', { name: 'Notes' })).toBeNull();
    expect(document.querySelector('.reference')?.textContent).not.toMatch(/\d/);
  });

  it('collapses and expands each group on its own', () => {
    render(<References tasks={<div>task row</div>} notes={<div>note row</div>} dailyNotes={<div>daily row</div>} />);

    toggle('Tasks');
    expect(screen.queryByText('task row')).toBeNull();
    expect(screen.getByText('note row')).toBeInTheDocument();
    expect(screen.getByText('daily row')).toBeInTheDocument();

    toggle('Notes');
    expect(screen.queryByText('note row')).toBeNull();
    expect(screen.getByText('daily row')).toBeInTheDocument();

    toggle('Tasks');
    expect(screen.getByText('task row')).toBeInTheDocument();
    expect(screen.queryByText('note row')).toBeNull();
  });

  it('collapses the whole section, and keeps each group\'s own state when it comes back', () => {
    render(<References tasks={<div>task row</div>} notes={<div>note row</div>} />);

    toggle('Notes');
    toggle('References');
    expect(screen.queryByText('task row')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tasks' })).toBeNull();

    toggle('References');
    expect(screen.getByText('task row')).toBeInTheDocument();
    expect(screen.queryByText('note row')).toBeNull();
  });

  it('reflects expansion on every header through aria-expanded', () => {
    render(<References tasks={<div>task row</div>} />);

    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-expanded', 'true');
    toggle('Tasks');
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-expanded', 'false');
  });
});
