// @vitest-environment jsdom
import { useRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useMenuKeyboard } from './useMenuKeyboard';

afterEach(() => {
  cleanup();
});

/**
 * A minimal, direct harness for the hook itself — no `Menu`/`MenuItem`,
 * no styling, just the exact DOM shape `useMenuKeyboard` actually depends
 * on (`role="menu"` container, `role="menuitem"` children, optional
 * `aria-disabled`). `activeId` is exposed via a `data-active-id`
 * attribute for easy assertion.
 */
function Harness({
  itemIds,
  disabledIds = [],
  preferredActiveId,
}: {
  itemIds: string[];
  disabledIds?: string[];
  preferredActiveId?: string | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { activeId, handleKeyDown } = useMenuKeyboard(menuRef, {
    preferredActiveId,
  });

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      data-active-id={activeId ?? ''}
    >
      {itemIds.map((id) => (
        <div
          key={id}
          id={id}
          role="menuitem"
          aria-disabled={disabledIds.includes(id) || undefined}
        >
          {id}
        </div>
      ))}
    </div>
  );
}

function activeIdOf(): string {
  return screen.getByRole('menu').getAttribute('data-active-id') ?? '';
}

describe('useMenuKeyboard — preferredActiveId', () => {
  it('omitted entirely: activeId starts undefined and stays that way until an explicit Arrow/setActiveId call — exact prior behavior, unchanged', () => {
    render(<Harness itemIds={['a', 'b', 'c']} />);

    expect(activeIdOf()).toBe('');

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });

    // Arrow navigation itself is completely unaffected by this option —
    // it still falls back to the first item on the first press, same as
    // always.
    expect(activeIdOf()).toBe('a');
  });

  it('provided and present among the items: that item becomes active immediately, not the first item', () => {
    render(<Harness itemIds={['a', 'b', 'c']} preferredActiveId="b" />);

    expect(activeIdOf()).toBe('b');
  });

  it('provided but not present among the items: falls back to the first item', () => {
    render(<Harness itemIds={['a', 'b', 'c']} preferredActiveId="not-here" />);

    expect(activeIdOf()).toBe('a');
  });

  it('null (opted in, no current preference): resolves to the first item, not left untouched', () => {
    render(<Harness itemIds={['a', 'b', 'c']} preferredActiveId={null} />);

    expect(activeIdOf()).toBe('a');
  });

  it('the preferred item disappearing due to filtering falls back to the first remaining item', () => {
    const { rerender } = render(
      <Harness itemIds={['a', 'b', 'c']} preferredActiveId="b" />
    );
    expect(activeIdOf()).toBe('b');

    rerender(<Harness itemIds={['a', 'c']} preferredActiveId="b" />);

    expect(activeIdOf()).toBe('a');
  });

  it('the preferred item reappearing after being filtered out becomes active again', () => {
    const { rerender } = render(
      <Harness itemIds={['a', 'b', 'c']} preferredActiveId="b" />
    );
    expect(activeIdOf()).toBe('b');

    rerender(<Harness itemIds={['a', 'c']} preferredActiveId="b" />);
    expect(activeIdOf()).toBe('a');

    rerender(<Harness itemIds={['a', 'b', 'c']} preferredActiveId="b" />);
    expect(activeIdOf()).toBe('b');
  });

  it('an empty item list clears the active id entirely, even with a preferred id set', () => {
    const { rerender } = render(
      <Harness itemIds={['a', 'b', 'c']} preferredActiveId="b" />
    );
    expect(activeIdOf()).toBe('b');

    rerender(<Harness itemIds={[]} preferredActiveId="b" />);

    expect(activeIdOf()).toBe('');
  });

  it('a disabled preferred item is treated as not navigable — falls back to the first navigable item', () => {
    render(
      <Harness
        itemIds={['a', 'b', 'c']}
        disabledIds={['b']}
        preferredActiveId="b"
      />
    );

    expect(activeIdOf()).toBe('a');
  });

  it('does not override an in-progress Arrow-key navigation when the navigable set has not actually changed', () => {
    render(<Harness itemIds={['a', 'b', 'c']} preferredActiveId="a" />);
    expect(activeIdOf()).toBe('a');

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });

    // The user has now deliberately navigated to "b" — a re-render with
    // the exact same item set must not silently snap back to the
    // preferred "a".
    expect(activeIdOf()).toBe('b');
  });

  it('still exactly one active item at a time, matching the single-active-item invariant elsewhere in this menu system', () => {
    render(<Harness itemIds={['a', 'b', 'c']} preferredActiveId="b" />);

    const activeCount = screen
      .getAllByRole('menuitem')
      .filter((item) => item.id === activeIdOf()).length;
    expect(activeCount).toBe(1);
  });
});
