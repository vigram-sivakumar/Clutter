// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, redo, undo } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { imageLivePreview } from './imageLivePreview';
import { embedLivePreview } from '../embed/embedLivePreview';
import type { EmbedImageResolution, ResolveEmbedImage } from '../embed/embedImageResolution';

/**
 * Coverage for the custom pointer-driven resize handle
 * (`imageResizeHandle.ts`), which replaces the browser's native CSS
 * `resize: both`/`resize: horizontal` — see that module's own doc comment
 * for why (no reliable native "resize finished" event to persist
 * against). Both bottom corners exist in both Fill and Fit (2026-09 UX
 * correction — same visual affordance regardless of mode); only the drag
 * *behavior* differs by mode, decided live from the container's own
 * current class. These tests drive the real handle DOM with real
 * `PointerEvent`s against a real mounted `EditorView`, the same "test in
 * the real integration, not a simplified stand-in" standard this file
 * family already established (`ImageWidget.presentationUpdate.test.ts`).
 */

let capturedProbes: HTMLImageElement[] = [];
let OriginalImage: typeof Image;

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
const OriginalResizeObserver = window.ResizeObserver;

beforeEach(() => {
  capturedProbes = [];
  OriginalImage = window.Image;
  class CapturingImage extends OriginalImage {
    constructor(width?: number, height?: number) {
      super(width, height);
      capturedProbes.push(this);
    }
  }
  vi.stubGlobal('Image', CapturingImage);
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});

afterEach(() => {
  vi.stubGlobal('Image', OriginalImage);
  vi.stubGlobal('ResizeObserver', OriginalResizeObserver);
});

function settleAllProbes(): void {
  for (const probe of capturedProbes) {
    probe.dispatchEvent(new Event('load'));
  }
}

function mountUrlImage(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [history(), markdownLanguageExtension(), imageLivePreview(() => () => {}, () => () => {})],
  });
  const view = new EditorView({ state, parent });
  settleAllProbes();
  return view;
}

function resolverFor(entries: Record<string, EmbedImageResolution>): ResolveEmbedImage {
  return (path) => entries[path] ?? { status: 'unresolved', alt: path };
}

function mountAssetEmbed(doc: string, resolve: ResolveEmbedImage): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      history(),
      markdownLanguageExtension(),
      embedLivePreview({
        hostPageId: 'test-host-page',
        resolveEmbedImage: () => resolve,
        onImageClick: () => () => {},
        onOpenImageMenu: () => () => {},
        resolveEmbedPdf: () => undefined,
        onPdfEmbedClick: () => undefined,
        onOpenPdfMenu: () => undefined,
      }),
    ],
  });
  const view = new EditorView({ state, parent });
  settleAllProbes();
  return view;
}

function getContainer(view: EditorView): HTMLElement {
  const el = view.dom.querySelector<HTMLElement>('.cm-image-container');
  if (!el) throw new Error('image container not found');
  return el;
}

function getRightHandle(view: EditorView): HTMLElement {
  const el = view.dom.querySelector<HTMLElement>('.cm-media-resize-handle--corner-right');
  if (!el) throw new Error('right resize handle not found');
  return el;
}

function getLeftHandle(view: EditorView): HTMLElement {
  const el = view.dom.querySelector<HTMLElement>('.cm-media-resize-handle--corner-left');
  if (!el) throw new Error('left resize handle not found');
  return el;
}

/**
 * Models the same "inline style wins over the base rect" contract the
 * existing FLIP tests already rely on (`ImageWidget.presentationUpdate.
 * test.ts`'s own `stubRect`) — required here because
 * `imageResizeHandle.ts` mutates `container.style.width`/`height` directly
 * during `pointermove`, and the commit's own `measureBox` call at
 * `pointerup` must read that mutated value back, not a fixed canned rect.
 */
