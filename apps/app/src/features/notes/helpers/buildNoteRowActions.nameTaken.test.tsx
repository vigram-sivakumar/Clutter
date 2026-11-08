// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetNameTakenToast } from '@components/toast/showNameTaken';
import type { ToastApi, ToastInput } from '@components/toast/ToastProvider';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { Vault } from '@core/vault/models/Vault';

// The move destinations are assembled from the whole folder tree when the actions are built; none of that is under test.
vi.mock('./buildMoveDestinationItems', () => ({ buildMoveDestinationItems: () => () => [] }));

import { buildNoteRowActions } from './buildNoteRowActions';

/** The sidebar note row's title commit: a refused title tells the user why, once, and still rejects (shake / revert). */
function setup(canRename: boolean) {
  const shown: ToastInput[] = [];
  const toast: ToastApi = { show: (input) => (shown.push(input), shown.length), fail: () => null, dismiss: () => {} };
  const updateDraftTitle = vi.fn(() => Promise.resolve());
  const actions = buildNoteRowActions({
    vault: { root: '/vault' } as unknown as Vault,
    pageOperations: { canRename: vi.fn(() => canRename), updateDraftTitle } as unknown as PageOperations,
    folderOperations: {} as unknown as FolderOperations,
    membershipSelector: {} as unknown as MembershipSelector,
    toast,
    openMenuId: null,
    onOpenMenu: () => {},
    onCloseMenu: () => {},
    editingId: null,
    onStartRename: () => {},
    onRenameEnd: () => {},
  });
  const texts = () => shown.map((input) => render(<div>{input.text}</div>).container.textContent);
  return { actions, texts, updateDraftTitle };
}

beforeEach(() => resetNameTakenToast());

describe('buildNoteRowActions — a refused rename title', () => {
  it('a persisted note: rejects a taken title with false and says it is already taken, once', () => {
    const { actions, texts } = setup(false);

    expect(actions.onNoteTitleCommit('page-1', 'Alpha')).toBe(false);
    expect(actions.onNoteTitleCommit('page-1', 'Alpha')).toBe(false);

    expect(texts()).toEqual(['The name “Alpha” is already taken']);
  });

  it('a persisted note: accepts a free title with no toast', () => {
    const { actions, texts } = setup(true);

    expect(actions.onNoteTitleCommit('page-1', 'Fresh')).toBeUndefined();

    expect(texts()).toEqual([]);
  });

  it('a draft: rejects a taken title with false, says why, and never reaches updateDraftTitle', () => {
    const { actions, texts, updateDraftTitle } = setup(false);

    expect(actions.onDraftTitleCommit('draft-1', 'Alpha')).toBe(false);

    expect(texts()).toEqual(['The name “Alpha” is already taken']);
    expect(updateDraftTitle).not.toHaveBeenCalled();
  });

  it('a draft: a free title goes to updateDraftTitle with no toast', () => {
    const { actions, texts, updateDraftTitle } = setup(true);

    actions.onDraftTitleCommit('draft-1', 'Fresh');

    expect(updateDraftTitle).toHaveBeenCalledWith('draft-1', 'Fresh');
    expect(texts()).toEqual([]);
  });
});
