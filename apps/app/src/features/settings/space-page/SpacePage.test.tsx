// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import { CHANGE_LOCATION_LABEL } from '@components/missing-space-dialog/MissingSpaceDialog';
import { CONFIRM_RENAME_BY_DEFAULT, SpacePage } from './SpacePage';

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
afterEach(cleanup);

describe('SpacePage', () => {
  it('shows the Space name and its location, both read-only', () => {
    render(<SpacePage name="Personal mind space" path="/Users/me/Documents/Personal mind space" />);

    const name = screen.getByLabelText('Space name');
    const location = screen.getByLabelText('Location');
    expect(name).toHaveValue('Personal mind space');
    expect(name).toHaveAttribute('readonly');
    expect(location).toHaveValue('Documents/Personal mind space');
    expect(location).toHaveAttribute('title', '/Users/me/Documents/Personal mind space');
    expect(location).toHaveAttribute('readonly');
  });

  const beta = (onRemove = vi.fn()) =>
    render(<SpacePage name="Beta" path="/Users/me/Beta" onRemove={onRemove} />);
  const dialog = () => screen.queryByText('Remove space?');

  it('shows Remove space as a danger button with its description, and asks first instead of removing', () => {
    const onRemove = vi.fn();
    beta(onRemove);

    const button = screen.getByRole('button', { name: 'Remove space' });
    expect(button).toHaveClass('button--danger');
    expect(screen.getByText(/Its files and folders will remain on your device/)).toBeInTheDocument();
    expect(dialog()).toBeNull();

    fireEvent.click(button);

    expect(dialog()).toBeInTheDocument();
    expect(
      screen.getByText(
        'Remove this Space from Clutter? Its files and folders will remain on your device. You can add it again later'
      )
    ).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('Cancel closes the confirmation and removes nothing', async () => {
    const onRemove = vi.fn();
    beta(onRemove);
    fireEvent.click(screen.getByRole('button', { name: 'Remove space' }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(dialog()).toBeNull());
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('confirming removes the Space once and closes the confirmation', async () => {
    const onRemove = vi.fn();
    beta(onRemove);
    fireEvent.click(screen.getByRole('button', { name: 'Remove space' }));

    // The dialog's own destructive button, not the page's.
    const confirm = within(screen.getByText('Remove space?').closest('.confirmation') as HTMLElement).getByRole(
      'button',
      { name: 'Remove space' }
    );
    fireEvent.click(confirm);

    expect(onRemove).toHaveBeenCalledOnce();
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('removes the open Space the same way: confirmation first, then the handler', () => {
    const onRemove = vi.fn();
    render(<SpacePage name="Alpha" path="/Users/me/Alpha" onRemove={onRemove} />);

    const button = screen.getByRole('button', { name: 'Remove space' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('has no Remove space without a handler', () => {
    render(<SpacePage name="Alpha" path="/Users/me/Alpha" />);
    expect(screen.queryByRole('button', { name: 'Remove space' })).toBeNull();
  });
});

describe('SpacePage: renaming the open Space', () => {
  const nameField = () => screen.getByLabelText('Space name') as HTMLInputElement;
  const pencil = () => screen.getByRole('button', { name: 'Edit space name' });
  const edit = (value?: string) => {
    fireEvent.click(pencil());
    if (value !== undefined) fireEvent.change(nameField(), { target: { value } });
  };
  const confirmRename = () => {
    const confirmation = screen.getByText('Rename space?').closest('.confirmation') as HTMLElement;
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Rename' }));
  };
  // These tests are about the confirmation, so it is switched on; the default (off) is tested separately below.
  const renderOpen = (onRename = vi.fn(async (_name: string): Promise<{ error?: string }> => ({}))) => {
    render(<SpacePage name="Alpha" path="/Users/me/Alpha" onRename={onRename} confirmBeforeRename />);
    return onRename;
  };

  it('has no pencil and a read-only name without a rename handler (a Space that is not open)', () => {
    render(<SpacePage name="Beta" path="/Users/me/Beta" />);

    expect(screen.queryByRole('button', { name: 'Edit space name' })).toBeNull();
    expect(nameField()).toHaveAttribute('readonly');
  });

  it('shows a ghost icon button in the trailing slot, and the name is read-only until it is clicked', () => {
    renderOpen();

    expect(pencil()).toHaveClass('button--ghost');
    expect(nameField()).toHaveAttribute('readonly');
    fireEvent.change(nameField(), { target: { value: 'Typed anyway' } });
    expect(nameField()).toHaveValue('Alpha');
  });

  it('clicking the pencil makes the name editable and focuses it, and hides the pencil meanwhile', () => {
    renderOpen();

    edit();

    expect(nameField()).not.toHaveAttribute('readonly');
    expect(nameField()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Edit space name' })).toBeNull();
  });

  it('Enter with a new name asks to confirm, and confirming renames once with the trimmed name', async () => {
    const onRename = renderOpen();
    edit('  Journal  ');

    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(screen.getByText('Rename space?')).toBeInTheDocument();
    expect(onRename).not.toHaveBeenCalled();
    confirmRename();

    await waitFor(() => expect(onRename).toHaveBeenCalledExactlyOnceWith('Journal'));
  });

  it('leaving the field (blur) with a new name asks to confirm in the same way', async () => {
    const onRename = renderOpen();
    edit('Journal');

    fireEvent.blur(nameField());
    expect(screen.getByText('Rename space?')).toBeInTheDocument();
    confirmRename();

    await waitFor(() => expect(onRename).toHaveBeenCalledExactlyOnceWith('Journal'));
  });

  it('the dialog opening after Enter does not count as a second commit when the field loses focus', async () => {
    const onRename = renderOpen();
    edit('Journal');

    fireEvent.keyDown(nameField(), { key: 'Enter' });
    fireEvent.blur(nameField());
    confirmRename();

    await waitFor(() => expect(onRename).toHaveBeenCalledOnce());
  });

  it.each(['enter', 'blur'] as const)('an unchanged name (%s) just closes the editor without asking', (how) => {
    const onRename = renderOpen();
    edit('Alpha ');

    if (how === 'enter') fireEvent.keyDown(nameField(), { key: 'Enter' });
    else fireEvent.blur(nameField());

    expect(screen.queryByText('Rename space?')).toBeNull();
    expect(nameField()).toHaveAttribute('readonly');
    expect(onRename).not.toHaveBeenCalled();
    expect(pencil()).toBeInTheDocument();
  });

  it('Escape drops the edit and restores the saved name', () => {
    const onRename = renderOpen();
    edit('Journal');

    fireEvent.keyDown(nameField(), { key: 'Escape' });

    expect(nameField()).toHaveValue('Alpha');
    expect(nameField()).toHaveAttribute('readonly');
    expect(onRename).not.toHaveBeenCalled();
  });

  it('an invalid name on Enter stays open with the existing message, and nothing is asked', () => {
    const onRename = renderOpen();
    edit('a/b');

    fireEvent.keyDown(nameField(), { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name without slashes or colons');
    expect(nameField()).not.toHaveAttribute('readonly');
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Rename space?')).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('an invalid name on blur is dropped, and the saved name is restored', () => {
    const onRename = renderOpen();
    edit('a/b');

    fireEvent.blur(nameField());

    expect(nameField()).toHaveValue('Alpha');
    expect(nameField()).toHaveAttribute('readonly');
    expect(onRename).not.toHaveBeenCalled();
  });

  it('cancelling the confirmation renames nothing and restores the saved name', async () => {
    const onRename = renderOpen();
    edit('Journal');
    fireEvent.keyDown(nameField(), { key: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByText('Rename space?')).toBeNull());
    expect(onRename).not.toHaveBeenCalled();
    expect(nameField()).toHaveValue('Alpha');
    expect(pencil()).toBeInTheDocument();
  });

  it('cannot start a second rename while one is in progress, and locks the field and hides the pencil meanwhile', async () => {
    let finish!: (result: { error?: string }) => void;
    const onRename = vi.fn(() => new Promise<{ error?: string }>((resolve) => (finish = resolve)));
    renderOpen(onRename);
    edit('Journal');
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    confirmRename();

    await waitFor(() => expect(nameField()).toBeDisabled());
    expect(screen.queryByRole('button', { name: 'Edit space name' })).toBeNull();
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(screen.queryByText('Rename space?')).toBeNull();
    expect(onRename).toHaveBeenCalledOnce();

    finish({});
    await waitFor(() => expect(nameField()).not.toBeDisabled());
  });

  it('shows a refusal under the field, and the pencil lets the user try again', async () => {
    const onRename = vi
      .fn<(name: string) => Promise<{ error?: string }>>()
      .mockResolvedValueOnce({ error: 'A folder with that name already exists. Choose another name' })
      .mockResolvedValueOnce({});
    renderOpen(onRename);
    edit('Taken');
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    confirmRename();

    expect(await screen.findByRole('alert')).toHaveTextContent('A folder with that name already exists. Choose another name');
    expect(nameField()).toHaveValue('Alpha');

    edit('Free');
    expect(screen.queryByRole('alert')).toBeNull(); // starting again clears it
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    confirmRename();
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(2));
  });

  it('shows a plain message when the rename throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderOpen(vi.fn(async () => Promise.reject(new Error('boom'))));
    edit('Journal');
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    confirmRename();

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t rename the space');
  });

  it('never makes the location editable', () => {
    renderOpen();

    expect(screen.getByLabelText('Location')).toHaveAttribute('readonly');
  });

  it('leaves the Remove space entry as it was', () => {
    render(<SpacePage name="Alpha" path="/Users/me/Alpha" onRename={vi.fn(async () => ({}))} onRemove={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Remove space' })).toHaveClass('button--danger');
  });

  describe('without the confirmation (the default)', () => {
    const renderPlain = (onRename = vi.fn(async (_name: string): Promise<{ error?: string }> => ({}))) => {
      render(<SpacePage name="Alpha" path="/Users/me/Alpha" onRename={onRename} />);
      return onRename;
    };

    it('does not ask by default', () => {
      expect(CONFIRM_RENAME_BY_DEFAULT).toBe(false);
    });

    it('Enter renames straight away, once, with the trimmed name, and shows no dialog', async () => {
      const onRename = renderPlain();
      edit('  Journal  ');

      fireEvent.keyDown(nameField(), { key: 'Enter' });

      expect(screen.queryByText('Rename space?')).toBeNull();
      await waitFor(() => expect(onRename).toHaveBeenCalledExactlyOnceWith('Journal'));
    });

    it('leaving the field renames straight away too, and Enter followed by blur still renames only once', async () => {
      const onRename = renderPlain();
      edit('Journal');

      fireEvent.keyDown(nameField(), { key: 'Enter' });
      fireEvent.blur(nameField());

      await waitFor(() => expect(onRename).toHaveBeenCalledOnce());
    });

    it('an unchanged or invalid name still renames nothing', () => {
      const onRename = renderPlain();
      edit('Alpha');
      fireEvent.keyDown(nameField(), { key: 'Enter' });
      edit('a/b');
      fireEvent.blur(nameField());

      expect(onRename).not.toHaveBeenCalled();
    });

    it('locks the field while it runs, shows a refusal, and cannot be started twice', async () => {
      let finish!: (result: { error?: string }) => void;
      const onRename = vi.fn(() => new Promise<{ error?: string }>((resolve) => (finish = resolve)));
      renderPlain(onRename);
      edit('Journal');
      fireEvent.keyDown(nameField(), { key: 'Enter' });

      await waitFor(() => expect(nameField()).toBeDisabled());
      fireEvent.keyDown(nameField(), { key: 'Enter' });
      expect(onRename).toHaveBeenCalledOnce();

      finish({ error: 'A folder with that name already exists. Choose another name' });
      expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
      expect(nameField()).toHaveValue('Alpha');
    });
  });

  it('while the Space is changing under the page (busy) nothing can be started: no pencil, locked name, Remove disabled', () => {
    render(<SpacePage name="Alpha" path="/Users/me/Alpha" onRename={vi.fn(async () => ({}))} onRemove={vi.fn()} busy />);

    expect(screen.queryByRole('button', { name: 'Edit space name' })).toBeNull();
    expect(nameField()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove space' })).toBeDisabled();
  });

  it('shows the avatar it is given in its own wrapper above the first group, and nothing without one', () => {
    const { container, rerender } = render(
      <SpacePage name="Alpha" path="/Users/me/Alpha" avatar={<span data-testid="avatar">A</span>} />
    );

    const wrapper = container.querySelector('.space-page__avatar') as HTMLElement;
    expect(wrapper).toContainElement(screen.getByTestId('avatar'));
    const group = container.querySelector('.settings-group') as HTMLElement;
    expect(wrapper.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(<SpacePage name="Alpha" path="/Users/me/Alpha" />);
    expect(container.querySelector('.space-page__avatar')).toBeNull();
  });

  it('wraps the avatar and the name and location group in one section, with Remove space outside it', () => {
    const { container } = render(
      <SpacePage name="Alpha" path="/Users/me/Alpha" avatar={<span>A</span>} onRemove={vi.fn()} />
    );

    const section = container.querySelector('.settings-section') as HTMLElement;
    expect(section).not.toBeNull();
    expect(section.querySelector('.space-page__avatar')).not.toBeNull();
    expect(within(section).getByLabelText('Space name')).toBeInTheDocument();
    expect(within(section).getByLabelText('Location')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Remove space' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove space' })).toBeInTheDocument();
    // The section carries no title of its own.
    expect(section.querySelector(':scope > .settings-group__title')).toBeNull();
  });

});

describe('SpacePage: changing the avatar', () => {
  const avatar = <span data-testid="avatar">A</span>;
  const change = () => screen.getByRole('button', { name: 'Change avatar' });

  it('is just shown, not clickable, without a handler (a Space that is not open)', () => {
    render(<SpacePage name="Beta" path="/Users/me/Beta" avatar={avatar} />);

    expect(screen.queryByRole('button', { name: 'Change avatar' })).toBeNull();
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('clicking the avatar opens the same picker the Space details dialog uses, and Enter does too', () => {
    render(<SpacePage name="Alpha" path="/Users/me/Alpha" avatar={avatar} onChangeAvatar={vi.fn(async () => ({}))} />);
    expect(screen.queryByPlaceholderText('Search emoji')).toBeNull();

    fireEvent.click(change());
    expect(screen.getByPlaceholderText('Search emoji')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove avatar' })).toBeInTheDocument();
  });

  it('opens from the keyboard', () => {
    render(<SpacePage name="Alpha" path="/Users/me/Alpha" avatar={avatar} onChangeAvatar={vi.fn(async () => ({}))} />);

    fireEvent.keyDown(change(), { key: 'Enter' });

    expect(screen.getByPlaceholderText('Search emoji')).toBeInTheDocument();
  });

  it('picking an emoji saves it once and closes the picker', async () => {
    const onChangeAvatar = vi.fn(async (_avatar: unknown): Promise<{ error?: string }> => ({}));
    render(<SpacePage name="Alpha" path="/Users/me/Alpha" avatar={avatar} onChangeAvatar={onChangeAvatar} />);
    fireEvent.click(change());

    fireEvent.click(screen.getAllByRole('button', { name: /grinning face/i })[0]!);

    await waitFor(() => expect(onChangeAvatar).toHaveBeenCalledOnce());
    expect(onChangeAvatar).toHaveBeenCalledWith({ type: 'emoji', emoji: '😀' });
    expect(screen.queryByPlaceholderText('Search emoji')).toBeNull();
  });

  it('Remove is offered only for a Space that has an avatar, and removes it', async () => {
    const onChangeAvatar = vi.fn(async (_avatar: unknown): Promise<{ error?: string }> => ({}));
    const { rerender } = render(
      <SpacePage name="Alpha" path="/Users/me/Alpha" avatar={avatar} onChangeAvatar={onChangeAvatar} />
    );
    fireEvent.click(change());
    expect(screen.getByRole('button', { name: 'Remove avatar' })).toBeDisabled();

    rerender(<SpacePage name="Alpha" path="/Users/me/Alpha" avatar={avatar} hasAvatar onChangeAvatar={onChangeAvatar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove avatar' }));

    await waitFor(() => expect(onChangeAvatar).toHaveBeenCalledExactlyOnceWith(undefined));
  });

  it('shows what went wrong when the avatar cannot be saved', async () => {
    render(
      <SpacePage
        name="Alpha"
        path="/Users/me/Alpha"
        avatar={avatar}
        onChangeAvatar={vi.fn(async () => ({ error: 'Couldn’t save the space settings' }))}
      />
    );
    fireEvent.click(change());
    fireEvent.click(screen.getAllByRole('button', { name: /grinning face/i })[0]!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save the space settings');
  });

  it('is not changeable while the Space is changing under the page', () => {
    render(<SpacePage name="Alpha" path="/Users/me/Alpha" avatar={avatar} onChangeAvatar={vi.fn(async () => ({}))} busy />);

    expect(screen.queryByRole('button', { name: 'Change avatar' })).toBeNull();
  });

  describe('a missing Space', () => {
    const missing = (onChangeLocation?: () => void) =>
      render(<SpacePage name="Gone" path="/Users/me/Gone" missing onChangeLocation={onChangeLocation} />);

    it('shows a Missing badge, and the Change location button with the Space-not-found dialog\'s own label', () => {
      missing(vi.fn());

      expect(screen.getByText('Missing')).toBeInTheDocument();
      expect(CHANGE_LOCATION_LABEL).toBe('Change location');
      expect(screen.getByRole('button', { name: 'Change location' })).toBeInTheDocument();
    });

    it('puts the Missing badge, with its exclamation-in-circle icon, beside the Location title and not the name', () => {
      missing(vi.fn());

      const location = screen.getByLabelText('Location').closest('.settings-entry')!;
      const badge = within(location as HTMLElement).getByText('Missing');
      expect(badge.closest('.pill')?.querySelector('svg')).not.toBeNull();
      expect(location.querySelector('.settings-entry__description-row')).toContainElement(badge);
      expect(screen.getByLabelText('Space name').closest('.settings-entry')).not.toHaveTextContent('Missing');
    });

    it('cannot be renamed or have its avatar changed: no edit button, no avatar button, no hover styling', () => {
      render(
        <SpacePage
          name="Gone"
          path="/Users/me/Gone"
          missing
          avatar={<div data-testid="avatar" />}
          onRename={vi.fn()}
          onChangeAvatar={vi.fn(async () => ({}))}
        />
      );

      expect(screen.queryByRole('button', { name: 'Edit space name' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Change avatar' })).toBeNull();
      expect(screen.getByTestId('avatar').closest('.space-page__avatar')).toHaveClass('space-page__avatar--static');
      expect(screen.getByLabelText('Space name')).toHaveAttribute('readonly');
    });

    it('keeps the current location visible', () => {
      missing(vi.fn());

      expect(screen.getByLabelText('Location')).toHaveValue('me/Gone');
    });

    it('runs the recovery flow it is given when the button is clicked', () => {
      const onChangeLocation = vi.fn();
      missing(onChangeLocation);

      fireEvent.click(screen.getByRole('button', { name: 'Change location' }));

      expect(onChangeLocation).toHaveBeenCalledOnce();
    });

    it('offers no button when there is no recovery flow to run (still badged)', () => {
      missing(undefined);

      expect(screen.getByText('Missing')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Change location' })).toBeNull();
    });

    it('disables the button while the Space is changing under the page', () => {
      render(<SpacePage name="Gone" path="/Users/me/Gone" missing onChangeLocation={vi.fn()} busy />);

      expect(screen.getByRole('button', { name: 'Change location' })).toBeDisabled();
    });
  });

  describe('a valid Space', () => {
    it('shows neither the Missing badge nor the Change location button, even if a recovery flow is given', () => {
      render(<SpacePage name="Alpha" path="/Users/me/Alpha" onChangeLocation={vi.fn()} onRename={vi.fn()} />);

      expect(screen.queryByText('Missing')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Change location' })).toBeNull();
      // Its name entry still holds only the edit button, and its location entry has no badge row or trailing slot.
      expect(screen.getByLabelText('Location').closest('.settings-entry')?.querySelector('.settings-entry__description-row')).toBeNull();
      expect(screen.getByRole('button', { name: 'Edit space name' })).toBeInTheDocument();
      expect(screen.getByLabelText('Location').closest('.settings-entry')?.querySelector('.settings-entry__trailing')).toBeNull();
    });

    it('renders no trailing slot on the name entry when nothing is editable', () => {
      render(<SpacePage name="Alpha" path="/Users/me/Alpha" />);

      expect(screen.getByLabelText('Space name').closest('.settings-entry')?.querySelector('.settings-entry__trailing')).toBeNull();
    });
  });
});
