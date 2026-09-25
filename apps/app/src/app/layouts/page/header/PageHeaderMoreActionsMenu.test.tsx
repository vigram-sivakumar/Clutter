// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PageHeaderMoreActionsMenu } from './PageHeaderMoreActionsMenu';
import type { PageHeaderMoreActionsMenuProps } from './PageHeaderMoreActionsMenu';

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

function renderMenu(overrides: Partial<PageHeaderMoreActionsMenuProps> = {}) {
  const onSelectEmoji = vi.fn();
  const onRemoveEmoji = vi.fn();
  const onSetCoverImage = vi.fn();
  const onSetCoverImageFromUpload = vi.fn();
  const onRemoveCoverImage = vi.fn();
  const onShowCoverImage = vi.fn();
  const utils = render(
    <PageHeaderMoreActionsMenu
      hasCoverImage={false}
      onSelectEmoji={onSelectEmoji}
      onRemoveEmoji={onRemoveEmoji}
      onSetCoverImage={onSetCoverImage}
      onSetCoverImageFromUpload={onSetCoverImageFromUpload}
      onRemoveCoverImage={onRemoveCoverImage}
      onShowCoverImage={onShowCoverImage}
      {...overrides}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  return {
    ...utils,
    onSelectEmoji,
    onRemoveEmoji,
    onSetCoverImage,
    onSetCoverImageFromUpload,
    onRemoveCoverImage,
    onShowCoverImage,
  };
}

describe('PageHeaderMoreActionsMenu — root view', () => {
  it('shows Emoji, Cover image, and Description when no emoji is set', () => {
    renderMenu();

    expect(screen.getByText('Emoji')).toBeInTheDocument();
    expect(screen.getByText('Cover image')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('omits Emoji once an emoji is already set — the visible emoji itself is the entry point instead', () => {
    renderMenu({ emoji: '🍄' });

    expect(screen.queryByText('Emoji')).not.toBeInTheDocument();
    expect(screen.getByText('Cover image')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('omits Emoji entirely when onSelectEmoji is not supplied (e.g. a Daily Note)', () => {
    renderMenu({ onSelectEmoji: undefined });

    expect(screen.queryByText('Emoji')).not.toBeInTheDocument();
  });

  it('omits Cover image when onSetCoverImage is not supplied', () => {
    renderMenu({ onSetCoverImage: undefined });

    expect(screen.queryByText('Cover image')).not.toBeInTheDocument();
  });

  it('omits Cover image once a cover is already set — the visible thumbnail itself is the entry point instead', () => {
    renderMenu({ hasCoverImage: true });

    expect(screen.queryByText('Cover image')).not.toBeInTheDocument();
    expect(screen.queryByText('Show cover image')).not.toBeInTheDocument();
    expect(screen.getByText('Emoji')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('shows Show cover image instead of Cover image when the existing cover is hidden', () => {
    renderMenu({ hasCoverImage: true, coverHidden: true });

    expect(screen.queryByText('Cover image')).not.toBeInTheDocument();
    expect(screen.getByText('Show cover image')).toBeInTheDocument();
  });

  it('clicking Show cover image only reveals the existing cover — closes the menu without opening the picker', () => {
    const { onShowCoverImage, onSetCoverImage } = renderMenu({
      hasCoverImage: true,
      coverHidden: true,
    });

    fireEvent.click(screen.getByText('Show cover image'));

    expect(onShowCoverImage).toHaveBeenCalledTimes(1);
    expect(onSetCoverImage).not.toHaveBeenCalled();
    expect(document.querySelector('.image-picker')).not.toBeInTheDocument();
    expect(document.querySelector('.menu')).not.toBeInTheDocument();
  });

  it('omits Show cover image when onShowCoverImage is not supplied', () => {
    renderMenu({ hasCoverImage: true, coverHidden: true, onShowCoverImage: undefined });

    expect(screen.queryByText('Show cover image')).not.toBeInTheDocument();
  });

  it('clicking Description closes the menu without throwing (no editor exists yet)', () => {
    renderMenu();

    fireEvent.click(screen.getByText('Description'));

    expect(document.querySelector('.menu')).not.toBeInTheDocument();
  });
});

describe('PageHeaderMoreActionsMenu — Emoji view', () => {
  it('clicking Emoji replaces the menu content with the existing emoji picker, unmodified and unwrapped', () => {
    renderMenu();

    fireEvent.click(screen.getByText('Emoji'));

    expect(document.querySelector('.menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Cover image')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search emoji')).toBeInTheDocument();
    // No title/back row of this file's own — EmojiTray is rendered as-is.
    expect(screen.queryByText('Emoji')).not.toBeInTheDocument();
  });

  it('selecting an emoji persists it and closes the whole menu', () => {
    const { onSelectEmoji } = renderMenu();

    fireEvent.click(screen.getByText('Emoji'));
    const firstEmoji = document.querySelector<HTMLButtonElement>('.emoji-tray__item')!;
    fireEvent.click(firstEmoji);

    expect(onSelectEmoji).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText('Search emoji')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })?.getAttribute('aria-expanded')).toBe(
      'false'
    );
  });

  it('reopening after leaving on the emoji view resets to the root view', () => {
    renderMenu();

    fireEvent.click(screen.getByText('Emoji'));
    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger); // closes
    fireEvent.click(trigger); // reopens

    expect(screen.getByText('Cover image')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search emoji')).not.toBeInTheDocument();
  });

  it('renders EmojiTray unwrapped — not nested inside .menu — so its own surface (background/border-radius/box-shadow) is the only visible box, not framed by Menu.css\'s own chrome', () => {
    renderMenu();

    fireEvent.click(screen.getByText('Emoji'));

    expect(document.querySelector('.menu')).not.toBeInTheDocument();
    const tray = document.querySelector('.emoji-tray');
    expect(tray).toBeInTheDocument();
    // The tray is a direct child of the Overlay's own (unstyled) content
    // wrapper, not of a `.menu` box constraining its width/padding.
    expect(tray!.closest('.menu')).toBeNull();
  });
});

describe('PageHeaderMoreActionsMenu — Cover image view', () => {
  it('clicking Cover image replaces the menu content with the existing image picker, in the same Overlay (menu stays open)', () => {
    renderMenu();

    fireEvent.click(screen.getByText('Cover image'));

    expect(document.querySelector('.menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Emoji')).not.toBeInTheDocument();
    // ImagePicker's own upload/link/unsplash tabs — any one confirms it mounted.
    expect(document.querySelector('.image-picker')).toBeInTheDocument();
    // Same trigger, still marked expanded — never closed and reopened.
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it("ImagePicker's own dismiss button returns to the root view rather than closing the whole menu", () => {
    renderMenu();

    fireEvent.click(screen.getByText('Cover image'));
    fireEvent.click(document.querySelector('.image-picker__header button')!);

    expect(screen.getByText('Cover image')).toBeInTheDocument();
    expect(document.querySelector('.image-picker')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('reopening after leaving on the cover view resets to the root view', () => {
    renderMenu();

    fireEvent.click(screen.getByText('Cover image'));
    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger); // closes
    fireEvent.click(trigger); // reopens

    expect(screen.getByText('Cover image')).toBeInTheDocument();
    expect(document.querySelector('.image-picker')).not.toBeInTheDocument();
  });

  it('renders ImagePicker unwrapped — not nested inside .menu — so it keeps its own natural width/surface instead of Menu.css\'s fixed 220px box', () => {
    renderMenu();

    fireEvent.click(screen.getByText('Cover image'));

    expect(document.querySelector('.menu')).not.toBeInTheDocument();
    const picker = document.querySelector('.image-picker');
    expect(picker).toBeInTheDocument();
    expect(picker!.closest('.menu')).toBeNull();
  });
});

describe('PageHeaderMoreActionsMenu — never nests a second Overlay', () => {
  it('exactly one .overlay is ever in the document, across every view', () => {
    renderMenu();
    expect(document.querySelectorAll('.overlay')).toHaveLength(1);

    fireEvent.click(screen.getByText('Cover image'));
    expect(document.querySelectorAll('.overlay')).toHaveLength(1);

    fireEvent.click(document.querySelector('.image-picker__header button')!);
    fireEvent.click(screen.getByText('Emoji'));
    expect(document.querySelectorAll('.overlay')).toHaveLength(1);
  });
});
