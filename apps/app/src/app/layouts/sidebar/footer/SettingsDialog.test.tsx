// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Footer } from './Footer';
import { SettingsDialog } from './SettingsDialog';
import { SettingsDialogStateProvider } from '@features/settings/SettingsDialogState';
import type { SpaceAvatarValue } from '@components/space-avatar/SpaceAvatar';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import type { TemplatesSource } from '@features/settings/preferred-templates/PreferredTemplates';

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

interface Props {
  vaultFolderName?: string;
  spaceName?: string;
  avatar?: SpaceAvatarValue;
  spaces?: { path: string; name: string }[];
  activeSpacePath?: string;
  onSwitchSpace?: (path: string) => void;
  onRemoveSpace?: (path: string) => void;
  onRenameActiveSpace?: (newName: string) => Promise<{ error?: string }>;
  onRenameInactiveSpace?: (path: string, newName: string) => Promise<{ error?: string }>;
  onChangeActiveSpaceAvatar?: (avatar: { type: 'emoji'; emoji: string } | { type: 'image'; src: string } | undefined) => Promise<{ error?: string }>;
  templates?: TemplatesSource;
}

/** The footer and the Settings dialog as AppShell mounts them: siblings under one shared dialog state. */
function Harness({ vaultFolderName = 'vault', ...rest }: Props) {
  return (
    <SettingsDialogStateProvider>
      <Footer vaultFolderName={vaultFolderName} onOpenArchive={() => {}} {...rest} />
      <SettingsDialog vaultFolderName={vaultFolderName} {...rest} />
    </SettingsDialogStateProvider>
  );
}
const renderHarness = (props: Props = {}) => render(<Harness {...props} />);

describe('Settings dialog: opening a preferred template', () => {
  it('closes the Settings dialog and opens the template', async () => {
    // The Theme setting on the Preferences page reads the system color scheme.
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const onOpenTemplate = vi.fn();
    const ids: readonly string[] = ['t1'];
    const template = {
      id: 't1',
      type: 'note',
      icon: 'template',
      emoji: null,
      selected: false,
      onClick: () => {},
      values: { name: 'Meeting' },
    } as unknown as CollectionEntryModel;
    const view = renderHarness({
      templates: {
        getTemplates: () => [template],
        onCreateTemplate: () => {},
        onOpenTemplate,
        preferred: { getIds: () => ids, add: () => {}, remove: () => {}, subscribe: () => () => {} },
      },
    });
    fireEvent.click(view.container.querySelector('.space-selector') as HTMLElement);
    fireEvent.click(screen.getByText('Settings'));
    fireEvent.click(screen.getByText('Daily notes'));
    expect(document.querySelector('.settings')).not.toBeNull();

    fireEvent.click(document.querySelector('.preferred-templates__list .entry') as HTMLElement);

    expect(onOpenTemplate).toHaveBeenCalledWith('t1');
    await waitFor(() => expect(document.querySelector('.settings')).toBeNull());
  });
});

