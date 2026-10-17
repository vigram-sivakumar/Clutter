// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PageTitleSection } from './Page.TitleSection';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
});

/** A title section whose slot holds a stand-in for the calendar button, wired to the row's shared menu state. */
function renderRow() {
  return render(
    <PageTitleSection
      title="Today"
      onSelectEmoji={() => {}}
      headerControls={(menu) => (
        <>
          <button
            aria-label="Calendar"
            aria-expanded={menu.open}
            className={menu.open ? 'button--active' : undefined}
            onClick={() => menu.onOpenChange(!menu.open)}
          />
          {menu.open && <div data-testid="calendar-popup" />}
        </>
      )}
    />
  );
}

const more = () => screen.getByRole('button', { name: 'More actions' });
const calendar = () => screen.getByRole('button', { name: 'Calendar' });
const row = () => document.querySelector('.page-header-controls')!;

describe('the title section controls row: one open menu at a time', () => {
  it('at rest: neither menu is open and the row is not marked open', () => {
    renderRow();

    expect(more()).toHaveAttribute('aria-expanded', 'false');
    expect(calendar()).toHaveAttribute('aria-expanded', 'false');
    expect(row()).not.toHaveAttribute('data-menu-open');
  });

  it('opening the More menu marks the row open (both buttons stay visible) and highlights its trigger', () => {
    renderRow();

    fireEvent.click(more());

    expect(more()).toHaveAttribute('aria-expanded', 'true');
    expect(more()).toHaveClass('button--active');
    expect(row()).toHaveAttribute('data-menu-open');
    expect(calendar()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening the calendar marks the row open too, and highlights the calendar — not the More button', () => {
    renderRow();

    fireEvent.click(calendar());

    expect(calendar()).toHaveAttribute('aria-expanded', 'true');
    expect(calendar()).toHaveClass('button--active');
    expect(row()).toHaveAttribute('data-menu-open');
    expect(more()).toHaveAttribute('aria-expanded', 'false');
    expect(more()).not.toHaveClass('button--active');
  });

  it('opening the calendar while More is open closes More, and vice versa — never both', () => {
    renderRow();

    fireEvent.click(more());
    fireEvent.click(calendar());
    expect(calendar()).toHaveAttribute('aria-expanded', 'true');
    expect(more()).toHaveAttribute('aria-expanded', 'false');
    expect(more()).not.toHaveClass('button--active');
    expect(row()).toHaveAttribute('data-menu-open');

    fireEvent.click(more());
    expect(more()).toHaveAttribute('aria-expanded', 'true');
    expect(more()).toHaveClass('button--active');
    expect(calendar()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('calendar-popup')).toBeNull();
    expect(row()).toHaveAttribute('data-menu-open');
  });

  it('closing the open menu clears the row marker, returning to hover-based visibility', () => {
    renderRow();

    fireEvent.click(calendar());
    fireEvent.click(calendar());
    expect(row()).not.toHaveAttribute('data-menu-open');
    expect(calendar()).not.toHaveClass('button--active');

    fireEvent.click(more());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(more()).toHaveAttribute('aria-expanded', 'false');
    expect(row()).not.toHaveAttribute('data-menu-open');
  });

  it('a slot given as plain content (not a function) still renders and does not open anything', () => {
    render(<PageTitleSection title="Today" onSelectEmoji={() => {}} headerControls={<button>plain</button>} />);

    expect(screen.getByRole('button', { name: 'plain' })).toBeInTheDocument();
    expect(row()).not.toHaveAttribute('data-menu-open');
  });
});
