// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ShortcutsProvider } from '@app/shortcuts/ShortcutsProvider';
import { Footer } from './Footer';
import type { SpaceAvatarValue } from '@components/space-avatar/SpaceAvatar';

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

function renderFooter(props: {
  avatar?: SpaceAvatarValue;
  vaultFolderName?: string;
  spaceName?: string;
  resolveImageUrl?: (src: string) => string | null;
}) {
  return render(
    <Footer vaultFolderName="vault" onOpenArchive={() => {}} {...props} />
  );
}

describe('Footer space selector: avatar', () => {
  it('defaults to the initial of the vault folder name, not the Space name', () => {
    const { container } = renderFooter({ vaultFolderName: 'Vault', spaceName: 'Zebra' });
    expect(container.querySelector('.space__initial')).toHaveTextContent('V');
    expect(container.querySelector('.space__title')).toHaveTextContent('Zebra');
  });

  it('passes the resolver through to the avatar', () => {
    const { container } = renderFooter({
      avatar: { type: 'image', src: 'Assets/Avatar.jpg' },
      resolveImageUrl: (src) => `asset://localhost/${src}`,
    });
    expect(container.querySelector('img.space__avatar')).toHaveAttribute(
      'src',
      'asset://localhost/Assets/Avatar.jpg'
    );
  });
});

