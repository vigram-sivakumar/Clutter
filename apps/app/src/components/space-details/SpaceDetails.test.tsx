// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
const openMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...a: unknown[]) => openMock(...a),
}));

import { SpaceDetails, isValidSpaceName } from './SpaceDetails';

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  openMock.mockReset();
});

const draft = {
  parentPath: '/Users/me/Documents',
  parentName: 'Documents',
  name: 'Clutter',
};

describe('SpaceDetails', () => {
  it('shows the editable name and the read-only parent location', () => {
    const onNameChange = vi.fn();
    render(
      <SpaceDetails
        draft={draft}
        onNameChange={onNameChange}
        onParentChange={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Space Name');
    expect(input).toHaveValue('Clutter');
    fireEvent.change(input, { target: { value: 'Personal' } });
    expect(onNameChange).toHaveBeenCalledWith('Personal');

    const location = screen.getByText('Documents/Clutter');
    expect(location).toHaveAttribute('title', '/Users/me/Documents/Clutter');
    expect(location.tagName).not.toBe('INPUT');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('shakes — with no message — when the name is cleared', () => {
    render(
      <SpaceDetails
        draft={draft}
        onNameChange={vi.fn()}
        onParentChange={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Space Name');

    fireEvent.change(input, { target: { value: '' } });

    expect(input.closest('.space-details__card')).toHaveClass(
      'editable-text--shake'
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shakes when an invalid character is typed, and passes the text through unchanged', () => {
    const onNameChange = vi.fn();
    render(
      <SpaceDetails
        draft={draft}
        onNameChange={onNameChange}
        onParentChange={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Space Name');

    fireEvent.change(input, { target: { value: 'a/b' } });

    expect(input.closest('.space-details__card')).toHaveClass(
      'editable-text--shake'
    );
    expect(onNameChange).toHaveBeenCalledWith('a/b');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shakes when Create is clicked with an empty name', () => {
    render(
      <SpaceDetails
        draft={{ ...draft, name: '' }}
        onNameChange={vi.fn()}
        onParentChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      screen.getByLabelText('Space Name').closest('.space-details__card')
    ).toHaveClass('editable-text--shake');
  });

  it('does not act on Enter — only the Create button does', () => {
    render(
      <SpaceDetails
        draft={{ ...draft, name: '' }}
        onNameChange={vi.fn()}
        onParentChange={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Space Name');

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyPress(input, { key: 'Enter', charCode: 13 });
    fireEvent.keyUp(input, { key: 'Enter' });

    expect(input.closest('.space-details__card')).not.toHaveClass(
      'editable-text--shake'
    );
    expect(input.closest('form')).toBeNull();
  });

  it('does not shake when Create is clicked with a valid name', () => {
    render(
      <SpaceDetails
        draft={draft}
        onNameChange={vi.fn()}
        onParentChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      screen.getByLabelText('Space Name').closest('.space-details__card')
    ).not.toHaveClass('editable-text--shake');
  });

  it('does not shake for a valid name', () => {
    render(
      <SpaceDetails
        draft={draft}
        onNameChange={vi.fn()}
        onParentChange={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Space Name');

    fireEvent.change(input, { target: { value: 'Personal' } });

    expect(input.closest('.space-details__card')).not.toHaveClass(
      'editable-text--shake'
    );
  });
});

describe('SpaceDetails Change location', () => {
  const change = () => screen.getByRole('button', { name: 'Change' });

  it('picks a folder, validates it and updates the parent', async () => {
    openMock.mockResolvedValue('/Users/me/Work');
    invokeMock.mockResolvedValue({ path: '/Users/me/Work', name: 'Work' });
    const onParentChange = vi.fn();
    render(
      <SpaceDetails
        draft={draft}
        onNameChange={vi.fn()}
        onParentChange={onParentChange}
      />
    );

    await act(async () => fireEvent.click(change()));

    expect(openMock).toHaveBeenCalledWith({ directory: true, multiple: false });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('validate_space_folder', {
      path: '/Users/me/Work',
    });
    expect(onParentChange).toHaveBeenCalledWith({
      parentPath: '/Users/me/Work',
      parentName: 'Work',
    });
  });

  it('does nothing when the picker is cancelled', async () => {
    openMock.mockResolvedValue(null);
    const onParentChange = vi.fn();
    render(
      <SpaceDetails
        draft={draft}
        onNameChange={vi.fn()}
        onParentChange={onParentChange}
      />
    );

    await act(async () => fireEvent.click(change()));

    expect(invokeMock).not.toHaveBeenCalled();
    expect(onParentChange).not.toHaveBeenCalled();
    expect(change()).toBeEnabled();
  });

  it('shakes the Location card and keeps the parent when the folder is unusable', async () => {
    openMock.mockResolvedValue('/Users/me/Locked');
    invokeMock.mockRejectedValue('read-only');
    const onParentChange = vi.fn();
    render(
      <SpaceDetails
        draft={draft}
        onNameChange={vi.fn()}
        onParentChange={onParentChange}
      />
    );

    await act(async () => fireEvent.click(change()));

    expect(onParentChange).not.toHaveBeenCalled();
    expect(change().closest('.space-details__card')).toHaveClass(
      'editable-text--shake'
    );
    expect(change()).toBeEnabled();
  });
});

describe('SpaceDetails location', () => {
  it('shows the parent plus the trimmed name, following the draft', () => {
    const { rerender } = render(
      <SpaceDetails
        draft={{ ...draft, name: '  Personal  ' }}
        onNameChange={vi.fn()}
        onParentChange={vi.fn()}
      />
    );
    expect(screen.getByText('Documents/Personal')).toBeInTheDocument();

    rerender(
      <SpaceDetails
        draft={{ ...draft, name: '' }}
        onNameChange={vi.fn()}
        onParentChange={vi.fn()}
      />
    );
    expect(screen.getByText('Documents/')).toBeInTheDocument();
  });
});

describe('isValidSpaceName', () => {
  it.each(['Clutter', 'Personal', '  Work  ', 'My Space 2', 'Café ✨'])(
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
