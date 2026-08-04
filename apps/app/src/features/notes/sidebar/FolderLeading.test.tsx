// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FolderLeading } from './FolderLeading';

afterEach(() => {
  cleanup();
});

function getCaretIcon(container: HTMLElement): HTMLElement {
  const icon = container.querySelector('.caret-icon');

  if (!icon) {
    throw new Error('expected a .caret-icon element to be rendered');
  }

  return icon as HTMLElement;
}

function getCaretButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector('.caret-slot');

  if (!button) {
    throw new Error('expected a .caret-slot button to be rendered');
  }

  return button as HTMLButtonElement;
}

describe('FolderLeading — caret visual state always reflects real expansion, never just "not disabled"', () => {
  it('empty folder: caret renders collapsed and disabled, even when isExpanded is true', () => {
    // isExpanded explicitly true: Workspace.isFolderExpanded(id) returns
    // true by default for a never-toggled id (e.g. a brand-new folder —
    // "expanded unless explicitly collapsed"), and FolderTree.tsx passes
    // that value straight through regardless of isEmpty. This is what
    // reproduces the reported bug — FolderLeading's own isExpanded
    // default (false) would pass trivially even without the fix.
    const { container } = render(<FolderLeading isEmpty isExpanded />);

    const icon = getCaretIcon(container);
    expect(icon.className).toContain('caret-icon--collapsed');
    expect(icon.className).not.toContain('caret-icon--expanded');

    expect(getCaretButton(container).disabled).toBe(true);
  });

  it('folder with children, collapsed: caret renders collapsed and enabled', () => {
    const { container } = render(<FolderLeading isEmpty={false} isExpanded={false} />);

    const icon = getCaretIcon(container);
    expect(icon.className).toContain('caret-icon--collapsed');

    expect(getCaretButton(container).disabled).toBe(false);
  });

  it('folder with children, expanded: caret renders expanded and enabled', () => {
    const { container } = render(<FolderLeading isEmpty={false} isExpanded />);

    const icon = getCaretIcon(container);
    expect(icon.className).toContain('caret-icon--expanded');
    expect(icon.className).not.toContain('caret-icon--collapsed');

    expect(getCaretButton(container).disabled).toBe(false);
  });

  it('does not change interaction behavior: onExpandToggle still fires normally for a non-empty folder', () => {
    const onExpandToggle = vi.fn();
    const { container } = render(
      <FolderLeading isEmpty={false} isExpanded={false} onExpandToggle={onExpandToggle} />
    );

    getCaretButton(container).click();

    expect(onExpandToggle).toHaveBeenCalledTimes(1);
  });

  it('does not change interaction behavior: the disabled caret button for an empty folder still does not fire onExpandToggle', () => {
    const onExpandToggle = vi.fn();
    const { container } = render(<FolderLeading isEmpty onExpandToggle={onExpandToggle} />);

    getCaretButton(container).click();

    expect(onExpandToggle).not.toHaveBeenCalled();
  });
});
