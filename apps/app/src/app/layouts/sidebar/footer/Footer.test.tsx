// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
    fireEvent.click(container.querySelector('.footer__actions button') as HTMLElement);
    expect(onOpenArchive).toHaveBeenCalledTimes(1);
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