describe('Settings dialog: Spaces', () => {
  const SPACES = [
    { path: '/a', name: 'Alpha' },
    { path: '/b', name: 'Beta' },
  ];
  const openSettings = () => {
    fireEvent.click(document.querySelector('.space-selector') as HTMLElement);
    fireEvent.click(screen.getByText('Settings'));
  };

  it('lists every Space in a Spaces section above the pages; clicking one opens its page, and does not switch', () => {
    const onSwitch = vi.fn();
    renderHarness({ vaultFolderName: 'alpha', spaceName: 'Alpha', spaces: SPACES, activeSpacePath: '/a', onSwitchSpace: onSwitch });
    openSettings();

    const sidebar = document.querySelector('.settings-sidebar') as HTMLElement;
    // The first entry is the section's own header.
    const rows = Array.from(sidebar.querySelectorAll('.entry')).slice(1, 3) as HTMLElement[];
    expect(rows.map((row) => row.textContent)).toEqual(['AAlphaCurrent', 'BBeta']);
    expect(within(rows[0]!).getByText('Current')).toBeInTheDocument();
    expect(within(rows[1]!).queryByText('Current')).toBeNull();
    expect(screen.getByText('Spaces').compareDocumentPosition(screen.getByText('General'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    fireEvent.click(rows[1]!);

    expect(document.querySelector('.settings-page__title')).toBeNull();
    expect(document.querySelector('.settings-page__description')).toHaveTextContent('Space setting');
    expect(rows[1]).toHaveClass('entry-selected');
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('a Space switch (which remounts the footer) leaves the dialog the same element, now marking the new Space', () => {
    const tree = (path: string, name: string) => (
      <SettingsDialogStateProvider>
        {/* Keyed like AppLayout: a new Space remounts the footer. The dialog sits outside it. */}
        <Footer key={path} vaultFolderName={name} spaces={SPACES} activeSpacePath={path} onOpenArchive={() => {}} />
        <SettingsDialog vaultFolderName={name} spaces={SPACES} activeSpacePath={path} />
      </SettingsDialogStateProvider>
    );
    const { rerender } = render(tree('/a', 'Alpha'));
    openSettings();
    const dialogContent = document.querySelector('.settings') as HTMLElement;
    rerender(tree('/b', 'Beta'));

    expect(document.querySelector('.settings')).toBe(dialogContent);
    expect(document.querySelector('.settings-sidebar [aria-current]')).toHaveTextContent('Beta');
  });

  it('removing a Space from its page asks first, then forgets that Space and returns to Preferences', async () => {
    const onRemove = vi.fn();
    render(
      <SettingsDialogStateProvider>
        <Footer vaultFolderName="alpha" spaces={SPACES} activeSpacePath="/a" onOpenArchive={() => {}} />
        <SettingsDialog vaultFolderName="alpha" spaces={SPACES} activeSpacePath="/a" onRemoveSpace={onRemove} />
      </SettingsDialogStateProvider>
    );
    openSettings();
    fireEvent.click(screen.getByText('Beta'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove space' }));
    expect(onRemove).not.toHaveBeenCalled();

    const confirmation = screen.getByText('Remove space?').closest('.confirmation') as HTMLElement;
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Remove space' }));

    expect(onRemove).toHaveBeenCalledExactlyOnceWith('/b');
    expect(document.querySelector('.settings-page__title')).toHaveTextContent('Preferences');
  });

  it('keeps the page the user was on', () => {
    const tree = (path: string) => (
      <SettingsDialogStateProvider>
        <Footer key={path} vaultFolderName={path} spaces={SPACES} activeSpacePath={path} onOpenArchive={() => {}} />
        <SettingsDialog vaultFolderName={path} spaces={SPACES} activeSpacePath={path} />
      </SettingsDialogStateProvider>
    );
    const { rerender } = render(tree('/a'));
    openSettings();
    fireEvent.click(screen.getByText('Assets'));

    rerender(tree('/b'));

    expect(document.querySelector('.settings-page__title')).toHaveTextContent('Assets');
  });
});

describe('Settings dialog: renaming from a Space page', () => {
  const SPACES = [
    { path: '/s/Alpha', name: 'Alpha' },
    { path: '/s/Beta', name: 'Beta' },
  ];
  const openSpacePage = (
    name: string,
    onRenameActiveSpace?: (newName: string) => Promise<{ error?: string }>,
    onRenameInactiveSpace?: (path: string, newName: string) => Promise<{ error?: string }>
  ) => {
    renderHarness({ vaultFolderName: 'Alpha', spaces: SPACES, activeSpacePath: '/s/Alpha', onRenameActiveSpace, onRenameInactiveSpace });
    fireEvent.click(document.querySelector('.space-selector') as HTMLElement);
    fireEvent.click(screen.getByText('Settings'));
    fireEvent.click(within(document.querySelector('.settings-sidebar') as HTMLElement).getByText(name));
  };
  const nameField = () => screen.getByLabelText('Space name') as HTMLInputElement;

  it('the open Space’s name can be edited, and renaming asks the shell once, with the new name', async () => {
    const rename = vi.fn(async () => ({}));
    openSpacePage('Alpha', rename);

    expect(nameField()).toHaveAttribute('readonly'); // until the pencil is clicked
    fireEvent.click(screen.getByRole('button', { name: 'Edit space name' }));
    fireEvent.change(nameField(), { target: { value: 'Journal' } });
    fireEvent.keyDown(nameField(), { key: 'Enter' });

    expect(screen.queryByText('Rename space?')).toBeNull(); // no confirmation while the plain flow is tried out
    await waitFor(() => expect(rename).toHaveBeenCalledExactlyOnceWith('Journal'));
  });

  it('another Space’s page stays read-only, even though a rename handler exists', () => {
    openSpacePage('Beta', vi.fn(async () => ({})));

    expect(nameField()).toHaveAttribute('readonly');
    expect(nameField()).toHaveValue('Beta');
    expect(screen.queryByRole('button', { name: 'Edit space name' })).toBeNull();
  });

  it('without a handler (nowhere to rename) the open Space’s name is read-only too', () => {
    openSpacePage('Alpha');

    expect(nameField()).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Edit space name' })).toBeNull();
  });

  it('a refusal comes back to the page, with the Space still open', async () => {
    openSpacePage('Alpha', async () => ({ error: 'A folder with that name already exists. Choose another name' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit space name' }));
    fireEvent.change(nameField(), { target: { value: 'Beta' } });
    fireEvent.keyDown(nameField(), { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(document.querySelector('.settings')).not.toBeNull();
  });

  it('removing a Space from its page still works next to renaming', () => {
    const removed = vi.fn();
    renderHarness({
      vaultFolderName: 'Alpha',
      spaces: SPACES,
      activeSpacePath: '/s/Alpha',
      onRenameActiveSpace: async () => ({}),
      onRemoveSpace: removed,
    });
    fireEvent.click(document.querySelector('.space-selector') as HTMLElement);
    fireEvent.click(screen.getByText('Settings'));
    fireEvent.click(within(document.querySelector('.settings-sidebar') as HTMLElement).getByText('Beta'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove space' }));
    const confirmation = screen.getByText('Remove space?').closest('.confirmation') as HTMLElement;
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Remove space' }));

    expect(removed).toHaveBeenCalledExactlyOnceWith('/s/Beta');
  });

  it('another Space’s page is editable too once there is a way to rename it, and renames THAT Space, not the open one', async () => {
    const renameActive = vi.fn(async () => ({}));
    const renameInactive = vi.fn(async (_path: string, _name: string) => ({}));
    openSpacePage('Beta', renameActive, renameInactive);

    expect(nameField()).toHaveValue('Beta');
    fireEvent.click(screen.getByRole('button', { name: 'Edit space name' }));
    fireEvent.change(nameField(), { target: { value: 'Gamma' } });
    fireEvent.keyDown(nameField(), { key: 'Enter' });

    await waitFor(() => expect(renameInactive).toHaveBeenCalledExactlyOnceWith('/s/Beta', 'Gamma'));
    expect(renameActive).not.toHaveBeenCalled();
  });

  it('the open Space’s page still renames through the active handler, not the inactive one', async () => {
    const renameActive = vi.fn(async () => ({}));
    const renameInactive = vi.fn(async (_path: string, _name: string) => ({}));
    openSpacePage('Alpha', renameActive, renameInactive);

    fireEvent.click(screen.getByRole('button', { name: 'Edit space name' }));
    fireEvent.change(nameField(), { target: { value: 'Journal' } });
    fireEvent.keyDown(nameField(), { key: 'Enter' });

    await waitFor(() => expect(renameActive).toHaveBeenCalledExactlyOnceWith('Journal'));
    expect(renameInactive).not.toHaveBeenCalled();
  });

  it('a refusal for another Space is shown on its page, with that Space still selected', async () => {
    openSpacePage('Beta', undefined, async () => ({ error: 'A folder with that name already exists. Choose another name' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit space name' }));
    fireEvent.change(nameField(), { target: { value: 'Alpha' } });
    fireEvent.keyDown(nameField(), { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(nameField()).toHaveValue('Beta');
  });

  it('a Space’s page shows its avatar, drawn by the shared SpaceAvatar: the initial for one with none, its emoji for one with one', () => {
    renderHarness({
      vaultFolderName: 'Alpha',
      spaces: [
        { path: '/s/Alpha', name: 'Alpha' },
        { path: '/s/Beta', name: 'Beta', avatar: { type: 'emoji', emoji: '🍒' } } as { path: string; name: string },
      ],
      activeSpacePath: '/s/Alpha',
    });
    fireEvent.click(document.querySelector('.space-selector') as HTMLElement);
    fireEvent.click(screen.getByText('Settings'));
    const sidebar = () => document.querySelector('.settings-sidebar') as HTMLElement;

    fireEvent.click(within(sidebar()).getByText('Alpha'));
    expect(document.querySelector('.space-page__avatar .space__initial')).toHaveTextContent('A');

    fireEvent.click(within(sidebar()).getByText('Beta'));
    expect(document.querySelector('.space-page__avatar')).toHaveTextContent('🍒');
  });

  it('only the open Space’s avatar can be changed from its page, and Remove follows whether it has one', async () => {
    const change = vi.fn(async (_avatar: unknown) => ({}));
    renderHarness({
      vaultFolderName: 'Alpha',
      avatar: { type: 'emoji', emoji: '🍒' },
      spaces: [
        { path: '/s/Alpha', name: 'Alpha' },
        { path: '/s/Beta', name: 'Beta' },
      ],
      activeSpacePath: '/s/Alpha',
      onChangeActiveSpaceAvatar: change,
    });
    fireEvent.click(document.querySelector('.space-selector') as HTMLElement);
    fireEvent.click(screen.getByText('Settings'));
    const sidebar = () => document.querySelector('.settings-sidebar') as HTMLElement;

    fireEvent.click(within(sidebar()).getByText('Alpha'));
    fireEvent.click(screen.getByRole('button', { name: 'Change avatar' }));
    expect(screen.getByRole('button', { name: 'Remove avatar' })).toBeEnabled(); // it has an emoji
    fireEvent.click(screen.getByRole('button', { name: 'Remove avatar' }));
    await waitFor(() => expect(change).toHaveBeenCalledExactlyOnceWith(undefined));

    fireEvent.click(within(sidebar()).getByText('Beta'));
    expect(screen.queryByRole('button', { name: 'Change avatar' })).toBeNull();
  });
});
