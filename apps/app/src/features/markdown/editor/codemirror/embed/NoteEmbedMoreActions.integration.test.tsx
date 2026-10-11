// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '../../MarkdownEditor';
import type { ResolveEmbedImage } from './embedImageResolution';
import type { ResolveEmbedPdf } from '../pdf/embedPdfResolution';
import type { PageEmbedResolution, ResolvePageEmbed } from '../../../render/blocks/pageEmbedResolution';

const declineImage: ResolveEmbedImage = () => ({ status: 'unresolved', alt: '' });
const declinePdf: ResolveEmbedPdf = () => ({ status: 'non-pdf' });

function resolverFor(pages: Record<string, PageEmbedResolution>): ResolvePageEmbed {
  return (path) => pages[path] ?? { status: 'unresolved', displayLabel: path };
}

function findMenuItem(label: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (el) => el.textContent === label
    ) ?? null
  );
}

function openMoreActionsMenu() {
  const button = document.querySelector<HTMLButtonElement>('.cm-note-embed [aria-label="More actions"]')!;
  fireEvent.mouseDown(button);
  fireEvent.click(button);
}

// jsdom has no real ResizeObserver — needed by Overlay's own positioning
// hook (`useOverlayPosition.ts`), same stub `MarkdownEditor.test.tsx`'s
// image-overlay tests already establish for exactly this gap.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
});

afterEach(() => {
  cleanup();
});

describe('Note embed "More actions" — Turn into WikiLink / Remove', () => {
  it('lists exactly Turn into WikiLink, then a divider, then Remove', () => {
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown="![[Other Note]]"
        resolveEmbedImage={declineImage}
        resolveEmbedPdf={declinePdf}
        resolvePageEmbed={resolverFor({
          'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
        })}
      />
    );
    openMoreActionsMenu();

    const menu = document.querySelector('[role="menu"]')!;
    const labels = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    expect(labels).toEqual(['Turn into WikiLink', 'Remove']);

    const children = Array.from(menu.children);
    const removeIndex = children.findIndex((el) => el.textContent === 'Remove');
    expect(children[removeIndex - 1]?.getAttribute('role')).toBe('separator');
  });

  it('Turn into WikiLink converts ![[Note]] into [[Note]] in the current note, and never opens/navigates to the source note', () => {
    const onEdit = vi.fn();
    const onOpenPage = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`Before\n\n![[Other Note]]\n\nAfter`}
        resolveEmbedImage={declineImage}
        resolveEmbedPdf={declinePdf}
        resolvePageEmbed={resolverFor({
          'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
        })}
        onEdit={onEdit}
        onOpenPage={onOpenPage}
      />
    );
    openMoreActionsMenu();

    fireEvent.click(findMenuItem('Turn into WikiLink')!);

    expect(onEdit).toHaveBeenCalledWith('Before\n\n[[Other Note]]\n\nAfter');
    expect(onOpenPage).not.toHaveBeenCalled();
  });

  it('Remove strips only the embed reference from the current note, and never opens/navigates to the source note', () => {
    const onEdit = vi.fn();
    const onOpenPage = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`Before\n\n![[Other Note]]\n\nAfter`}
        resolveEmbedImage={declineImage}
        resolveEmbedPdf={declinePdf}
        resolvePageEmbed={resolverFor({
          'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
        })}
        onEdit={onEdit}
        onOpenPage={onOpenPage}
      />
    );
    openMoreActionsMenu();

    fireEvent.click(findMenuItem('Remove')!);

    expect(onEdit).toHaveBeenCalledWith('Before\n\nAfter');
    expect(onOpenPage).not.toHaveBeenCalled();
  });

  it('opening the menu sets [data-menu-open] on the card, keeping .cm-note-embed__controls visible the way Image\'s own size menu keeps .cm-media-controls visible — parity with Image/PDF\'s "controls stay visible while More actions is open" behavior', () => {
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown="![[Other Note]]"
        resolveEmbedImage={declineImage}
        resolveEmbedPdf={declinePdf}
        resolvePageEmbed={resolverFor({
          'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
        })}
      />
    );
    const card = document.querySelector('.cm-note-embed')!;
    expect(card.getAttribute('data-menu-open')).toBe('false');

    const buttonBeforeOpen = document.querySelector<HTMLButtonElement>(
      '.cm-note-embed [aria-label="More actions"]'
    )!;
    openMoreActionsMenu();

    const buttonAfterOpen = document.querySelector<HTMLButtonElement>(
      '.cm-note-embed [aria-label="More actions"]'
    )!;
    // Same identity-preserving-mutation guarantee Image's own regression
    // test asserts — the button/card are mutated in place, never swapped.
    expect(buttonAfterOpen).toBe(buttonBeforeOpen);
    expect(buttonAfterOpen.isConnected).toBe(true);
    expect(buttonAfterOpen.getAttribute('aria-expanded')).toBe('true');
    expect(buttonAfterOpen.classList.contains('cm-media-control--active')).toBe(true);
    expect(buttonAfterOpen.closest('.cm-note-embed')?.getAttribute('data-menu-open')).toBe('true');
  });

  it('closing the menu clears [data-menu-open] without touching the button/card identity', () => {
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown="![[Other Note]]"
        resolveEmbedImage={declineImage}
        resolveEmbedPdf={declinePdf}
        resolvePageEmbed={resolverFor({
          'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
        })}
      />
    );
    openMoreActionsMenu();
    const card = document.querySelector('.cm-note-embed')!;
    const button = document.querySelector<HTMLButtonElement>('.cm-note-embed [aria-label="More actions"]')!;

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.querySelector('.cm-note-embed [aria-label="More actions"]')).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.classList.contains('cm-media-control--active')).toBe(false);
    expect(card.getAttribute('data-menu-open')).toBe('false');
  });

  it('neither Turn into WikiLink nor Remove ever calls onOpenPage — the source note is never opened, navigated to, or otherwise touched', () => {
    const onOpenPage = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown="![[Other Note]]"
        resolveEmbedImage={declineImage}
        resolveEmbedPdf={declinePdf}
        resolvePageEmbed={resolverFor({
          'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
        })}
        onOpenPage={onOpenPage}
      />
    );

    openMoreActionsMenu();
    fireEvent.click(findMenuItem('Remove')!);

    expect(onOpenPage).not.toHaveBeenCalled();
  });
});
