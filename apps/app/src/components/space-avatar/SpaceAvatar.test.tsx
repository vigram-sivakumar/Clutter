// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpaceAvatar, type SpaceAvatarProps } from './SpaceAvatar';

afterEach(() => {
  cleanup();
});

function renderAvatar(props: Partial<SpaceAvatarProps> & Pick<SpaceAvatarProps, 'avatar'>) {
  return render(<SpaceAvatar folderName="vault" {...props} />);
}

describe('SpaceAvatar: initial', () => {
  it('shows the uppercased first letter of the folder name', () => {
    const { container } = renderAvatar({ avatar: { type: 'initial' }, folderName: 'notes' });
    expect(container.querySelector('.space__initial')).toHaveTextContent('N');
  });

  it('renders an empty initial for an empty or blank folder name', () => {
    for (const folderName of ['', '   ']) {
      const { container, unmount } = renderAvatar({ avatar: { type: 'initial' }, folderName });
      expect(container.querySelector('.space__initial')).toBeEmptyDOMElement();
      expect(container).not.toHaveTextContent('undefined');
      unmount();
    }
  });

  it('keeps a leading surrogate pair whole', () => {
    const { container } = renderAvatar({ avatar: { type: 'initial' }, folderName: '𝒜bc' });
    expect(container.querySelector('.space__initial')?.textContent).toBe('𝒜');
  });
});

describe('SpaceAvatar: emoji', () => {
  it('renders the chosen emoji, not an image or the initial', () => {
    const { container } = renderAvatar({ avatar: { type: 'emoji', emoji: '🚀' } });
    expect(container.querySelector('.emoji-icon')).toHaveTextContent('🚀');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.space__initial')).toBeNull();
  });

  it('falls back to the initial for an empty emoji', () => {
    const { container } = renderAvatar({ avatar: { type: 'emoji', emoji: '' } });
    expect(container.querySelector('.space__initial')).toHaveTextContent('V');
  });
});

describe('SpaceAvatar: image', () => {
  it('loads a local asset path through the injected resolver', () => {
    const resolveImageUrl = vi.fn((src: string) => `asset://localhost/${src}`);
    const { container } = renderAvatar({
      avatar: { type: 'image', src: 'Assets/Avatar.jpg' },
      resolveImageUrl,
    });
    expect(resolveImageUrl).toHaveBeenCalledWith('Assets/Avatar.jpg');
    expect(container.querySelector('img.space__avatar')).toHaveAttribute(
      'src',
      'asset://localhost/Assets/Avatar.jpg'
    );
  });

  it('uses a remote URL as-is when no resolver is given', () => {
    const { container } = renderAvatar({
      avatar: { type: 'image', src: 'https://example.com/a.png' },
    });
    expect(container.querySelector('img.space__avatar')).toHaveAttribute(
      'src',
      'https://example.com/a.png'
    );
  });

  it('shows the initial when the resolver yields nothing to load', () => {
    const { container } = renderAvatar({
      avatar: { type: 'image', src: 'Assets/gone.jpg' },
      resolveImageUrl: () => null,
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.space__initial')).toHaveTextContent('V');
  });

  it('falls back to the initial when the image fails to load', () => {
    const { container } = renderAvatar({
      avatar: { type: 'image', src: 'https://example.com/broken.png' },
    });
    fireEvent.error(container.querySelector('img.space__avatar') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.space__initial')).toHaveTextContent('V');
  });

  it('retries with a new image after an earlier one failed', () => {
    const { container, rerender } = renderAvatar({
      avatar: { type: 'image', src: 'https://example.com/broken.png' },
    });
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    rerender(
      <SpaceAvatar
        folderName="vault"
        avatar={{ type: 'image', src: 'https://example.com/ok.png' }}
      />
    );
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/ok.png');
  });
});

describe('SpaceAvatar: badge', () => {
  it('draws no wrapper and no badge by default', () => {
    const { container } = renderAvatar({ avatar: { type: 'initial' } });
    expect(container.querySelector('.space__badged')).toBeNull();
    expect(container.querySelector('.space__badge')).toBeNull();
  });

  it('puts an error badge with an exclamation mark over any kind of avatar, keeping the avatar itself', () => {
    const avatars = [
      { type: 'initial' },
      { type: 'emoji', emoji: '🌿' },
      { type: 'image', src: 'https://example.com/a.png' },
    ] as const;
    for (const avatar of avatars) {
      const { container, unmount } = renderAvatar({ avatar, badge: 'error', badgeLabel: 'Folder not found' });
      const badge = container.querySelector('.space__badged > .space__badge--error');
      expect(badge).not.toBeNull();
      expect(badge).toHaveClass('space__badge');
      expect(badge).toHaveAttribute('role', 'img');
      expect(badge).toHaveAttribute('aria-label', 'Folder not found');
      expect(badge!.querySelector('svg')).not.toBeNull();
      const kind = avatar.type === 'initial' ? '.space__initial' : avatar.type === 'emoji' ? '.emoji-icon' : 'img';
      expect(container.querySelector(`.space__badged > ${kind}, .space__badged > .app-icon ${kind}`)).not.toBeNull();
      unmount();
    }
  });

  it('keeps the initial fallback of a failed image under the badge', () => {
    const { container } = renderAvatar({
      avatar: { type: 'image', src: 'x.png' },
      folderName: 'coconut',
      badge: 'error',
    });
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('.space__badged .space__initial')).toHaveTextContent('C');
    expect(container.querySelector('.space__badge--error')).not.toBeNull();
  });
});

