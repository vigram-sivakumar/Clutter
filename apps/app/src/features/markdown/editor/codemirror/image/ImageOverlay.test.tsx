// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

    it('opens the exact same Resource menu the Sidebar shows — Move to…, Reveal in Finder, Copy path, Download, Archive, no Rename', () => {
      render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

      expect(screen.getByText('Move to…')).toBeInTheDocument();
      expect(screen.getByText('Reveal in Finder')).toBeInTheDocument();
      expect(screen.getByText('Copy path')).toBeInTheDocument();
      expect(screen.getByText('Download')).toBeInTheDocument();
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

    it('Download dispatches with the resolved resource id', () => {
      const onDownloadResource = vi.fn();
      render(
        <ImageOverlay
          image={localImage}
          onClose={vi.fn()}
          onDownloadResource={onDownloadResource}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
      fireEvent.click(screen.getByText('Download'));

      expect(onDownloadResource).toHaveBeenCalledWith('resource-1');
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
          'Download',
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

    describe('top-right-of-viewport positioning', () => {
      it('portals the control straight to document.body — a sibling of Overlay\'s own portal, not nested inside .image-overlay__frame', () => {
        render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

        const button = screen.getByRole('button', { name: 'More actions' });
        expect(button.closest('.image-overlay__frame')).toBeNull();
        expect(button.closest('.image-overlay__controls-viewport')).not.toBeNull();
        expect(button.closest('.image-overlay__controls-viewport')?.parentElement).toBe(
          document.body
        );
      });

      it('regression: the controls-viewport\'s own z-index must be strictly higher than --z-overlay, never merely equal to it', () => {
        // Equal was the original (buggy) value — confirmed directly (real
        // browser) that with equal z-index, this portal and Overlay's own
        // `.overlay` (both siblings under document.body, same stacking
        // context) fall back to DOM insertion order to break the tie, and
        // this portal's own createPortal call — evaluated as part of
        // Overlay's children — actually lands *before* `.overlay` in the
        // DOM, not after. That put `.overlay__backdrop` (pointer-events:
        // auto, full-viewport) visually and pointer-events-wise on top of
        // the button: it rendered, looked clickable, but every click was
        // silently swallowed by the backdrop instead. A bare `/z-index\s*:
        // \s*var\(--z-overlay/` regex (no exclusion) would still match the
        // buggy equal-value form too, since it's a substring of the fixed
        // `calc(var(--z-overlay, 1000) + 1)` form — this asserts the `calc(
        // ... + 1)` wrapper specifically, not just the variable's presence.
        const css = readFileSync(join(__dirname, 'ImageOverlay.css'), 'utf8');
        const match = css.match(/\.image-overlay__controls-viewport\s*\{([^}]*)\}/);

        expect(match, '.image-overlay__controls-viewport rule not found').not.toBeNull();
        const body = match![1]!;

        expect(body).toMatch(/z-index\s*:\s*calc\(\s*var\(--z-overlay,\s*1000\)\s*\+\s*1\s*\)\s*;/);
        expect(body).not.toMatch(/z-index\s*:\s*var\(--z-overlay,\s*1000\)\s*;/);
      });
    });

    describe('own semantic class — independent from the inline Markdown-image control', () => {
      it('the trigger is a real Button (design-system chrome), not the inline widget\'s .cm-image-control', () => {
        render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

        const button = screen.getByRole('button', { name: 'More actions' });
        expect(button.classList.contains('button')).toBe(true);
        expect(button.classList.contains('button--ghost')).toBe(true);
        expect(button.classList.contains('button--small')).toBe(true);
        expect(button.classList.contains('cm-image-control')).toBe(false);
      });

      it('the button is active while the menu is open, via Button\'s own isActive class, not .cm-image-control--active', () => {
        render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

        const button = screen.getByRole('button', { name: 'More actions' });
        fireEvent.click(button);

        expect(button.classList.contains('button--active')).toBe(true);
        expect(button.classList.contains('cm-image-control--active')).toBe(false);
      });

      it('wrapped in its own .image-overlay__control positioning class, never .cm-image-controls', () => {
        render(<ImageOverlay image={localImage} onClose={vi.fn()} />);

        const button = screen.getByRole('button', { name: 'More actions' });
        expect(button.closest('.image-overlay__control')).not.toBeNull();
        expect(button.closest('.cm-image-controls')).toBeNull();
      });

      it('regression: ImageOverlay.css no longer styles .cm-image-controls/.cm-image-control at all — that CSS belongs exclusively to the inline widget now (ImageFloatingControls.css)', () => {
        const css = readFileSync(join(__dirname, 'ImageOverlay.css'), 'utf8');
        // Strip comments first — this file's own doc comments legitimately
        // mention `.cm-image-control` in prose (explaining what this
        // control deliberately does NOT reuse); only an actual selector
        // outside a comment would mean the CSS itself still styles it.
        const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

        expect(cssWithoutComments).not.toMatch(/\.cm-image-controls?\b/);
      });
    });
  });
});