describe('Footer space selector: title, caret, archive', () => {
  it('uses the folder name as the title when there is no Space name', () => {
    const { container } = renderFooter({ vaultFolderName: 'MyVault' });
    expect(container.querySelector('.space__title')).toHaveTextContent('MyVault');
  });

  it('renders a long title in the ellipsizing element alongside avatar and caret', () => {
    const long = 'A very long vault name that keeps going and going '.repeat(4);
    const { container } = renderFooter({ spaceName: long });
    expect(container.querySelector('.space__title')).toHaveTextContent(long.trim());
    expect(container.querySelector('.entry__leading .space__initial')).not.toBeNull();
    expect(container.querySelector('.entry__trailing .app-icon')).not.toBeNull();
  });

  it('still opens the archive from the footer button', () => {
    const onOpenArchive = vi.fn();
    const { container } = render(<Footer vaultFolderName="v" onOpenArchive={onOpenArchive} />);
    const buttons = container.querySelectorAll('.footer__actions button');
    fireEvent.click(buttons[buttons.length - 1] as HTMLElement);
    expect(onOpenArchive).toHaveBeenCalledTimes(1);
  });

  it('opens the shell’s one Keyboard shortcuts dialog when there is one, instead of a second of its own', async () => {
    render(
      <ShortcutsProvider>
        <Footer vaultFolderName="v" onOpenArchive={vi.fn()} />
      </ShortcutsProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByText('Keyboard shortcuts'));
    expect(await screen.findAllByRole('heading', { name: 'Keyboard shortcuts' })).toHaveLength(1);
  });

  it('Markdown guide opens its own dialog: the shell’s when there is one', async () => {
    render(
      <ShortcutsProvider>
        <Footer vaultFolderName="v" onOpenArchive={vi.fn()} />
      </ShortcutsProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByText('Markdown guide'));
    expect(await screen.findAllByText('Markdown guide', { selector: '.settings-sidebar *' })).toHaveLength(1);
    expect(document.querySelectorAll('.settings-sidebar .sidebar__navigation')).toHaveLength(6);
    expect(screen.queryByRole('heading', { name: 'Keyboard shortcuts' })).toBeNull();
  });

  it('Markdown guide opens a dialog of the footer’s own when there is no shell', async () => {
    render(<Footer vaultFolderName="v" onOpenArchive={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByText('Markdown guide'));
    expect(await screen.findAllByText('Markdown guide', { selector: '.settings-sidebar *' })).toHaveLength(1);
  });

  it('opens the help menu with the shortcut entries', () => {
    render(<Footer vaultFolderName="v" onOpenArchive={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByText('Keyboard shortcuts')).toBeTruthy();
    expect(screen.getByText('Markdown guide')).toBeTruthy();
  });

  it('opens the keyboard shortcuts dialog and closes it with the dismiss button', () => {
    render(<Footer vaultFolderName="v" onOpenArchive={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByText('Keyboard shortcuts'));
    expect(screen.getByText('Keyboard shortcuts')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
  });
});

describe('Footer space selector: menu', () => {
  function openMenu(props: Parameters<typeof renderFooter>[0] = {}) {
    const view = renderFooter(props);
    fireEvent.click(view.container.querySelector('.space-selector') as HTMLElement);
    return view;
  }

  it('is closed until the selector is clicked', () => {
    renderFooter({});
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens with the current Space, New space, a divider, then Settings', () => {
    openMenu({ vaultFolderName: 'Vault', spaceName: 'Work' });
    const menu = screen.getByRole('menu');
    const rows = within(menu).getAllByRole('menuitem');
    expect(rows.map((row) => row.textContent)).toEqual(['VWork', 'New space', 'Settings']);
    expect(rows[0]!).toHaveAttribute('aria-current', 'true');
    expect(rows[0]!.querySelector('.space__initial')).toHaveTextContent('V');
    expect(menu.querySelector('[role="separator"]')).not.toBeNull();
    const order = Array.from(menu.querySelectorAll('[role="menuitem"], [role="separator"]')).map(
      (el) => el.getAttribute('role')
    );
    expect(order).toEqual(['menuitem', 'menuitem', 'separator', 'menuitem']);
  });

  it('shows the same avatar in the selector and the menu, for every variant', () => {
    const variants: SpaceAvatarValue[] = [
      { type: 'initial' },
      { type: 'emoji', emoji: '🚀' },
      { type: 'image', src: 'https://example.com/a.png' },
    ];
    for (const avatar of variants) {
      const { container, unmount } = openMenu({ avatar });
      const selectorAvatar = container.querySelector('.entry__leading')?.innerHTML;
      const current = within(screen.getByRole('menu')).getAllByRole('menuitem')[0];
      expect(selectorAvatar).toBeTruthy();
      expect(current!.querySelector('.entry__leading')?.innerHTML).toBe(selectorAvatar);
      unmount();
    }
  });

  it('keeps a long name in the truncating title in the menu too', () => {
    openMenu({ spaceName: 'Long name '.repeat(20) });
    const title = within(screen.getByRole('menu')).getAllByRole('menuitem')[0]!.querySelector(
      '.space__title'
    );
    expect(title).toHaveTextContent('Long name');
  });

  it('toggles closed on a second click of the selector', () => {
    const { container } = openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(container.querySelector('.space-selector') as HTMLElement);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape', () => {
    openMenu();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Footer space selector: multiple Spaces', () => {
  const spaces = [
    { path: '/a/Notes', name: 'Notes' },
    { path: '/b/Work', name: 'Work' },
  ];

  function openMulti(extra: Partial<Parameters<typeof Footer>[0]> = {}) {
    const onSwitchSpace = vi.fn();
    const onNewSpace = vi.fn();
    const view = render(
      <Footer
        vaultFolderName="Notes"
        spaces={spaces}
        activeSpacePath="/a/Notes"
        onSwitchSpace={onSwitchSpace}
        onNewSpace={onNewSpace}
        onOpenArchive={() => {}}
        {...extra}
      />
    );
    fireEvent.click(view.container.querySelector('.space-selector') as HTMLElement);
    return { ...view, onSwitchSpace, onNewSpace };
  }

  it('lists every Space, marking only the active one', () => {
    openMulti();
    const rows = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(rows.map((row) => row.textContent)).toEqual(['NNotes', 'WWork', 'New space', 'Settings']);
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(rows[1]).not.toHaveAttribute('aria-current');
  });

  it('switches to another Space and closes the menu', () => {
    const { onSwitchSpace } = openMulti();
    fireEvent.click(screen.getByText('Work'));
    expect(onSwitchSpace).toHaveBeenCalledWith('/b/Work');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does nothing when the active Space is clicked', () => {
    const { onSwitchSpace } = openMulti();
    fireEvent.click(within(screen.getByRole('menu')).getAllByRole('menuitem')[0]!);
    expect(onSwitchSpace).not.toHaveBeenCalled();
  });

  it('starts the New space flow and closes the menu', () => {
    const { onNewSpace } = openMulti();
    fireEvent.click(screen.getByText('New space'));
    expect(onNewSpace).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('disables New space where there is no folder picker', () => {
    openMulti({ onNewSpace: undefined });
    expect(screen.getByText('New space').closest('[role="menuitem"]')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('shows the active Space name from its folder, whichever Space it is', () => {
    const { container } = openMulti({ vaultFolderName: 'Work', activeSpacePath: '/b/Work' });
    expect(container.querySelector('.space-selector .space__title')).toHaveTextContent('Work');
    expect(container.querySelector('.space-selector .space__initial')).toHaveTextContent('W');
  });
});

describe('Footer space selector: availability refresh', () => {
  it('asks for a re-check each time the menu is opened, and not when it is closed', () => {
    const onSpacesMenuOpen = vi.fn();
    const { container } = render(
      <Footer vaultFolderName="vault" onOpenArchive={() => {}} onSpacesMenuOpen={onSpacesMenuOpen} />
    );
    const selector = container.querySelector('.space-selector') as HTMLElement;

    fireEvent.click(selector); // open
    expect(onSpacesMenuOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(selector); // close
    expect(onSpacesMenuOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(selector); // open again
    expect(onSpacesMenuOpen).toHaveBeenCalledTimes(2);
  });

  it('works without the callback', () => {
    const { container } = render(<Footer vaultFolderName="vault" onOpenArchive={() => {}} />);
    expect(() => fireEvent.click(container.querySelector('.space-selector') as HTMLElement)).not.toThrow();
  });
});


describe('Footer space selector: each listed Space shows its own avatar', () => {
  const spaces = [
    { path: '/s/Work', name: 'Work', avatar: { type: 'emoji', emoji: '🚀' } },
    { path: '/s/Notes', name: 'Notes', avatar: { type: 'image', src: '/Users/me/notes.png' } },
    { path: '/s/Plain', name: 'Plain' },
  ] as const;

  function openMenu(extra: { activeSpacePath?: string; resolveImageUrl?: (src: string) => string | null } = {}) {
    const view = render(
      <Footer
        vaultFolderName="Work"
        spaces={spaces}
        activeSpacePath={extra.activeSpacePath ?? '/s/Work'}
        onSwitchSpace={() => {}}
        resolveImageUrl={extra.resolveImageUrl ?? ((src) => `asset://localhost${src}`)}
        onOpenArchive={() => {}}
      />
    );
    fireEvent.click(view.container.querySelector('.space-selector') as HTMLElement);
    const rows = within(screen.getByRole('menu')).getAllByRole('menuitem');
    return { ...view, rows };
  }

  it('shows an emoji, an image and an initial, each on its own row', () => {
    const { rows } = openMenu();
    expect(rows[0]!.querySelector('.emoji-icon')).toHaveTextContent('🚀');
    expect(rows[1]!.querySelector('img.space__avatar')).toHaveAttribute('src', 'asset://localhost/Users/me/notes.png');
    expect(rows[2]!.querySelector('.space__initial')).toHaveTextContent('P');
  });

  it('uses the open Space’s own avatar in the selector, whichever Space is open', () => {
    const { container, unmount } = openMenu({ activeSpacePath: '/s/Work' });
    expect(container.querySelector('.space-selector .emoji-icon')).toHaveTextContent('🚀');
    unmount();

    const second = openMenu({ activeSpacePath: '/s/Notes' });
    expect(second.container.querySelector('.space-selector img.space__avatar')).toHaveAttribute(
      'src',
      'asset://localhost/Users/me/notes.png'
    );
    expect(second.container.querySelector('.space-selector .emoji-icon')).toBeNull();
  });

  it('falls back to the initial when an image fails to load', () => {
    const { rows } = openMenu();
    fireEvent.error(rows[1]!.querySelector('img.space__avatar')!);
    expect(rows[1]!.querySelector('img.space__avatar')).toBeNull();
    expect(rows[1]!.querySelector('.space__initial')).toHaveTextContent('N');
  });

  it('falls back to the initial when the image cannot be resolved to a URL', () => {
    const { rows } = openMenu({ resolveImageUrl: () => null });
    expect(rows[1]!.querySelector('img')).toBeNull();
    expect(rows[1]!.querySelector('.space__initial')).toHaveTextContent('N');
  });
});

describe('Footer space selector: a space whose folder is missing', () => {
  function openMenu(onSwitchSpace = vi.fn()) {
    const view = render(
      <Footer
        vaultFolderName="Work"
        spaces={[
          { path: '/s/Work', name: 'Work' },
          { path: '/s/Coconut', name: 'Coconut', missing: true },
          { path: '/s/Fine', name: 'Fine' },
        ]}
        activeSpacePath="/s/Work"
        onSwitchSpace={onSwitchSpace}
        onOpenArchive={() => {}}
      />
    );
    fireEvent.click(view.container.querySelector('.space-selector') as HTMLElement);
    return { rows: within(screen.getByRole('menu')).getAllByRole('menuitem'), onSwitchSpace };
  }

  it('is listed by its folder name with its initial and an error badge on the avatar', () => {
    const { rows } = openMenu();
    expect(rows[1]).toHaveTextContent('Coconut');
    expect(rows[1]!.querySelector('.space__initial')).toHaveTextContent('C');
    const badge = rows[1]!.querySelector('.space__badge--error');
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute('aria-label', 'Folder not found');
    expect(rows[1]!.querySelector('.entry__trailing')).toBeNull();
  });

  it('is enabled, and choosing it still asks to switch (the switch explains the problem)', () => {
    const { rows, onSwitchSpace } = openMenu();
    expect(rows[1]).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(rows[1]!);
    expect(onSwitchSpace).toHaveBeenCalledWith('/s/Coconut');
  });

  it('puts no badge on a space that is fine', () => {
    const { rows } = openMenu();
    expect(rows[2]!.querySelector('.space__badge')).toBeNull();
  });
});
