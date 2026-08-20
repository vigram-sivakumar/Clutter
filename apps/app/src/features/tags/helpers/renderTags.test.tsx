// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderTags, type TagRowActions } from './renderTags';

const noop = () => {};
const renderOptions = { onOpenTag: noop };

function fakeRowActions(overrides: Partial<TagRowActions> = {}): TagRowActions {
  return {
    openMenuId: null,
    onOpenMenu: noop,
    onCloseMenu: noop,
    onChangeTagIcon: noop,
    editingId: null,
    onStartRename: noop,
    onRenameEnd: noop,
    onCommitRename: noop,
    ...overrides,
  };
}

// Only needed once a test renders a row with its overflow menu already
// open (Overlay's positioning effect) — same stub Tag.test.tsx uses.
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

describe('renderTags', () => {
  it('renders the assigned icon for a tag that has one', () => {
    const { container } = render(
      <>{renderTags([{ name: 'project', icon: '📦', favorite: false, usageCount: 0 }], renderOptions)}</>
    );

    expect(screen.getAllByText('📦').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.emoji-icon').length).toBeGreaterThan(0);
  });

  it('falls back to the default tag icon when icon is absent', () => {
    const { container } = render(
      <>{renderTags([{ name: 'design', favorite: false, usageCount: 0 }], renderOptions)}</>
    );

    // No emoji span rendered anywhere for this tag — AppIcon falls back to
    // the default "tag" system icon, unchanged from today's behavior.
    expect(container.querySelectorAll('.emoji-icon').length).toBe(0);
    expect(screen.getAllByText('design').length).toBeGreaterThan(0);
  });

  it('displays usageCount as the trailing value', () => {
    render(
      <>{renderTags([{ name: 'project', favorite: false, usageCount: 3 }], renderOptions)}</>
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('a tag with favorite: false renders only in the remaining section, never in Favorites', () => {
    render(<>{renderTags([{ name: 'project', favorite: false, usageCount: 0 }], renderOptions)}</>);

    expect(screen.getAllByText('project')).toHaveLength(1);
    expect(screen.queryByText('Favorites')).toBeNull();
  });

  it('a tag with favorite: true renders only in Favorites, never in the remaining section', () => {
    render(<>{renderTags([{ name: 'project', favorite: true, usageCount: 0 }], renderOptions)}</>);

    expect(screen.getAllByText('project')).toHaveLength(1);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
  });

  it('omits the Favorites section entirely when no tag is favorited', () => {
    render(
      <>
        {renderTags([
          { name: 'project', favorite: false, usageCount: 0 },
          { name: 'design', favorite: false, usageCount: 0 },
        ], renderOptions)}
      </>
    );

    expect(screen.queryByText('Favorites')).toBeNull();
  });

  it('renders the remaining section without a header when it is the only visible section', () => {
    const { container } = render(
      <>{renderTags([{ name: 'project', favorite: false, usageCount: 0 }], renderOptions)}</>
    );

    expect(container.querySelectorAll('.section-header')).toHaveLength(0);
  });

  it('renders a header for the remaining section once Favorites is also visible', () => {
    const { container } = render(
      <>
        {renderTags([
          { name: 'project', favorite: true, usageCount: 0 },
          { name: 'design', favorite: false, usageCount: 0 },
        ], renderOptions)}
      </>
    );

    // One header for Favorites, one for the remaining section.
    expect(container.querySelectorAll('.section-header')).toHaveLength(2);
  });

  it('never renders the same tag in both groups', () => {
    render(
      <>
        {renderTags([
          { name: 'project', favorite: true, usageCount: 0 },
          { name: 'design', favorite: false, usageCount: 0 },
        ], renderOptions)}
      </>
    );

    expect(screen.getAllByText('project')).toHaveLength(1);
    expect(screen.getAllByText('design')).toHaveLength(1);
  });

  it('invokes onOpenTag with the tag name when a row is clicked', () => {
    const onOpenTag = vi.fn();
    render(<>{renderTags([{ name: 'Project', favorite: false, usageCount: 0 }], { onOpenTag })}</>);

    fireEvent.click(screen.getByText('Project'));

    expect(onOpenTag).toHaveBeenCalledWith('Project');
  });

  describe('display formatting (formatTagDisplayLabel) vs. raw identity', () => {
    it('a hyphen-separated tag name displays with the separator rendered as a space', () => {
      render(
        <>{renderTags([{ name: 'Product-design', favorite: false, usageCount: 0 }], renderOptions)}</>
      );

      expect(screen.getByText('Product design')).toBeInTheDocument();
      expect(screen.queryByText('Product-design')).toBeNull();
    });

    it('an underscore-separated tag name displays with the separator rendered as a space', () => {
      render(
        <>{renderTags([{ name: 'Product_design', favorite: false, usageCount: 0 }], renderOptions)}</>
      );

      expect(screen.getByText('Product design')).toBeInTheDocument();
      expect(screen.queryByText('Product_design')).toBeNull();
    });

    it('clicking a hyphen-separated tag\'s row still calls onOpenTag with the raw stored name, not the display label', () => {
      const onOpenTag = vi.fn();
      render(
        <>{renderTags([{ name: 'Product-design', favorite: false, usageCount: 0 }], { onOpenTag })}</>
      );

      fireEvent.click(screen.getByText('Product design'));

      expect(onOpenTag).toHaveBeenCalledWith('Product-design');
    });

    it('clicking an underscore-separated tag\'s row still calls onOpenTag with the raw stored name, not the display label', () => {
      const onOpenTag = vi.fn();
      render(
        <>{renderTags([{ name: 'Product_design', favorite: false, usageCount: 0 }], { onOpenTag })}</>
      );

      fireEvent.click(screen.getByText('Product design'));

      expect(onOpenTag).toHaveBeenCalledWith('Product_design');
    });

    it('a tag name with no separator displays unchanged, exactly as before', () => {
      render(
        <>{renderTags([{ name: 'project', favorite: false, usageCount: 0 }], renderOptions)}</>
      );

      expect(screen.getByText('project')).toBeInTheDocument();
    });
  });

  describe('Rename', () => {
    it("selecting 'Rename' from the overflow menu calls onStartRename with the raw tag name", () => {
      const onStartRename = vi.fn();
      // openMenuId set directly, rather than simulating the click-to-open
      // interaction: rowActions is a static fixture here, not React
      // state, so a click handled by a no-op onOpenMenu stub would never
      // actually re-render the menu open — that "click opens the menu"
      // behavior is already covered generically (Tag.test.tsx), this
      // test is only about what selecting the item does.
      const rowActions = fakeRowActions({ openMenuId: 'Product-design', onStartRename });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { onOpenTag: noop, rowActions }
          )}
        </>
      );

      fireEvent.click(screen.getByText('Rename'));

      expect(onStartRename).toHaveBeenCalledWith('Product-design');
    });

    it('the row whose raw name matches editingId enters inline edit mode, pre-filled with the display value', () => {
      const rowActions = fakeRowActions({ editingId: 'Product-design' });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { onOpenTag: noop, rowActions }
          )}
        </>
      );

      const field = screen.getByRole('textbox');
      expect(field.textContent).toBe('Product design');
    });

    it('a row NOT matching editingId is unaffected, still a static, clickable row', () => {
      const onOpenTag = vi.fn();
      const rowActions = fakeRowActions({ editingId: 'design' });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { onOpenTag, rowActions }
          )}
        </>
      );

      expect(screen.queryByRole('textbox')).toBeNull();
      fireEvent.click(screen.getByText('Product design'));
      expect(onOpenTag).toHaveBeenCalledWith('Product-design');
    });

    it('committing the edit calls onCommitRename with the raw old name and the typed value', () => {
      const onCommitRename = vi.fn();
      const rowActions = fakeRowActions({ editingId: 'Product-design', onCommitRename });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { onOpenTag: noop, rowActions }
          )}
        </>
      );

      const field = screen.getByRole('textbox');
      field.textContent = 'UX design';
      fireEvent.input(field);
      fireEvent.keyDown(field, { key: 'Enter' });

      expect(onCommitRename).toHaveBeenCalledWith('Product-design', 'UX design');
    });

    it('Escape ends the rename session without committing — onRenameEnd fires, onCommitRename does not', () => {
      const onCommitRename = vi.fn();
      const onRenameEnd = vi.fn();
      const rowActions = fakeRowActions({
        editingId: 'Product-design',
        onCommitRename,
        onRenameEnd,
      });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { onOpenTag: noop, rowActions }
          )}
        </>
      );

      const field = screen.getByRole('textbox');
      field.textContent = 'UX design';
      fireEvent.input(field);
      fireEvent.keyDown(field, { key: 'Escape' });

      expect(onCommitRename).not.toHaveBeenCalled();
      expect(onRenameEnd).toHaveBeenCalledTimes(1);
    });

    it('clicking a row mid-rename does not also navigate (edit mode suppresses the click-to-open handler)', () => {
      const onOpenTag = vi.fn();
      const rowActions = fakeRowActions({ editingId: 'Product-design' });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { onOpenTag, rowActions }
          )}
        </>
      );

      fireEvent.click(screen.getByRole('textbox'));

      expect(onOpenTag).not.toHaveBeenCalled();
    });
  });
});
