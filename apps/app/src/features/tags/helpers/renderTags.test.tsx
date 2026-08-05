// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderTags } from './renderTags';

const noop = () => {};

afterEach(() => {
  cleanup();
});

describe('renderTags', () => {
  it('renders the assigned icon for a tag that has one', () => {
    const { container } = render(
      <>{renderTags([{ name: 'project', icon: '📦', favorite: false, usageCount: 0 }], noop)}</>
    );

    expect(screen.getAllByText('📦').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.emoji-icon').length).toBeGreaterThan(0);
  });

  it('falls back to the default tag icon when icon is absent', () => {
    const { container } = render(
      <>{renderTags([{ name: 'design', favorite: false, usageCount: 0 }], noop)}</>
    );

    // No emoji span rendered anywhere for this tag — AppIcon falls back to
    // the default "tag" system icon, unchanged from today's behavior.
    expect(container.querySelectorAll('.emoji-icon').length).toBe(0);
    expect(screen.getAllByText('design').length).toBeGreaterThan(0);
  });

  it('displays usageCount as the trailing value', () => {
    render(
      <>{renderTags([{ name: 'project', favorite: false, usageCount: 3 }], noop)}</>
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('a tag with favorite: false renders only in the remaining section, never in Favorites', () => {
    render(<>{renderTags([{ name: 'project', favorite: false, usageCount: 0 }], noop)}</>);

    expect(screen.getAllByText('project')).toHaveLength(1);
    expect(screen.queryByText('Favorites')).toBeNull();
  });

  it('a tag with favorite: true renders only in Favorites, never in the remaining section', () => {
    render(<>{renderTags([{ name: 'project', favorite: true, usageCount: 0 }], noop)}</>);

    expect(screen.getAllByText('project')).toHaveLength(1);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
  });

  it('omits the Favorites section entirely when no tag is favorited', () => {
    render(
      <>
        {renderTags([
          { name: 'project', favorite: false, usageCount: 0 },
          { name: 'design', favorite: false, usageCount: 0 },
        ], noop)}
      </>
    );

    expect(screen.queryByText('Favorites')).toBeNull();
  });

  it('renders the remaining section without a header when it is the only visible section', () => {
    const { container } = render(
      <>{renderTags([{ name: 'project', favorite: false, usageCount: 0 }], noop)}</>
    );

    expect(container.querySelectorAll('.section-header')).toHaveLength(0);
  });

  it('renders a header for the remaining section once Favorites is also visible', () => {
    const { container } = render(
      <>
        {renderTags([
          { name: 'project', favorite: true, usageCount: 0 },
          { name: 'design', favorite: false, usageCount: 0 },
        ], noop)}
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
        ], noop)}
      </>
    );

    expect(screen.getAllByText('project')).toHaveLength(1);
    expect(screen.getAllByText('design')).toHaveLength(1);
  });

  it('invokes onOpenTag with the tag name when a row is clicked', () => {
    const onOpenTag = vi.fn();
    render(<>{renderTags([{ name: 'Project', favorite: false, usageCount: 0 }], onOpenTag)}</>);

    fireEvent.click(screen.getByText('Project'));

    expect(onOpenTag).toHaveBeenCalledWith('Project');
  });
});