function stubDynamicRect(el: HTMLElement, base: { width: number; height: number }): void {
  el.getBoundingClientRect = () => {
    const width = el.style.width ? parseFloat(el.style.width) : base.width;
    const height = el.style.height ? parseFloat(el.style.height) : base.height;
    return { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) } as DOMRect;
  };
}

let nextPointerId = 1;

function pointerEvent(type: string, clientX: number, clientY: number, pointerId: number): PointerEvent {
  return new PointerEvent(type, { clientX, clientY, button: 0, pointerId, bubbles: true, cancelable: true });
}

/** Drags `handle` from `(fromX, fromY)` to `(toX, toY)` via a real pointerdown → pointermove → pointerup sequence. */
function drag(handle: HTMLElement, fromX: number, fromY: number, toX: number, toY: number): void {
  const pointerId = nextPointerId++;
  handle.dispatchEvent(pointerEvent('pointerdown', fromX, fromY, pointerId));
  handle.dispatchEvent(pointerEvent('pointermove', toX, toY, pointerId));
  handle.dispatchEvent(pointerEvent('pointerup', toX, toY, pointerId));
}

const FIT_URL_MD = '![Photo|fit](https://example.com/a.jpg)';
const FILL_URL_MD = '![Photo](https://example.com/a.jpg)';

describe('Fit — horizontal-only resize persistence, either corner', () => {
  it('dragging the right corner outward widens the container and persists the new width, never a height', () => {
    const view = mountUrlImage(FIT_URL_MD);
    const container = getContainer(view);
    stubDynamicRect(container, { width: 300, height: 200 });

    drag(getRightHandle(view), 0, 0, 80, 0);

    expect(view.state.doc.toString()).toBe('![Photo|380,fit](https://example.com/a.jpg)');
  });

  it('dragging the right corner inward narrows the container', () => {
    const view = mountUrlImage(FIT_URL_MD);
    const container = getContainer(view);
    stubDynamicRect(container, { width: 300, height: 200 });

    drag(getRightHandle(view), 100, 0, 40, 0);

    expect(view.state.doc.toString()).toBe('![Photo|240,fit](https://example.com/a.jpg)');
  });

  it('dragging the left corner outward (further left) also widens the container — mirrored pointer math, same visual affordance', () => {
    const view = mountUrlImage(FIT_URL_MD);
    const container = getContainer(view);
    stubDynamicRect(container, { width: 300, height: 200 });

    drag(getLeftHandle(view), 100, 0, 20, 0); // moved 80px further left

    expect(view.state.doc.toString()).toBe('![Photo|380,fit](https://example.com/a.jpg)');
  });

  it('dragging the left corner inward (toward the right) narrows the container', () => {
    const view = mountUrlImage(FIT_URL_MD);
    const container = getContainer(view);
    stubDynamicRect(container, { width: 300, height: 200 });

    drag(getLeftHandle(view), 0, 0, 60, 0); // moved 60px toward the right

    expect(view.state.doc.toString()).toBe('![Photo|240,fit](https://example.com/a.jpg)');
  });

  it('a Fit resize never writes a height token when none was already persisted', () => {
    const view = mountUrlImage(FIT_URL_MD);
    stubDynamicRect(getContainer(view), { width: 300, height: 200 });

    drag(getRightHandle(view), 0, 0, 50, 0);

    expect(view.state.doc.toString()).not.toContain(',350'); // no stray height token
    expect(view.state.doc.toString()).toBe('![Photo|350,fit](https://example.com/a.jpg)');
  });

  it('preserves an existing dormant height untouched across a width-only Fit resize from either corner', () => {
    const view = mountUrlImage('![Photo|300,500,fit](https://example.com/a.jpg)');
    stubDynamicRect(getContainer(view), { width: 300, height: 200 });

    drag(getRightHandle(view), 0, 0, 100, 0);

    expect(view.state.doc.toString()).toBe('![Photo|400,500,fit](https://example.com/a.jpg)');
  });
});

