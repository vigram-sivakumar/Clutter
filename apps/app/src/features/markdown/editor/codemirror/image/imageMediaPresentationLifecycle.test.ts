// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { imageLivePreview } from './imageLivePreview';

/**
 * Regression coverage for the Obsidian-style in-bracket presentation
 * syntax's editing lifecycle. Unlike the earlier, abandoned appended-
 * `{...}`-suffix design (which needed a bespoke "construct span" extension
 * to keep an adjacent suffix raw while being typed — see git history for
 * that design and its own bugs), presentation metadata now lives *inside*
 * the same Image node's own `[from, to)` range
 * (`![alt|6,center,fit](url)`), so the existing `pendingFirstLeave`/
 * `revealed` lifecycle already covers it with zero new mechanism: typing
 * `|` mid-alt is just more characters of the one node that's already
 * engaged, and an incomplete `![alt|6` isn't even a syntactically complete
 * `Image` node yet (no closing `)`), so `imageLivePreview.ts`'s own
 * `scanImage`-based guard already keeps it raw the same way an incomplete
 * `![alt](` already does today. These tests exist to confirm that's
 * actually true, not to add new lifecycle logic.
 */
let capturedProbes: HTMLImageElement[] = [];
let OriginalImage: typeof Image;

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
});

afterEach(() => {
  vi.stubGlobal('Image', OriginalImage);
});

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

function settleAllProbes(): void {
  for (const probe of capturedProbes) {
    probe.dispatchEvent(new Event('load'));
  }
}

function mountView(doc: string, anchor = 0): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [history(), markdownLanguageExtension(), imageLivePreview(() => () => {}, () => () => {})],
  });
  const view = new EditorView({ state, parent });
  settleAllProbes();
  return view;
}

function isConcealed(view: EditorView): boolean {
  return view.dom.querySelector('.cm-image-container') !== null;
}

function rawText(view: EditorView): string {
  return view.dom.textContent ?? '';
}

function typeAt(view: EditorView, pos: number, text: string): void {
  view.dispatch({ changes: { from: pos, to: pos, insert: text }, selection: { anchor: pos + text.length } });
  settleAllProbes();
}

function moveCaret(view: EditorView, pos: number): void {
  view.dispatch({ selection: { anchor: pos } });
}

describe('media-presentation lifecycle — Image (Obsidian-style pipe syntax)', () => {
  it('an existing image with no metadata is unaffected (renders concealed as before)', () => {
    const view = mountView('See: ![Alt](https://example.com/a.jpg)', 0);
    expect(isConcealed(view)).toBe(true);
  });

  it('a complete |695,fit segment renders concealed once the construct is left', () => {
    const view = mountView('![Alt|695,fit](https://example.com/a.jpg)\n\nOther text.', 0);
    expect(isConcealed(view)).toBe(true);
    expect(rawText(view)).not.toContain('695,fit');
    expect(rawText(view)).not.toContain('![Alt');
  });

  it('typing "|" immediately after the alt text does not conceal the image — it is not yet a complete node', () => {
    const doc = '![Alt](https://example.com/a.jpg)';
    // Insert "|" right after "Alt", before "]" — position 6 (![Alt = 6 chars).
    const view = mountView(doc, 0);
    typeAt(view, 5, '|');
    expect(isConcealed(view)).toBe(false);
    expect(rawText(view)).toBe('![Alt|](https://example.com/a.jpg)');
  });

  it('typing "|6" does not conceal the image', () => {
    const view = mountView('![Alt](https://example.com/a.jpg)', 0);
    typeAt(view, 5, '|6');
    expect(isConcealed(view)).toBe(false);
    expect(rawText(view)).toBe('![Alt|6](https://example.com/a.jpg)');
  });

  it('typing "|6," does not conceal the image', () => {
    const view = mountView('![Alt](https://example.com/a.jpg)', 0);
    typeAt(view, 5, '|6,');
    expect(isConcealed(view)).toBe(false);
    expect(rawText(view)).toBe('![Alt|6,](https://example.com/a.jpg)');
  });

  it('typing "|6,center" does not conceal the image', () => {
    const view = mountView('![Alt](https://example.com/a.jpg)', 0);
    typeAt(view, 5, '|6,center');
    expect(isConcealed(view)).toBe(false);
    expect(rawText(view)).toBe('![Alt|6,center](https://example.com/a.jpg)');
  });

  it('the caret being anywhere inside the metadata (mid-typing) keeps the whole construct raw', () => {
    const doc = '![Alt](https://example.com/a.jpg)';
    const view = mountView(doc, 0);
    typeAt(view, 5, '|695,center,fit');
    // Move caret back into the middle of the just-typed metadata.
    moveCaret(view, 8);
    expect(isConcealed(view)).toBe(false);
    expect(rawText(view)).toContain('|695,center,fit');
  });

  it('moving the cursor outside the entire construct causes rendering/concealment', () => {
    const prefix = 'Before.\n\n';
    const doc = '![Alt](https://example.com/a.jpg)';
    const view = mountView(prefix + doc, 0);
    typeAt(view, prefix.length + 5, '|6,center');
    expect(isConcealed(view)).toBe(false);

    moveCaret(view, 0);
    expect(isConcealed(view)).toBe(true);
    expect(rawText(view)).not.toContain('6,center');
  });

  it('clicking back into an already-concealed image with metadata does not, by itself, reveal it (matches the existing "navigation never auto-reveals" rule) — only the Edit-source control does', () => {
    const view = mountView('![Alt|6,center](https://example.com/a.jpg)\n\nOther.', 0);
    expect(isConcealed(view)).toBe(true);
    moveCaret(view, 3);
    expect(isConcealed(view)).toBe(true);
  });
});
