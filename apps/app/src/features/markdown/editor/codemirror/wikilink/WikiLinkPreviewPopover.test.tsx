// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { WikiLinkPreviewPopover } from './WikiLinkPreviewPopover';
import type { WikiLinkHoverTarget } from './wikiLinkHoverPreview';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const anchor = document.createElement('span');
document.body.appendChild(anchor);
const handlers = () => ({ onPointerEnter: vi.fn(), onPointerLeave: vi.fn(), onClose: vi.fn() });

describe('WikiLinkPreviewPopover', () => {
  it('asks the host for nothing (and renders nothing) until a hover has settled into a target', () => {
    const renderPreview = vi.fn(() => <p>content</p>);

    render(<WikiLinkPreviewPopover target={null} render={renderPreview} {...handlers()} />);

    expect(renderPreview).not.toHaveBeenCalled();
    expect(document.querySelector('.wikilink-preview')).toBeNull();
  });

  it('renders the host content for a resolved target, passing only its page id', () => {
    const renderPreview = vi.fn(() => <p>note content</p>);
    const target: WikiLinkHoverTarget = { kind: 'resolved', element: anchor, pageId: 'p1' };

    render(<WikiLinkPreviewPopover target={target} render={renderPreview} {...handlers()} />);

    expect(renderPreview).toHaveBeenCalledWith({ kind: 'resolved', pageId: 'p1' });
    expect(document.querySelector('.wikilink-preview')).toHaveTextContent('note content');
  });

  it('renders the host content for an unresolved target, passing its title', () => {
    const renderPreview = vi.fn(() => <p>empty</p>);
    const target: WikiLinkHoverTarget = { kind: 'unresolved', element: anchor, title: 'My New Idea' };

    render(<WikiLinkPreviewPopover target={target} render={renderPreview} {...handlers()} />);

    expect(renderPreview).toHaveBeenCalledWith({ kind: 'unresolved', title: 'My New Idea' });
  });

  it('shows nothing when the host returns null or no renderer is injected', () => {
    const target: WikiLinkHoverTarget = { kind: 'resolved', element: anchor, pageId: 'p1' };

    render(<WikiLinkPreviewPopover target={target} render={() => null} {...handlers()} />);
    expect(document.querySelector('.wikilink-preview')).toBeNull();

    cleanup();
    render(<WikiLinkPreviewPopover target={target} render={undefined} {...handlers()} />);
    expect(document.querySelector('.wikilink-preview')).toBeNull();
  });

  it('reports the pointer entering and leaving the preview, without a backdrop to block the editor', () => {
    const h = handlers();
    const target: WikiLinkHoverTarget = { kind: 'resolved', element: anchor, pageId: 'p1' };
    render(<WikiLinkPreviewPopover target={target} render={() => <p>x</p>} {...h} />);

    const preview = document.querySelector('.wikilink-preview')!;
    fireEvent.mouseEnter(preview);
    fireEvent.mouseLeave(preview);

    expect(h.onPointerEnter).toHaveBeenCalledTimes(1);
    expect(h.onPointerLeave).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.overlay__backdrop')).toBeNull();
  });
});