describe('Fill — width + height resize persistence, either corner', () => {
  it('dragging the right corner persists both the new width and the new height', () => {
    const view = mountUrlImage(FILL_URL_MD);
    stubDynamicRect(getContainer(view), { width: 300, height: 400 });

    drag(getRightHandle(view), 0, 0, 20, 100);

    expect(view.state.doc.toString()).toBe('![Photo|320,500](https://example.com/a.jpg)');
  });

  it('dragging the left corner outward (further left) also grows width, and height responds the same way as the right corner (unmirrored — it is a "bottom" corner either way)', () => {
    const view = mountUrlImage(FILL_URL_MD);
    stubDynamicRect(getContainer(view), { width: 300, height: 400 });

    drag(getLeftHandle(view), 20, 0, -60, 100); // moved 80px further left, 100px down

    expect(view.state.doc.toString()).toBe('![Photo|380,500](https://example.com/a.jpg)');
  });

  it('a Fill resize overwrites a previously persisted height, not just width', () => {
    const view = mountUrlImage('![Photo|300,400](https://example.com/a.jpg)');
    stubDynamicRect(getContainer(view), { width: 300, height: 400 });

    drag(getRightHandle(view), 0, 0, 0, -150);

    expect(view.state.doc.toString()).toBe('![Photo|300,250](https://example.com/a.jpg)');
  });
});

describe('resize lifecycle — no continuous dispatch during drag, exactly one commit on release', () => {
  it('pointermove alone (no pointerup) never mutates the Markdown document', () => {
    const view = mountUrlImage(FIT_URL_MD);
    stubDynamicRect(getContainer(view), { width: 300, height: 200 });
    const before = view.state.doc.toString();

    const handle = getRightHandle(view);
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0, 99));
    handle.dispatchEvent(pointerEvent('pointermove', 40, 0, 99));
    handle.dispatchEvent(pointerEvent('pointermove', 80, 0, 99));
    handle.dispatchEvent(pointerEvent('pointermove', 120, 0, 99));

    expect(view.state.doc.toString()).toBe(before);
  });

  it('pointermove directly mutates the container DOM (live visual feedback) without touching the document', () => {
    const view = mountUrlImage(FIT_URL_MD);
    const container = getContainer(view);
    stubDynamicRect(container, { width: 300, height: 200 });
    const before = view.state.doc.toString();

    const handle = getRightHandle(view);
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0, 5));
    handle.dispatchEvent(pointerEvent('pointermove', 60, 0, 5));

    expect(container.style.width).toBe('360px');
    expect(view.state.doc.toString()).toBe(before);
  });

  it('pointerup persists exactly once, even if the pointer moved several times first', () => {
    const view = mountUrlImage(FIT_URL_MD);
    stubDynamicRect(getContainer(view), { width: 300, height: 200 });
    const dispatchSpy = vi.spyOn(view, 'dispatch');

    const handle = getRightHandle(view);
    const pointerId = 7;
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 20, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 40, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 60, 0, pointerId));
    expect(dispatchSpy).not.toHaveBeenCalled();

    handle.dispatchEvent(pointerEvent('pointerup', 60, 0, pointerId));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe('![Photo|360,fit](https://example.com/a.jpg)');
  });

  it('a second, unrelated pointerup (no matching pointerdown having occurred) does nothing', () => {
    const view = mountUrlImage(FIT_URL_MD);
    stubDynamicRect(getContainer(view), { width: 300, height: 200 });
    const before = view.state.doc.toString();

    getRightHandle(view).dispatchEvent(pointerEvent('pointerup', 500, 500, 123));

    expect(view.state.doc.toString()).toBe(before);
  });
});

