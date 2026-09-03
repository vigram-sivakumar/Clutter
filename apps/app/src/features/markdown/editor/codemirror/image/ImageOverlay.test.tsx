// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ImageOverlay } from './ImageOverlay';
import type { ImageOverlayImage } from './ImageOverlay';

// Overlay's positioning logic observes anchor/surface size via
// ResizeObserver, which jsdom doesn't implement — stubbed the same way
// OverflowMenu.test.tsx/Overlay.test.tsx already do.
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

const localImage: ImageOverlayImage = {
  url: 'file:///vault/Assets/hero.png',
  alt: 'Hero image',
  resourceId: 'resource-1',
};

const externalImage: ImageOverlayImage = {
  url: 'https://example.com/image.png',
  alt: 'External image',
  // No resourceId — nothing in the vault backs this URL.
};

describe('ImageOverlay', () => {
  it('renders the image', () => {
    render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

    expect(screen.getByAltText('Hero image')).toBeInTheDocument();
  });

  it('closing still works exactly as before — Escape closes the overlay', async () => {
    const onClose = vi.fn();
    render(<ImageOverlay image={localImage} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('closing still works exactly as before — an outside (backdrop) click closes the overlay', () => {
    const onClose = vi.fn();
    render(<ImageOverlay image={localImage} onClose={onClose} />);

    const backdrop = document.querySelector('.overlay__backdrop');
    if (!backdrop) {
      throw new Error('expected a backdrop element');
    }
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalled();
  });

  describe('More Actions control', () => {
    it('is present for an image that resolves to a local VaultResource', () => {
      render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

      expect(
        screen.getByRole('button', { name: 'More actions' })
      ).toBeInTheDocument();
    });

    it('is absent for an external URL with no matching VaultResource — never an empty/disabled menu instead', () => {
      render(<ImageOverlay image={externalImage} onClose={vi.fn()} />);

      expect(
        screen.queryByRole('button', { name: 'More actions' })
      ).not.toBeInTheDocument();
    });

    it('is visible immediately, with no hover needed', () => {
      render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

      const button = screen.getByRole('button', { name: 'More actions' });
      // No opacity/visibility gating class the way the inline widget's own
      // hover-reveal control has (`.cm-image-container:hover .cm-image-controls`)
      // — this control's container never needs that rule at all.
      expect(button).toBeVisible();
    });

    it('has no Edit Source button — only More Actions', () => {
      render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

      expect(
        screen.queryByRole('button', { name: /edit source/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /hide source/i })
      ).not.toBeInTheDocument();
    });

    it('opens the exact same Resource menu the Sidebar shows — Move to…, Reveal in Finder, Copy path, Archive, no Rename', () => {
      render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

      expect(screen.getByText('Move to…')).toBeInTheDocument();
      expect(screen.getByText('Reveal in Finder')).toBeInTheDocument();
      expect(screen.getByText('Copy path')).toBeInTheDocument();
      expect(screen.getByText('Archive')).toBeInTheDocument();
      expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    });

    it('the control remains visible once the menu is open', () => {
      render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

      const button = screen.getByRole('button', { name: 'More actions' });
      fireEvent.click(button);

      expect(button).toBeVisible();
    });

    it('Reveal in Finder dispatches with the resolved resource id', () => {
      const onRevealResourceInFinder = vi.fn();
      render(
        <ImageOverlay
          image={localImage}
          onClose={vi.fn()}
          onRevealResourceInFinder={onRevealResourceInFinder}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
      fireEvent.click(screen.getByText('Reveal in Finder'));

      expect(onRevealResourceInFinder).toHaveBeenCalledWith('resource-1');
    });

    it('Archive dispatches with the resolved resource id', () => {
      const onArchiveResource = vi.fn();
      render(
        <ImageOverlay
          image={localImage}
          onClose={vi.fn()}
          onArchiveResource={onArchiveResource}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
      fireEvent.click(screen.getByText('Archive'));

      expect(onArchiveResource).toHaveBeenCalledWith('resource-1');
    });

    it('Copy path opens a working submenu (hover) with the correct resource id + format on selection', () => {
      const onCopyResourcePath = vi.fn();
      render(
        <ImageOverlay
          image={localImage}
          onClose={vi.fn()}
          onCopyResourcePath={onCopyResourcePath}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
      fireEvent.mouseEnter(screen.getByText('Copy path'));

      expect(screen.getByText('From vault')).toBeInTheDocument();
      expect(screen.getByText('Full path')).toBeInTheDocument();
      expect(screen.getByText('As Markdown')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Full path'));

      expect(onCopyResourcePath).toHaveBeenCalledWith('resource-1', 'full-path');
    });

    it('Copy path submenu keyboard navigation works — ArrowRight opens it, ArrowDown/Enter selects, focus never leaks to the parent', () => {
      const onCopyResourcePath = vi.fn();
      render(
        <ImageOverlay
          image={localImage}
          onClose={vi.fn()}
          onCopyResourcePath={onCopyResourcePath}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
      const parentMenu = screen.getByRole('menu');

      fireEvent.keyDown(parentMenu, { key: 'ArrowDown' }); // Move to…
      fireEvent.keyDown(parentMenu, { key: 'ArrowDown' }); // Reveal in Finder
      fireEvent.keyDown(parentMenu, { key: 'ArrowDown' }); // Copy path
      fireEvent.keyDown(parentMenu, { key: 'ArrowRight' });

      const submenu = screen
        .getAllByRole('menu')
        .find((menu) => menu !== parentMenu)!;
      expect(document.activeElement).toBe(submenu);

      fireEvent.keyDown(submenu, { key: 'ArrowDown' });
      fireEvent.keyDown(submenu, { key: 'Enter' });

      expect(onCopyResourcePath).toHaveBeenCalledWith('resource-1', 'at-vault');
    });

    it('selecting Move to… opens the destination picker, and choosing a destination dispatches with the resource id', async () => {
      const onMoveResource = vi.fn();
      render(
        <ImageOverlay
          image={localImage}
          onClose={vi.fn()}
          resourceMoveDestinations={[
            { id: 'folder-1', title: 'Projects', level: 0, parentId: null },
          ]}
          onMoveResource={onMoveResource}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
      fireEvent.click(screen.getByText('Move to…'));

      await waitFor(() => {
        expect(screen.getByText('Projects')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Projects'));

      expect(onMoveResource).toHaveBeenCalledWith('resource-1', 'folder-1');
    });

    describe('Set as cover image', () => {
      it('is omitted from the menu when onSetCoverImage is not supplied — capability-gated, same as the inline ImageOptionsMenu', () => {
        render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

        expect(screen.queryByText('Set as cover image')).not.toBeInTheDocument();
      });

      it('appears right before Archive when onSetCoverImage is supplied', () => {
        render(
          <ImageOverlay
            image={localImage}
            onClose={vi.fn()}
            onSetCoverImage={vi.fn()}
          />
        );

        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

        const menu = screen.getByRole('menu');
        const labels = Array.from(
          menu.querySelectorAll('[role="menuitem"]')
        ).map((el) => el.textContent);

        expect(labels).toEqual([
          'Move to…',
          'Reveal in Finder',
          'Copy path',
          'Set as cover image',
          'Archive',
        ]);
      });

      it('selecting it invokes onSetCoverImage and closes the menu', () => {
        const onSetCoverImage = vi.fn();
        render(
          <ImageOverlay
            image={localImage}
            onClose={vi.fn()}
            onSetCoverImage={onSetCoverImage}
          />
        );

        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        fireEvent.click(screen.getByText('Set as cover image'));

        expect(onSetCoverImage).toHaveBeenCalledTimes(1);
        expect(onSetCoverImage).toHaveBeenCalledWith();
        expect(screen.queryByText('Set as cover image')).not.toBeInTheDocument();
      });
    });
  });
});
