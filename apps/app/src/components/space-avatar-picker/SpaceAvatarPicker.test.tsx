// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EmojiTray } from '@components/emoji-tray/EmojiTray';
import { SpaceAvatarPicker } from './SpaceAvatarPicker';

const openDialog = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openDialog }));

const handlers = {
  onClose: vi.fn(),
  onSelectEmoji: vi.fn(),
  onUploadImage: vi.fn(),
  onRemove: vi.fn(),
};

function Harness({ hasAvatar = false }: { hasAvatar?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref}>anchor</button>
      <SpaceAvatarPicker anchorRef={ref} open hasAvatar={hasAvatar} {...handlers} />
    </>
  );
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(cleanup);

describe('SpaceAvatarPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  it('shows the emoji picker on the Emoji tab and the upload step on the Image tab', () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText('Search emoji')).toBeVisible();
    expect(screen.getByText('Upload')).not.toBeVisible();

    fireEvent.click(screen.getByText('Image'));
    expect(screen.getByText('Upload')).toBeVisible();
    expect(screen.getByPlaceholderText('Search emoji')).not.toBeVisible();

    fireEvent.click(screen.getByText('Emoji'));
    expect(screen.getByPlaceholderText('Search emoji')).toBeVisible();
  });

  it('reports a selected emoji', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: /grinning face/i })[0]!);
    expect(handlers.onSelectEmoji).toHaveBeenCalledWith('😀');
  });

  it('reports an uploaded image path, and offers no vault assets', async () => {
    openDialog.mockResolvedValue('/Users/me/Pictures/logo.png');
    render(<Harness />);
    fireEvent.click(screen.getByText('Image'));
    await act(async () => screen.getByText('Upload').click());

    expect(handlers.onUploadImage).toHaveBeenCalledWith('/Users/me/Pictures/logo.png');
    expect(screen.queryByText(/vault|assets/i)).toBeNull();
    expect(screen.queryByText('Link')).toBeNull();
    expect(screen.queryByText('Unsplash')).toBeNull();
  });

  it('removes through the one top-level trash action, enabled only with an avatar', () => {
    const { unmount } = render(<Harness />);
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove avatar' })).toBeDisabled();
    unmount();

    render(<Harness hasAvatar />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove avatar' }));
    expect(handlers.onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Remove icon' })).toBeNull();
  });
});

describe('EmojiTray remove button', () => {
  it('stays by default for every other caller', () => {
    render(<EmojiTray onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Remove icon' })).toBeInTheDocument();
  });
});