describe('local asset embed resizes exactly like a native Image', () => {
  function imageResolution(url: string): EmbedImageResolution {
    return { status: 'image', url, copyUrl: 'hero.png', alt: 'hero.png' };
  }

  it('Fill right-corner drag persists width + height on an image-asset Embed', () => {
    const resolve = resolverFor({ 'hero.png': imageResolution('app://vault/hero.png') });
    const view = mountAssetEmbed('![[hero.png]]', resolve);
    stubDynamicRect(getContainer(view), { width: 300, height: 400 });

    drag(getRightHandle(view), 0, 0, 20, 100);

    expect(view.state.doc.toString()).toBe('![[hero.png|320,500]]');
  });

  it('Fit left-corner drag persists width only, preserving a dormant height, on an image-asset Embed', () => {
    const resolve = resolverFor({ 'hero.png': imageResolution('app://vault/hero.png') });
    const view = mountAssetEmbed('![[hero.png|300,500,fit]]', resolve);
    stubDynamicRect(getContainer(view), { width: 300, height: 200 });

    drag(getLeftHandle(view), 100, 0, 0, 0); // moved 100px further left

    expect(view.state.doc.toString()).toBe('![[hero.png|400,500,fit]]');
  });
});

describe('resize commit integrates with CM6 undo/redo, exactly like a keystroke', () => {
  it('undo reverts a resize commit; redo reapplies it', () => {
    const view = mountUrlImage(FIT_URL_MD);
    stubDynamicRect(getContainer(view), { width: 300, height: 200 });

    drag(getRightHandle(view), 0, 0, 80, 0);
    expect(view.state.doc.toString()).toBe('![Photo|380,fit](https://example.com/a.jpg)');

    undo(view);
    expect(view.state.doc.toString()).toBe(FIT_URL_MD);

    redo(view);
    expect(view.state.doc.toString()).toBe('![Photo|380,fit](https://example.com/a.jpg)');
  });
});

describe('a resize composes end-to-end with the existing Fill/Fit mode-switch path', () => {
  /** Replicates exactly what `MarkdownEditor.tsx`'s `handleSelectImageDisplayMode` dispatches — see `ImageWidget.presentationUpdate.test.ts`'s identical helper for the full rationale (coordinate remapping is load-bearing, not optional). */
  async function selectMode(view: EditorView, pos: number, to: number, mode: 'fill' | 'fit'): Promise<void> {
    const { getImageUiState, setImageUiState, presentationOnlyEdit } = await import('./imageUiState');
    const { getImagePresentation, computeImagePresentationUpdate } = await import(
      '../mediaPresentation/mediaPresentationUpdate'
    );
    const ui = getImageUiState(view.state, pos, to);
    const current = getImagePresentation(view.state, to);
    const changes = computeImagePresentationUpdate(view.state, to, { ...current, mode });
    const mappedChanges = view.state.changes(changes);
    view.dispatch({
      effects: [
        setImageUiState.of({
          pos: mappedChanges.mapPos(pos),
          to: mappedChanges.mapPos(to, 1),
          state: { ...ui, displayMode: mode },
        }),
        presentationOnlyEdit.of(null),
      ],
      changes,
    });
  }

  it('Fill resize → switch to Fit (height goes dormant) → Fit width resize preserves it → switch back to Fill (height reactivates)', async () => {
    const view = mountUrlImage(FILL_URL_MD);
    stubDynamicRect(getContainer(view), { width: 300, height: 400 });

    drag(getRightHandle(view), 0, 0, 20, 100);
    expect(view.state.doc.toString()).toBe('![Photo|320,500](https://example.com/a.jpg)');

    await selectMode(view, 0, view.state.doc.length, 'fit');
    expect(view.state.doc.toString()).toBe('![Photo|320,500,fit](https://example.com/a.jpg)');

    stubDynamicRect(getContainer(view), { width: 320, height: 200 });
    drag(getRightHandle(view), 0, 0, 80, 0);
    expect(view.state.doc.toString()).toBe('![Photo|400,500,fit](https://example.com/a.jpg)');

    await selectMode(view, 0, view.state.doc.length, 'fill');
    expect(view.state.doc.toString()).toBe('![Photo|400,500](https://example.com/a.jpg)');
  });
});
