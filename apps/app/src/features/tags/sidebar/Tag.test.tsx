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
  onMenuSelect,
}: {
  emoji?: string | null;
  onChangeIcon?: (emoji: string | null) => void;
  onMenuSelect?: (id: string) => void;
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
      onMenuSelect={onMenuSelect}
    />
  );
}

function EditingTagHarness({
  onTitleCommit,
  onTitleCancel,
  onTitleEditingEnd,
}: {
  onTitleCommit?: (value: string) => void;
  onTitleCancel?: () => void;
  onTitleEditingEnd?: () => void;
}) {
  return (
    <Tag
      title="Product design"
      isEditing
      onTitleCommit={onTitleCommit}
      onTitleCancel={onTitleCancel}
      onTitleEditingEnd={onTitleEditingEnd}
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

describe('Tag — sidebar Rename wiring', () => {
  it("the overflow menu offers a 'Rename' action", () => {
    render(<TagHarness />);

    openMenu();

    expect(screen.getByText('Rename')).toBeInTheDocument();
  });

  it("selecting 'Rename' forwards the 'rename' id to onMenuSelect — the row's own signal to enter edit mode", () => {
    const onMenuSelect = vi.fn();
    render(<TagHarness onMenuSelect={onMenuSelect} />);

    openMenu();
    fireEvent.click(screen.getByText('Rename'));

    expect(onMenuSelect).toHaveBeenCalledWith('rename');
  });

  it('isEditing renders the title as an editable field, pre-filled with the display value', () => {
    render(<EditingTagHarness />);

    const field = screen.getByRole('textbox');
    expect(field.textContent).toBe('Product design');
  });

  it('committing (Enter) fires onTitleCommit with the edited value', () => {
    const onTitleCommit = vi.fn();
    render(<EditingTagHarness onTitleCommit={onTitleCommit} />);

    const field = screen.getByRole('textbox');
    field.textContent = 'UX design';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onTitleCommit).toHaveBeenCalledWith('UX design');
  });

  it('committing (blur with a changed value) fires onTitleCommit', () => {
    const onTitleCommit = vi.fn();
    render(<EditingTagHarness onTitleCommit={onTitleCommit} />);

    const field = screen.getByRole('textbox');
    field.textContent = 'UX design';
    fireEvent.input(field);
    fireEvent.blur(field);

    expect(onTitleCommit).toHaveBeenCalledWith('UX design');
  });

  it('Escape cancels — onTitleCommit never fires, onTitleCancel does, and the tag is left unchanged', () => {
    const onTitleCommit = vi.fn();
    const onTitleCancel = vi.fn();
    render(<EditingTagHarness onTitleCommit={onTitleCommit} onTitleCancel={onTitleCancel} />);

    const field = screen.getByRole('textbox');
    field.textContent = 'UX design';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(onTitleCommit).not.toHaveBeenCalled();
    expect(onTitleCancel).toHaveBeenCalledTimes(1);
    // The field itself reverts to the original value — nothing was renamed.
    expect(field.textContent).toBe('Product design');
  });

  it('an unchanged commit (blur with no edit) does not fire onTitleCommit', () => {
    const onTitleCommit = vi.fn();
    render(<EditingTagHarness onTitleCommit={onTitleCommit} />);

    fireEvent.blur(screen.getByRole('textbox'));

    expect(onTitleCommit).not.toHaveBeenCalled();
  });

  it('onTitleEditingEnd fires when the rename session ends, whether committed or cancelled', () => {
    const onTitleEditingEnd = vi.fn();
    const { unmount } = render(<EditingTagHarness onTitleEditingEnd={onTitleEditingEnd} />);

    fireEvent.blur(screen.getByRole('textbox'));
    expect(onTitleEditingEnd).toHaveBeenCalledTimes(1);

    unmount();
    onTitleEditingEnd.mockClear();

    render(<EditingTagHarness onTitleEditingEnd={onTitleEditingEnd} />);
    const field = screen.getByRole('textbox');
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(onTitleEditingEnd).toHaveBeenCalledTimes(1);
  });
});
