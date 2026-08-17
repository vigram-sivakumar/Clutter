// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Tag } from './Tag';
import { buildTagSidebarMenu } from './tagSidebarMenu.config';

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

const menuItems = buildTagSidebarMenu();

function TagHarness({
  emoji,
  onChangeIcon,
}: {
  emoji?: string | null;
  onChangeIcon?: (emoji: string | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Tag
      title="project"
      emoji={emoji}
      count={2}
      menuItems={menuItems}
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      onChangeIcon={onChangeIcon}
    />
  );
}

function openMenu() {
  fireEvent.click(screen.getAllByRole('button').at(-1)!);
}

describe('Tag — sidebar Change icon wiring', () => {
  it("selecting 'Change icon' opens ChangeIconPicker", () => {
    const onChangeIcon = vi.fn();
    render(<TagHarness onChangeIcon={onChangeIcon} />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));

    expect(screen.getByPlaceholderText('Search emoji')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'grinning face' }));

    expect(onChangeIcon).toHaveBeenCalledWith('😀');
  });

  it('disables the remove button when the tag has no icon', () => {
    render(<TagHarness onChangeIcon={vi.fn()} />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));

    expect(screen.getByRole('button', { name: 'Remove icon' })).toBeDisabled();
  });

  it('removes the icon when the remove button is clicked', () => {
    const onChangeIcon = vi.fn();
    render(<TagHarness emoji="📦" onChangeIcon={onChangeIcon} />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove icon' }));

    expect(onChangeIcon).toHaveBeenCalledWith(null);
  });
});
