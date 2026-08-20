import { describe, expect, it, vi } from 'vitest';

import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TagOperations } from '@core/application/tags/TagOperations';

import {
  getCollectionPageTitleProps,
  createTagCollectionRenameHandler,
} from './tagCollectionRename';

function fakeNavigation(openTag: (name: string) => void): NavigationRouter {
  return { openTag } as unknown as NavigationRouter;
}

function fakeTagOperations(
  rename: (oldName: string, newName: string) => Promise<void>,
  canRename: (oldName: string, newName: string) => boolean = (_oldName, newName) =>
    newName.trim() !== ''
): TagOperations {
  return { rename, canRename } as unknown as TagOperations;
}

describe('getCollectionPageTitleProps', () => {
  it('a tag view is editable and displays the formatted (separator-to-space) label', () => {
    const props = getCollectionPageTitleProps({ kind: 'tag', tagName: 'Product-design' }, 'Product-design');

    expect(props.titleEditable).toBe(true);
    expect(props.title).toBe('Product design');
  });

  it('a tag view with no separator displays unchanged', () => {
    const props = getCollectionPageTitleProps({ kind: 'tag', tagName: 'project' }, 'project');

    expect(props.title).toBe('project');
  });

  it('a workspace-root view is not editable and displays the raw title unchanged', () => {
    const props = getCollectionPageTitleProps({ kind: 'workspace' }, 'Workspace');

    expect(props.titleEditable).toBe(false);
    expect(props.title).toBe('Workspace');
  });

  it('a favorites view is not editable and displays the raw title unchanged', () => {
    const props = getCollectionPageTitleProps({ kind: 'favorites' }, 'Favorites');

    expect(props.titleEditable).toBe(false);
    expect(props.title).toBe('Favorites');
  });
});

describe('createTagCollectionRenameHandler', () => {
  it('calls TagOperations.rename with the current tag name and the serialized (space-to-hyphen) new value', async () => {
    const rename = vi.fn(() => Promise.resolve());
    const handler = createTagCollectionRenameHandler(
      fakeTagOperations(rename),
      fakeNavigation(vi.fn()),
      'Product-design'
    );

    handler('UX design');
    await Promise.resolve();
    await Promise.resolve();

    expect(rename).toHaveBeenCalledWith('Product-design', 'UX-design');
  });

  it('navigates to the new canonical tag identity after a successful rename', async () => {
    const rename = vi.fn(() => Promise.resolve());
    const openTag = vi.fn();
    const handler = createTagCollectionRenameHandler(
      fakeTagOperations(rename),
      fakeNavigation(openTag),
      'Product-design'
    );

    handler('UX design');
    await Promise.resolve();
    await Promise.resolve();

    expect(openTag).toHaveBeenCalledWith('UX-design');
  });

  it('does not navigate when the rename fails', async () => {
    const rename = vi.fn(() => Promise.reject(new Error('A tag named "UX-design" already exists.')));
    const openTag = vi.fn();
    const handler = createTagCollectionRenameHandler(
      fakeTagOperations(rename),
      fakeNavigation(openTag),
      'Product-design'
    );

    handler('UX design');
    await Promise.resolve().catch(() => {});
    await Promise.resolve().catch(() => {});
    await Promise.resolve().catch(() => {});

    expect(openTag).not.toHaveBeenCalled();
  });

  it('is a no-op for an empty value — does not call rename or navigate', () => {
    const rename = vi.fn(() => Promise.resolve());
    const openTag = vi.fn();
    const handler = createTagCollectionRenameHandler(
      fakeTagOperations(rename),
      fakeNavigation(openTag),
      'Product-design'
    );

    handler('');
    handler('   ');

    expect(rename).not.toHaveBeenCalled();
    expect(openTag).not.toHaveBeenCalled();
  });

  it('leaves the tag unchanged when the value is empty (no rename call at all)', () => {
    const rename = vi.fn(() => Promise.resolve());
    const handler = createTagCollectionRenameHandler(
      fakeTagOperations(rename),
      fakeNavigation(vi.fn()),
      'Product-design'
    );

    handler('');

    expect(rename).not.toHaveBeenCalled();
  });

  it('returns false for an empty/whitespace-only value — required so EditableText treats it as rejected, not a silent no-op commit', () => {
    const handler = createTagCollectionRenameHandler(
      fakeTagOperations(vi.fn(() => Promise.resolve())),
      fakeNavigation(vi.fn()),
      'Product-design'
    );

    expect(handler('')).toBe(false);
    expect(handler('   ')).toBe(false);
  });

  it('does not return false for a valid value', () => {
    const handler = createTagCollectionRenameHandler(
      fakeTagOperations(vi.fn(() => Promise.resolve())),
      fakeNavigation(vi.fn()),
      'Product-design'
    );

    expect(handler('UX design')).not.toBe(false);
  });

  it('a value canRename() rejects (e.g. a duplicate-identity collision) returns false and never calls rename()', () => {
    const rename = vi.fn(() => Promise.resolve());
    const canRename = vi.fn(() => false);
    const handler = createTagCollectionRenameHandler(
      fakeTagOperations(rename, canRename),
      fakeNavigation(vi.fn()),
      'Product-design'
    );

    const result = handler('Marketing');

    expect(canRename).toHaveBeenCalledWith('Product-design', 'Marketing');
    expect(result).toBe(false);
    expect(rename).not.toHaveBeenCalled();
  });

  it('valid-after-invalid: a rejected value followed by a valid one calls rename() only for the valid attempt', () => {
    const rename = vi.fn(() => Promise.resolve());
    // Simulates a real collision check: only "Marketing" is taken.
    const canRename = vi.fn((_oldName: string, newName: string) => newName.trim() !== 'Marketing');
    const handler = createTagCollectionRenameHandler(
      fakeTagOperations(rename, canRename),
      fakeNavigation(vi.fn()),
      'Product-design'
    );

    expect(handler('Marketing')).toBe(false);
    expect(rename).not.toHaveBeenCalled();

    expect(handler('UX design')).not.toBe(false);
    expect(rename).toHaveBeenCalledWith('Product-design', 'UX-design');
  });

  it('a name with a character outside the tag grammar (e.g. "Personal: project") returns false and never calls rename() — same rejection path as a duplicate', () => {
    const rename = vi.fn(() => Promise.resolve());
    // Mirrors TagOperations.canRename()'s own real rejection for this
    // exact input (see TagOperations.test.ts) — this test's job is the
    // handler's reaction, not re-proving the character-grammar rule.
    const canRename = vi.fn((_oldName: string, newName: string) => !newName.includes(':'));
    const handler = createTagCollectionRenameHandler(
      fakeTagOperations(rename, canRename),
      fakeNavigation(vi.fn()),
      'Product-design'
    );

    const result = handler('Personal: project');

    expect(canRename).toHaveBeenCalledWith('Product-design', 'Personal: project');
    expect(result).toBe(false);
    expect(rename).not.toHaveBeenCalled();
  });
});
