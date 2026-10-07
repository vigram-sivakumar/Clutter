import { describe, expect, it, vi } from 'vitest';

import type { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TagExpansionStore } from '@core/application/tags/TagExpansionStore';
import type { TagBatchResult, TagOperations } from '@core/application/tags/TagOperations';
import type { Workspace } from '@core/workspace/Workspace';

import {
  TAG_DELETE_CONFIRMATION_MESSAGE,
  createTagCollectionDeleteHandler,
  getTagDeleteConfirmationTitle,
} from './tagCollectionDelete';

const result = (complete: boolean): TagBatchResult => ({
  attemptedPageCount: 1,
  updatedPageIds: complete ? ['a'] : [],
  skipped: complete ? [] : [{ pageId: 'a', path: '/a.md', reason: 'changed-on-disk' }],
  failed: [],
  complete,
});

function setup(complete: boolean, activeView: unknown = { type: 'filtered-view', view: { kind: 'tag', tagName: 'design' } }) {
  const deleteTag = vi.fn(async () => result(complete));
  const deleteKey = vi.fn();
  const removeTag = vi.fn();
  const openWorkspace = vi.fn();
  const handler = createTagCollectionDeleteHandler(
    {
      tagOperations: { deleteTag } as unknown as TagOperations,
      navigation: { openWorkspace } as unknown as NavigationRouter,
      workspace: { activeView } as unknown as Workspace,
      collectionViewConfigStore: { deleteKey } as unknown as CollectionViewConfigStore,
      tagExpansionStore: { removeTag } as unknown as TagExpansionStore,
    },
    'design'
  );

  return { handler, deleteTag, deleteKey, removeTag, openWorkspace };
}

describe('Delete confirmation copy', () => {
  it('the title names the tag, with no #', () => {
    expect(getTagDeleteConfirmationTitle('Checked')).toBe('Delete Checked?');
  });

  it('shows hyphens and underscores as spaces, like the rest of the app', () => {
    expect(getTagDeleteConfirmationTitle('product-design')).toBe('Delete product design?');
    expect(getTagDeleteConfirmationTitle('Product_Design')).toBe('Delete Product Design?');
  });

  it('the body is the same for every tag and has no # or count', () => {
    expect(TAG_DELETE_CONFIRMATION_MESSAGE).toBe(
      'This will permanently delete the tag. You can\u2019t undo this action.'
    );
    expect(TAG_DELETE_CONFIRMATION_MESSAGE).not.toMatch(/#|\d/);
  });
});

describe('createTagCollectionDeleteHandler', () => {
  it('a complete delete forgets the tag\'s collection config and expansion state, then opens the workspace', async () => {
    const t = setup(true);

    await t.handler();

    expect(t.deleteTag).toHaveBeenCalledWith('design');
    expect(t.deleteKey).toHaveBeenCalledWith('tag:design');
    expect(t.removeTag).toHaveBeenCalledWith('design');
    expect(t.openWorkspace).toHaveBeenCalledTimes(1);
  });

  it('an incomplete delete changes nothing else and does not navigate away', async () => {
    const t = setup(false);

    await t.handler();

    expect(t.deleteTag).toHaveBeenCalledWith('design');
    expect(t.deleteKey).not.toHaveBeenCalled();
    expect(t.removeTag).not.toHaveBeenCalled();
    expect(t.openWorkspace).not.toHaveBeenCalled();
  });

  it('deleted from the sidebar while viewing something else, it cleans up but never moves the user', async () => {
    const t = setup(true, { type: 'page', id: 'p1' });

    await t.handler();

    expect(t.deleteTag).toHaveBeenCalledWith('design');
    expect(t.deleteKey).toHaveBeenCalledWith('tag:design');
    expect(t.removeTag).toHaveBeenCalledWith('design');
    expect(t.openWorkspace).not.toHaveBeenCalled();
  });

  it('deleted while viewing a different tag, it does not navigate either', async () => {
    const t = setup(true, { type: 'filtered-view', view: { kind: 'tag', tagName: 'other' } });

    await t.handler();

    expect(t.openWorkspace).not.toHaveBeenCalled();
  });
});
