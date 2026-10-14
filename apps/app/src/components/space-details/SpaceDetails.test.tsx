// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
const openMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...a: unknown[]) => openMock(...a),
}));

import {
  SpaceDetails,
  isValidSpaceName,
  type NewSpaceDraft,
} from './SpaceDetails';

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  openMock.mockReset();
});

const emptyDraft: NewSpaceDraft = {
  parentPath: '/Users/me/Documents',
  parentName: 'Documents',
  name: '',
};

function setup(draft: NewSpaceDraft = emptyDraft) {
  const onNameChange = vi.fn();
  const onParentChange = vi.fn();
  render(
    <SpaceDetails
      draft={draft}
      onNameChange={onNameChange}
      onParentChange={onParentChange}
    />
  );
  return { onNameChange, onParentChange };
}

const nameInput = () => screen.getByLabelText('Space Name');
const nameCard = () => nameInput().closest('.space-details__card');
const createButton = () => screen.getByRole('button', { name: 'Create' });
const changeButton = () => screen.getByRole('button', { name: 'Change' });

describe('SpaceDetails name', () => {
  it('starts empty, with no placeholder or default name', () => {
    setup();
    expect(nameInput()).toHaveValue('');
    expect(nameInput()).not.toHaveAttribute('placeholder');
    expect(screen.queryByDisplayValue('Clutter')).toBeNull();
  });

  it('reports edits', () => {
    const { onNameChange } = setup();
    fireEvent.change(nameInput(), { target: { value: 'Personal' } });
    expect(onNameChange).toHaveBeenCalledWith('Personal');
  });

  it('shakes the card (no message) when the name is cleared or invalid, and passes text through', () => {
    const { onNameChange } = setup({ ...emptyDraft, name: 'Work' });
    fireEvent.change(nameInput(), { target: { value: 'a/b' } });

    expect(nameCard()).toHaveClass('editable-text--shake');
    expect(onNameChange).toHaveBeenCalledWith('a/b');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not shake for a valid name', () => {
    setup();
    fireEvent.change(nameInput(), { target: { value: 'Personal' } });
    expect(nameCard()).not.toHaveClass('editable-text--shake');
  });

  it('ignores Enter — only the Create button creates', () => {
    setup({ ...emptyDraft, name: 'Personal' });
    fireEvent.keyDown(nameInput(), { key: 'Enter' });
    fireEvent.keyPress(nameInput(), { key: 'Enter', charCode: 13 });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(nameInput().closest('form')).toBeNull();
  });
});

describe('SpaceDetails location', () => {
  it('shows only the parent, never the space name', () => {
    setup({ ...emptyDraft, name: 'Personal' });
    const location = screen.getByText('Documents/');
    expect(location).toHaveAttribute('title', '/Users/me/Documents');
    expect(screen.queryByText('Documents/Personal')).toBeNull();
  });

  it('Change picks a parent folder via the validator and reports it', async () => {
    openMock.mockResolvedValue('/Users/me/Work');
    invokeMock.mockResolvedValue({ path: '/Users/me/Work', name: 'Work' });
    const { onParentChange } = setup();

    await act(async () => fireEvent.click(changeButton()));

    expect(invokeMock).toHaveBeenCalledWith('validate_space_folder', {
      path: '/Users/me/Work',
    });
    expect(onParentChange).toHaveBeenCalledWith({
      parentPath: '/Users/me/Work',
      parentName: 'Work',
    });
  });

  it('Change does nothing when cancelled', async () => {
    openMock.mockResolvedValue(null);
    const { onParentChange } = setup();

    await act(async () => fireEvent.click(changeButton()));

    expect(invokeMock).not.toHaveBeenCalled();
    expect(onParentChange).not.toHaveBeenCalled();
  });

  it('Change shakes the Location card and keeps the parent when the folder is unusable', async () => {
    openMock.mockResolvedValue('/Users/me/Locked');
    invokeMock.mockRejectedValue('read-only');
    const { onParentChange } = setup();

    await act(async () => fireEvent.click(changeButton()));

    expect(onParentChange).not.toHaveBeenCalled();
    expect(changeButton().closest('.space-details__card')).toHaveClass(
      'editable-text--shake'
    );
  });
});

describe('SpaceDetails Create', () => {
  it('is never disabled, and shakes the name card without creating for an empty or invalid name', async () => {
    for (const name of ['', '   ', 'a/b', '..']) {
      cleanup();
      invokeMock.mockReset();
      setup({ ...emptyDraft, name });
      expect(createButton()).toBeEnabled();

      await act(async () => fireEvent.click(createButton()));

      expect(nameCard()).toHaveClass('editable-text--shake');
      expect(invokeMock).not.toHaveBeenCalled();
    }
  });

  it('never disables Change either', () => {
    setup();
    expect(changeButton()).toBeEnabled();
  });

  it('creates nothing on render or while typing', () => {
    setup({ ...emptyDraft, name: 'Personal' });
    fireEvent.change(nameInput(), { target: { value: 'Personal 2' } });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('creates <parent>/<trimmed name> only when clicked, then ignores further clicks', async () => {
    invokeMock.mockResolvedValue({
      path: '/Users/me/Documents/Personal',
      name: 'Personal',
    });
    setup({ ...emptyDraft, name: '  Personal  ' });
    expect(createButton()).toBeEnabled();

    await act(async () => fireEvent.click(createButton()));

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('create_space_folder', {
      parentPath: '/Users/me/Documents',
      name: 'Personal',
    });
    expect(createButton()).toBeEnabled();

    await act(async () => fireEvent.click(createButton()));
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('shakes the name card and stays enabled when the folder already exists', async () => {
    invokeMock.mockRejectedValue('"Personal" already exists in Documents.');
    setup({ ...emptyDraft, name: 'Personal' });

    await act(async () => fireEvent.click(createButton()));

    expect(nameCard()).toHaveClass('editable-text--shake');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(createButton()).toBeEnabled();
  });

  it('ignores a second click while creating', async () => {
    let resolve!: (v: unknown) => void;
    invokeMock.mockReturnValue(new Promise((r) => (resolve = r)));
    setup({ ...emptyDraft, name: 'Personal' });

    await act(async () => fireEvent.click(createButton()));
    await act(async () => fireEvent.click(createButton()));
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ path: '/p', name: 'Personal' }));
  });
});

describe('isValidSpaceName', () => {
  it.each(['Personal', '  Work  ', 'My Space 2', 'Café ✨'])(
    'accepts %j',
    (name) => {
      expect(isValidSpaceName(name)).toBe(true);
    }
  );

  it.each([
    '',
    '   ',
    '.',
    '..',
    'a/b',
    'a\\b',
    'a:b',
    'a\u0000b',
    'x'.repeat(256),
  ])('rejects %j', (name) => {
    expect(isValidSpaceName(name)).toBe(false);
  });
});
