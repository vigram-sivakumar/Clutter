// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Overlay inside SpaceAvatarPicker measures itself with ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

import {
  SpaceDetails,
  draftForExistingFolder,
  type CreateFolderResult,
  type NewSpaceDraft,
} from './SpaceDetails';

const EXISTING = '/Volumes/Drive/notes';

const nameInput = () =>
  document.getElementById('space-details-name') as HTMLInputElement;
const create = () => act(async () => screen.getByText('Create').click());
const type = (name: string) =>
  fireEvent.change(nameInput(), { target: { value: name } });

interface Harness {
  onRenameFolder: ReturnType<typeof vi.fn>;
  onOpenSpace: ReturnType<typeof vi.fn>;
  onCreateFolder: ReturnType<typeof vi.fn>;
}

/**
 * Holds the draft the way AppShell does: typing updates its name, and a rename replaces the draft with the
 * renamed folder's (that is the caller's job, and what makes a retry not rename twice).
 */
function renderDetails(
  initial: NewSpaceDraft,
  options: {
    rename?: (path: string, name: string) => Promise<CreateFolderResult>;
    open?: () => Promise<string | null>;
    withRename?: boolean;
  } = {}
): Harness {
  const onRenameFolder = vi.fn(
    options.rename ??
      (async (path: string, name: string): Promise<CreateFolderResult> => ({
        path: `${path.slice(0, path.lastIndexOf('/'))}/${name}`,
      }))
  );
  const onOpenSpace = vi.fn(options.open ?? (async () => null));
  const onCreateFolder = vi.fn(
    async (name: string): Promise<CreateFolderResult> => ({
      path: `/Users/me/Documents/${name}`,
    })
  );

  function Host() {
    const [draft, setDraft] = useState(initial);
    return (
      <SpaceDetails
        draft={draft}
        onNameChange={(name) => setDraft((current) => ({ ...current, name }))}
        onAvatarChange={(avatar) =>
          setDraft((current) => ({ ...current, avatar }))
        }
        onCreateFolder={onCreateFolder}
        onRenameFolder={
          options.withRename === false
            ? undefined
            : async (path, name) => {
                const renamed = await onRenameFolder(path, name);
                if ('path' in renamed)
                  setDraft(draftForExistingFolder(renamed.path));
                return renamed;
              }
        }
        onOpenSpace={onOpenSpace}
      />
    );
  }
  render(<Host />);
  return { onRenameFolder, onOpenSpace, onCreateFolder };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(cleanup);

describe('SpaceDetails: an existing folder’s name', () => {
  it('is editable and prefilled with the folder’s current name; the location stays read-only', () => {
    renderDetails(draftForExistingFolder(EXISTING));

    expect(nameInput()).toHaveValue('notes');
    expect(nameInput()).not.toHaveAttribute('readonly');
    const location = document.getElementById(
      'space-details-location'
    ) as HTMLInputElement;
    expect(location).toHaveAttribute('readonly');
    expect(location).toHaveValue('Drive/notes');
  });

  it('is read-only for the open Space (nameLocked) and when the caller cannot rename', () => {
    renderDetails({ ...draftForExistingFolder(EXISTING), nameLocked: true });
    expect(nameInput()).toHaveAttribute('readonly');
    cleanup();

    renderDetails(draftForExistingFolder(EXISTING), { withRename: false });
    expect(nameInput()).toHaveAttribute('readonly');
  });

  it('opens the folder as it is, renaming nothing, when the name is unchanged', async () => {
    const { onRenameFolder, onOpenSpace } = renderDetails(
      draftForExistingFolder(EXISTING)
    );

    await create();

    expect(onRenameFolder).not.toHaveBeenCalled();
    expect(onOpenSpace).toHaveBeenCalledWith(EXISTING, undefined);
  });

  it('treats a name that is only padded with spaces as unchanged', async () => {
    const { onRenameFolder, onOpenSpace } = renderDetails(
      draftForExistingFolder(EXISTING)
    );
    type('  notes  ');

    await create();

    expect(onRenameFolder).not.toHaveBeenCalled();
    expect(onOpenSpace).toHaveBeenCalledWith(EXISTING, undefined);
  });

  it('renames the folder in place on Create, then opens it at its new path', async () => {
    const { onRenameFolder, onOpenSpace } = renderDetails(
      draftForExistingFolder(EXISTING)
    );
    type(' Journal ');

    expect(onRenameFolder).not.toHaveBeenCalled(); // typing alone never touches the folder
    await create();

    expect(onRenameFolder).toHaveBeenCalledTimes(1);
    expect(onRenameFolder).toHaveBeenCalledWith(EXISTING, 'Journal');
    expect(onOpenSpace).toHaveBeenCalledWith(
      '/Volumes/Drive/Journal',
      undefined
    );
  });

  it('hands the chosen avatar to the renamed folder’s open', async () => {
    const { onOpenSpace } = renderDetails({
      ...draftForExistingFolder(EXISTING),
      avatar: { type: 'emoji', emoji: '🌿' },
    });
    type('Journal');

    await create();

    expect(onOpenSpace).toHaveBeenCalledWith('/Volumes/Drive/Journal', {
      type: 'emoji',
      emoji: '🌿',
    });
  });

  it('opens nothing when the rename fails: a taken name, a permission refusal, anything', async () => {
    for (const error of [
      'A folder with that name already exists. Choose another name',
      'Clutter doesn’t have permission to rename a folder in Drive',
    ]) {
      const { onRenameFolder, onOpenSpace } = renderDetails(
        draftForExistingFolder(EXISTING),
        {
          rename: async () => ({ error }),
        }
      );
      type('Taken');

      await create();

      expect(onRenameFolder).toHaveBeenCalledTimes(1);
      expect(onOpenSpace).not.toHaveBeenCalled();
      expect(nameInput()).toHaveValue('Taken'); // the screen stays as the user left it
      cleanup();
    }
  });

  it('renames nothing for a name that cannot be a folder name', async () => {
    const { onRenameFolder, onOpenSpace } = renderDetails(
      draftForExistingFolder(EXISTING)
    );

    for (const name of ['', '   ', '..', 'a/b', 'a:b']) {
      type(name);
      await create();
    }

    expect(onRenameFolder).not.toHaveBeenCalled();
    expect(onOpenSpace).not.toHaveBeenCalled();
  });

  it('after a rename whose open failed, a retry opens the renamed folder and never renames twice', async () => {
    const open = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce('watcher failed')
      .mockResolvedValue(null);
    const { onRenameFolder, onOpenSpace } = renderDetails(
      draftForExistingFolder(EXISTING),
      { open }
    );
    type('Journal');

    await create();
    expect(nameInput()).toHaveValue('Journal');
    await create();

    expect(onRenameFolder).toHaveBeenCalledTimes(1);
    expect(onOpenSpace).toHaveBeenCalledTimes(2);
    expect(onOpenSpace).toHaveBeenLastCalledWith(
      '/Volumes/Drive/Journal',
      undefined
    );
  });

  it('a new folder (not existing) still creates it and never renames anything', async () => {
    const { onRenameFolder, onCreateFolder, onOpenSpace } = renderDetails({
      parentPath: '/Users/me/Documents',
      parentName: 'Documents',
      name: '',
    });
    type('Fresh');

    await create();

    expect(onRenameFolder).not.toHaveBeenCalled();
    expect(onCreateFolder).toHaveBeenCalledWith('Fresh');
    expect(onOpenSpace).toHaveBeenCalledWith(
      '/Users/me/Documents/Fresh',
      undefined
    );
  });
});

describe('SpaceDetails: Create with an unusable name', () => {
  const NEW_DRAFT = {
    parentPath: '/Users/me/Documents',
    parentName: 'Documents',
    name: '',
  };
  const nameCard = () => nameInput().closest('.settings-entry') as HTMLElement;

  it('shakes the whole name card, keeps the focus in the name field and creates nothing', async () => {
    const { onCreateFolder, onOpenSpace } = renderDetails(NEW_DRAFT);
    expect(nameCard()).not.toHaveClass('space-details__name--shake');

    await create();

    expect(nameCard()).toHaveClass('space-details__name--shake');
    expect(nameInput()).toHaveFocus();
    expect(onCreateFolder).not.toHaveBeenCalled();
    expect(onOpenSpace).not.toHaveBeenCalled();
  });

  it('stops shaking when the animation ends, and shakes again on the next click', async () => {
    renderDetails(NEW_DRAFT);

    await create();
    // jsdom has no unprefixed `animationend`, so React listens for the prefixed one there.
    fireEvent(nameCard(), new Event('webkitAnimationEnd', { bubbles: true }));
    expect(nameCard()).not.toHaveClass('space-details__name--shake');

    await create();
    expect(nameCard()).toHaveClass('space-details__name--shake');
  });

  it('does not shake for a usable name', async () => {
    renderDetails(NEW_DRAFT);
    type('Fresh');

    await create();

    expect(nameCard()).not.toHaveClass('space-details__name--shake');
  });
});
