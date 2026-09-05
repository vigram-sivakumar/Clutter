// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, isolateHistory, redo, undo } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { createInlineLivePreviewParticipants, type ParticipantResolvers } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { imageLivePreview } from './imageLivePreview';
import type { OnImageClick, OnOpenImageMenu, OpenImageMenuParams } from './ImageWidget';
import { getImageUiState, setImageUiState } from './imageUiState';
import type { ImageSrcResolution, ResolveImageSrc } from './imageSrcResolution';

/**
 * Captures every `new Image()` created by `ImageWidget.probeForRecovery`'s
 * detached, never-DOM-attached recovery probes — jsdom never fires real
 * `load`/`error` events for an `Image()` on its own (no real network), so
 * this is what lets tests simulate a probe resolving, the same way the
 * *visible* `<img>`'s own error is already simulated elsewhere in this
 * file via `dispatchEvent(new Event('error'))`. A plain subclass of
 * jsdom's real `Image`, not a mock replacing its behavior — every probe
 * this captures is a genuine `HTMLImageElement`, just also pushed onto
 * `capturedProbes` at construction time so a test can reach in and fire
 * its `load`/`error` directly.
 */
let capturedProbes: HTMLImageElement[] = [];
let OriginalImage: typeof Image;

/**
 * jsdom has no real `ResizeObserver` — needed by `applyMediaWidth`
 * (mediaLayoutStyle.ts) for a non-default *pixel* (12+) custom width,
 * which watches `view.contentDOM` to re-clamp against the editor's own
 * column width. A plain no-op stub is enough here: these tests assert
 * the immediately-applied inline width, never the observer's own
 * re-clamp-on-editor-resize behavior (see mediaLayoutStyle.test.ts for
 * that dedicated coverage, with its own more complete fake).
 */
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

function latestProbe(): HTMLImageElement {
  const probe = capturedProbes.at(-1);
  if (!probe) {
    throw new Error('no recovery probe was created');
  }
  return probe;
}

/**
 * Resolves every probe captured so far to 'load', in creation order — for
 * tests that don't care about the pre-load window itself (2026-09
 * native-broken-icon fix — see `ImageWidget.ts`'s own `probeThenMount` doc
 * comment), just want "whatever is currently rendering settle into its
 * final, loaded state" after an action (Edit-source toggle, undo/redo,
 * typing a fresh image) that reconstructs a widget and therefore starts a
 * fresh probe. Safe to call repeatedly: each probe's own listeners are
 * `{once: true}`, so re-dispatching 'load' on an already-resolved probe is
 * a silent no-op, not a double-apply.
 */
function settleAllProbes(): void {
  for (const probe of capturedProbes) {
    probe.dispatchEvent(new Event('load'));
  }
}

/**
 * Same as `settleAllProbes`, but skips any probe attempting `excludedUrl` —
 * for a test that just triggered a genuine failure for that exact URL
 * (via a real `<img>`'s `error` event) and wants to observe the resulting
 * broken state, while still settling an unrelated *sibling* construct's
 * own incidental rebuild (see the "Adjacent images" describe block's own
 * tests for why a sibling can rebuild too). Without the exclusion, a blind
 * `settleAllProbes()` would also resolve the just-broken node's own fresh
 * `probeForRecovery` probe to 'load', silently flipping it back to
 * "working" before the test ever gets to assert the broken state at all.
 */
function settleAllProbesExceptUrl(excludedUrl: string): void {
  for (const probe of capturedProbes) {
    if (probe.src !== excludedUrl) {
      probe.dispatchEvent(new Event('load'));
    }
  }
}

/**
 * Integration coverage for the interaction-behavior correction: Image is
 * no longer a reveal-on-engagement participant (removed from
 * `inlineLivePreviewParticipants.ts` — see that file's own comment) and
 * has its own standalone mechanism instead (`imageLivePreview.ts`). Mounts
 * the same shared-participant stack the real editor uses (minus Image)
 * *alongside* `imageLivePreview()`, so every test here also doubles as
 * confirmation that removing Image from the shared map didn't disturb any
 * other construct (checklist item 12) — not a separate, narrower fixture.
 */
const noResolvers: ParticipantResolvers = {
  resolveWikiLink: () => undefined,
  resolveTag: () => undefined,
  resolveDate: () => undefined,
};

function mountView(
  doc: string,
  anchor = 0,
  onImageClick: OnImageClick = () => {},
  onOpenImageMenu: OnOpenImageMenu = () => {},
  resolveImageSrc?: ResolveImageSrc
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      history(),
      markdownLanguageExtension(),
      inlineLivePreviewRegion(createInlineLivePreviewParticipants(noResolvers)),
      imageLivePreview(
        () => onImageClick,
        () => onOpenImageMenu,
        resolveImageSrc ? () => resolveImageSrc : undefined
      ),
    ],
  });
  const view = new EditorView({ state, parent });
  // ImageWidget.renderWorking() (2026-09 native-broken-icon fix) now
  // probes a URL with a detached, never-inserted `Image()` before ever
  // creating the real, visible `<img>` — see ImageWidget.ts's own
  // `probeThenMount` doc comment. Auto-resolving every probe this mount
  // just created to 'load' mirrors the overwhelmingly common real case (an
  // already-cached image resolves near-instantly) and keeps every test
  // below that just wants "a rendered, working image" working exactly as
  // it did before that fix, with no per-test changes needed. Tests that
  // specifically want to exercise the pre-load or failure window instead
  // call `latestProbe()`/`capturedProbes` themselves before this point, or
  // fire a *later* probe (created by a subsequent edit/recovery attempt)
  // after this initial one has already resolved.
  for (const probe of capturedProbes) {
    probe.dispatchEvent(new Event('load'));
  }
  return view;
}

/** A resolver reporting a fixed outcome for `path`, `'unresolved'` for anything else — mirrors what createImageSrcResolver would produce for a single-resource fixture (embedLivePreview.test.ts's identical resolverFor). */
function resolverFor(entries: Record<string, ImageSrcResolution>): ResolveImageSrc {
  return (path) => entries[path] ?? { status: 'unresolved' };
}

function resolvedSrc(url: string, copyUrl: string): ImageSrcResolution {
  return { status: 'resolved', url, copyUrl };
}

function getImg(view: EditorView): HTMLImageElement | null {
  return view.dom.querySelector('img.tok-image');
}

/** The real `<button>` ImageWidget wraps the `<img>` in — see ImageWidget.ts's own comment for why. */
function getImageButton(view: EditorView): HTMLButtonElement {
  const button = view.dom.querySelector<HTMLButtonElement>('button.cm-image-button');
  if (!button) {
    throw new Error('image button not found');
  }
  return button;
}

/** The size button that opens ImageOptionsMenu — see ImageWidget.ts's own comment for why it no longer toggles width itself. */
function getSizeButton(view: EditorView): HTMLButtonElement {
  const button = view.dom.querySelector<HTMLButtonElement>('.cm-image-control[aria-label="Image size options"]');
  if (!button) {
    throw new Error('size button not found');
  }
  return button;
}

/** `aria-label` distinguishes the edit button ("Edit source"/"Hide source") from the size button ("Image size options"). */
function getEditButton(view: EditorView): HTMLButtonElement {
  const button = view.dom.querySelector<HTMLButtonElement>(
    '.cm-image-control[aria-label="Edit source"], .cm-image-control[aria-label="Hide source"]'
  );
  if (!button) {
    throw new Error('edit/source control not found');
  }
  return button;
}

function clickEdit(view: EditorView): void {
  getEditButton(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

const IMAGE_MD = '![Mountain view](https://example.com/mountain.jpg)';

describe('Image interaction behavior', () => {
  it('1. renders at rest', () => {
    const view = mountView(`See: ${IMAGE_MD}`);
    expect(getImg(view)).not.toBeNull();
  });

  it('2 & 3. clicking/engaging the image does NOT reveal raw Markdown, and the image remains rendered', () => {
    const view = mountView(`See: ${IMAGE_MD}`);
    // Simulate engaging the construct: move the selection to a position
    // strictly inside the Image node's own range, as a click on it would.
    const imageStart = view.state.doc.toString().indexOf('![');
    view.dispatch({ selection: { anchor: imageStart + 3 } });

    const img = getImg(view);
    expect(img).not.toBeNull();
    expect(view.dom.textContent).not.toContain(IMAGE_MD);
  });

  it('4 & 5. clicking edit reveals raw Markdown positioned above the still-rendered image', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    settleAllProbes();

    expect(view.dom.textContent).toContain(IMAGE_MD);
    const img = getImg(view);
    expect(img).not.toBeNull();

    // "Above" == earlier in document order, matching the visual stacking
    // (raw source line, then the block widget rendering the image).
    const rawTextNode = Array.from(view.dom.querySelectorAll('.cm-line')).find((line) =>
      line.textContent?.includes(IMAGE_MD)
    );
    expect(rawTextNode).toBeDefined();
    // eslint-disable-next-line no-bitwise
    const positionBits = rawTextNode!.compareDocumentPosition(img as Node);
    expect(positionBits & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('6. the image remains rendered while the source is visible (both coexist)', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    settleAllProbes();
    expect(getImg(view)).not.toBeNull();
    expect(view.dom.textContent).toContain('![Mountain view](https://example.com/mountain.jpg)');
  });

  it('7. moving the cursor without changing the source does not remove the image', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    settleAllProbes();
    expect(getImg(view)).not.toBeNull();

    view.dispatch({ selection: { anchor: 3 } });
    view.dispatch({ selection: { anchor: 10 } });
    view.dispatch({ selection: { anchor: IMAGE_MD.length } });

    expect(getImg(view)).not.toBeNull();
    expect(view.dom.textContent).toContain(IMAGE_MD);
  });

  it('8. changing the alt text updates the rendered image once the pessimistic re-verification probe confirms the (unchanged) URL', () => {
    // Any edit to the node's own text — including alt-only, the URL never
    // having changed at all — goes through the same pessimistic-until-
    // confirmed path (imageUiState.ts's own doc comment has the full
    // account of why: the mechanism can't distinguish "only alt changed"
    // from "URL changed" without a second, URL-scoped check that isn't
    // worth the complexity — a redundant-but-harmless probe is the
    // accepted cost, not a defect).
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    settleAllProbes();
    expect(getImg(view)?.getAttribute('alt')).toBe('Mountain view');

    const altStart = view.state.doc.toString().indexOf('Mountain view');
    view.dispatch({
      changes: { from: altStart, to: altStart + 'Mountain view'.length, insert: 'Mountain sunset' },
    });

    // Pessimistic immediately — no live <img> yet.
    expect(getImg(view)).toBeNull();
    expect(getImageUiState(view.state, 0).broken).toBe(true);

    // Resolving the recovery probe flips `broken: false`, which rebuilds
    // into `renderWorking()` — which, under the native-broken-icon fix,
    // itself starts a *fresh* probe before mounting a real `<img>` (never
    // trusting the just-recovered URL blindly). A second settle pass
    // resolves that follow-up probe too.
    latestProbe().dispatchEvent(new Event('load'));
    settleAllProbes();

    expect(getImg(view)?.getAttribute('alt')).toBe('Mountain sunset');
    // Still coexisting with the (now-updated) raw source.
    expect(view.dom.textContent).toContain('Mountain sunset');
  });

  it('9. changing the URL updates the rendered image once the probe confirms it', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);

    const urlStart = view.state.doc.toString().indexOf('https://');
    const urlEnd = view.state.doc.toString().indexOf(')');
    view.dispatch({
      changes: { from: urlStart, to: urlEnd, insert: 'https://example.com/other-image.jpg' },
    });

    expect(getImg(view)).toBeNull();
    // Resolving the recovery probe flips `broken: false`, which rebuilds
    // into `renderWorking()` — which, under the native-broken-icon fix,
    // itself starts a *fresh* probe before mounting a real `<img>` (never
    // trusting the just-recovered URL blindly). A second settle pass
    // resolves that follow-up probe too.
    latestProbe().dispatchEvent(new Event('load'));
    settleAllProbes();

    expect(getImg(view)?.getAttribute('src')).toBe('https://example.com/other-image.jpg');
  });

  it('10. undo/redo continues to work', () => {
    const view = mountView(`See: ${IMAGE_MD}`);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    expect(getImg(view)).toBeNull();

    undo(view);
    settleAllProbes();
    expect(view.state.doc.toString()).toBe(`See: ${IMAGE_MD}`);
    expect(getImg(view)).not.toBeNull();

    redo(view);
    expect(view.state.doc.toString()).toBe('');
    expect(getImg(view)).toBeNull();
  });

  it('11. deleting the Markdown removes the image', () => {
    const view = mountView(`See: ${IMAGE_MD}`);
    expect(getImg(view)).not.toBeNull();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    expect(getImg(view)).toBeNull();
  });

  it('12. unrelated Markdown rendering is unaffected (Bold still Live-Previews normally)', () => {
    // `isTokenEngaged` treats either boundary of a construct's own range as
    // engaged (tokenEngagement.ts) — a document that is nothing but
    // `**bold**` has no position that counts as "outside" it, so leading
    // text is needed to get a genuine at-rest position, same reasoning
    // imageScanner's own single-construct fixtures needed.
    const view = mountView('See: **bold**', 0);
    expect(view.dom.querySelector('.tok-strong')).not.toBeNull();
    expect(view.dom.textContent).toBe('See: bold');
  });
});

/**
 * 2026-09-02 UX baseline, items 3–4: revealing places a plain caret at the
 * end of the raw Markdown (never a range selection), and the source
 * auto-hides once the caret leaves the image's own line — but only leaving
 * auto-hides; entering (item 2) still never auto-reveals, unchanged from
 * the existing "Image interaction behavior" coverage above.
 */
describe('Edit source: cursor placement and leaving-source auto-hide', () => {
  it('clicking Edit places a plain caret (not a range) at the end of the raw Markdown', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);

    const sel = view.state.selection.main;
    expect(sel.empty).toBe(true);
    expect(sel.from).toBe(IMAGE_MD.length);
    expect(sel.to).toBe(IMAGE_MD.length);
  });

  it('the source stays revealed while the caret moves within the same line', () => {
    const view = mountView(`Before\n${IMAGE_MD}\nAfter`);
    const imageFrom = view.state.doc.toString().indexOf('![');
    clickEdit(view);
    expect(view.dom.textContent).toContain(IMAGE_MD);

    view.dispatch({ selection: { anchor: imageFrom } });
    view.dispatch({ selection: { anchor: imageFrom + 5 } });
    settleAllProbes();

    expect(view.dom.textContent).toContain(IMAGE_MD);
    expect(getImg(view)).not.toBeNull();
  });

  it('the source auto-hides once the caret moves to a different line', () => {
    const view = mountView(`Before\n${IMAGE_MD}\nAfter`);
    clickEdit(view);
    expect(view.dom.textContent).toContain(IMAGE_MD);

    const afterLineStart = view.state.doc.toString().indexOf('After');
    view.dispatch({ selection: { anchor: afterLineStart } });
    settleAllProbes();

    expect(view.dom.textContent).not.toContain(IMAGE_MD);
    // The image itself is unaffected — still rendered, just back to its
    // normal at-rest (source-hidden) form.
    expect(getImg(view)).not.toBeNull();
  });

  it('moving the caret elsewhere never auto-*reveals* an at-rest image (entering stays a no-op)', () => {
    const view = mountView(`Before\n${IMAGE_MD}\nAfter`);
    const imageFrom = view.state.doc.toString().indexOf('![');

    view.dispatch({ selection: { anchor: imageFrom + 3 } });

    expect(view.dom.textContent).not.toContain(IMAGE_MD);
  });

  /**
   * "Completing source editing and continuing after the image" — pressing
   * Space (or typing) immediately after a just-completed `![alt](url)`
   * must hide the source in that same transaction, even though the caret
   * never changed lines: it moved from the image's own `to` (where
   * revealing placed it) to `to + 1`, strictly outside the Image node's
   * own `[from, to]` range. A plain line-number comparison (this field's
   * own earlier revision) missed this entirely, since the inserted text
   * lands on the *same* line as the image — see imageUiState.ts's own
   * updated doc comment for the full account.
   */
  it('pressing Space immediately after a completed image hides the source in the same transaction, and the space is inserted (not consumed)', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    expect(getImageUiState(view.state, 0).revealed).toBe(true);
    expect(view.state.selection.main.head).toBe(IMAGE_MD.length);

    // Real typing always ends with the caret positioned after the typed
    // character — CM6's own text-input handling constructs an explicit
    // new selection there, it never merely relies on default change-
    // mapping of the old (pre-insert) selection. `changes`-only (no
    // `selection`) would map the old cursor-at-the-insertion-point
    // *backward* by default, which is not what a real keystroke produces
    // — matching that default here would test the wrong thing.
    view.dispatch({
      changes: { from: IMAGE_MD.length, insert: ' ' },
      selection: { anchor: IMAGE_MD.length + 1 },
    });
    settleAllProbes();

    expect(getImageUiState(view.state, 0).revealed).toBe(false);
    // Not the "hidden and revealed coexist" DOM shape any more — a single
    // .cm-line whose own text is just the trailing space, no separate raw-
    // Markdown line above it.
    expect(view.dom.querySelectorAll('.cm-line').length).toBe(1);
    expect(getImg(view)).not.toBeNull();
    expect(view.state.doc.toString()).toBe(`${IMAGE_MD} `);
    expect(view.state.selection.main.head).toBe(IMAGE_MD.length + 1);
  });

  it('typing more text immediately after a completed image hides the source and the text belongs after the image', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);

    const inserted = ' more text';
    view.dispatch({
      changes: { from: IMAGE_MD.length, insert: inserted },
      selection: { anchor: IMAGE_MD.length + inserted.length },
    });

    expect(getImageUiState(view.state, 0).revealed).toBe(false);
    expect(view.state.doc.toString()).toBe(`${IMAGE_MD}${inserted}`);
  });

  it('this also applies to a broken/invalid image, not only a successfully-loaded one', () => {
    const view = mountView(IMAGE_MD);
    getImg(view)!.dispatchEvent(new Event('error'));
    clickEdit(view);
    expect(getImageUiState(view.state, 0).revealed).toBe(true);

    view.dispatch({
      changes: { from: IMAGE_MD.length, insert: ' ' },
      selection: { anchor: IMAGE_MD.length + 1 },
    });

    expect(getImageUiState(view.state, 0).revealed).toBe(false);
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();
  });
});

/**
 * Regression coverage: Edit Source must preserve the presentation mode
 * (Fit/Fill) parsed from the existing Markdown. Entering edit mode must NOT
 * reset the presentation to the default Fill mode merely because the image
 * is temporarily being edited. The mode must be preserved through the entire
 * edit-reveal -> source-visible -> edit-hide cycle.
 */
describe('Edit source: presentation mode (Fit/Fill) must be preserved', () => {
  it('standard Markdown image with fit mode: clicking Edit Source preserves fit mode', () => {
    const fitImageMd = '![Mountain|fit](https://example.com/image.jpg)';
    const view = mountView(fitImageMd);
    settleAllProbes();

    // Get the Image node to find its `to` position
    const imageTo = fitImageMd.length;

    // Before Edit Source: image should be Fit
    let ui = getImageUiState(view.state, 0, imageTo);
    expect(ui.displayMode).toBe('fit');
    expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(true);

    // Click Edit Source
    clickEdit(view);
    settleAllProbes();

    // After Edit Source: source should be visible AND mode should still be Fit
    ui = getImageUiState(view.state, 0, imageTo);
    expect(ui.revealed).toBe(true);
    expect(ui.displayMode).toBe('fit');
    expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(true);
    expect(view.dom.textContent).toContain(fitImageMd);
  });

  it('standard Markdown image with fill mode: clicking Edit Source preserves fill mode', () => {
    const fillImageMd = '![Mountain|fill](https://example.com/image.jpg)';
    const view = mountView(fillImageMd);
    settleAllProbes();

    // Before Edit Source: image should be Fill
    let ui = getImageUiState(view.state, 0);
    expect(ui.displayMode).toBe('fill');
    expect(getImg(view)?.classList.contains('tok-image--fill')).toBe(true);

    // Click Edit Source
    clickEdit(view);
    settleAllProbes();

    // After Edit Source: source should be visible AND mode should still be Fill
    ui = getImageUiState(view.state, 0);
    expect(ui.revealed).toBe(true);
    expect(ui.displayMode).toBe('fill');
    expect(getImg(view)?.classList.contains('tok-image--fill')).toBe(true);
    expect(view.dom.textContent).toContain(fillImageMd);
  });

  it('standard Markdown image with width + fit: clicking Edit Source preserves fit mode with width', () => {
    const fitImageMd = '![Mountain|230,fit](https://example.com/image.jpg)';
    const view = mountView(fitImageMd);
    settleAllProbes();

    const imageTo = fitImageMd.length;
    let ui = getImageUiState(view.state, 0, imageTo);
    expect(ui.displayMode).toBe('fit');

    clickEdit(view);
    settleAllProbes();

    ui = getImageUiState(view.state, 0, imageTo);
    expect(ui.revealed).toBe(true);
    expect(ui.displayMode).toBe('fit');
    expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(true);
  });

  it('hiding the source (clicking Edit again) preserves the presentation mode', () => {
    const fitImageMd = '![Mountain|fit](https://example.com/image.jpg)';
    const view = mountView(fitImageMd);
    settleAllProbes();

    const imageTo = fitImageMd.length;
    clickEdit(view);
    settleAllProbes();
    let ui = getImageUiState(view.state, 0, imageTo);
    expect(ui.displayMode).toBe('fit');

    // Click Edit again to hide source
    clickEdit(view);
    settleAllProbes();

    ui = getImageUiState(view.state, 0, imageTo);
    expect(ui.revealed).toBe(false);
    expect(ui.displayMode).toBe('fit');
    expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(true);
  });

  it('full round trip: Fit -> Edit -> Hide preserves Fit throughout', () => {
    const fitImageMd = '![Mountain|230,fit](https://example.com/image.jpg)';
    const view = mountView(fitImageMd);
    settleAllProbes();

    const imageTo = fitImageMd.length;
    // Initial state: Fit
    expect(getImageUiState(view.state, 0, imageTo).displayMode).toBe('fit');
    expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(true);

    // Reveal
    clickEdit(view);
    settleAllProbes();
    expect(getImageUiState(view.state, 0, imageTo).displayMode).toBe('fit');
    expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(true);
    expect(view.dom.textContent).toContain(fitImageMd);

    // Hide
    clickEdit(view);
    settleAllProbes();
    expect(getImageUiState(view.state, 0, imageTo).displayMode).toBe('fit');
    expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(true);
    expect(view.dom.textContent).not.toContain(fitImageMd);
  });

  it('DIAGNOSTIC: instrument exact rendering path for Fit -> Edit Source -> should remain Fit', () => {
    const fitImageMd = '![Mountain|230,fit](https://example.com/image.jpg)';
    const view = mountView(fitImageMd);
    settleAllProbes();

    const imageTo = fitImageMd.length;

    // Before Edit Source
    console.log('=== BEFORE EDIT SOURCE ===');
    const uiBefore = getImageUiState(view.state, 0, imageTo);
    console.log('getImageUiState(0, imageTo):', uiBefore);
    const imgBefore = getImg(view);
    console.log('img.classList:', imgBefore?.className);
    console.log('tok-image--fit present?', imgBefore?.classList.contains('tok-image--fit'));
    console.log('tok-image--fill present?', imgBefore?.classList.contains('tok-image--fill'));

    // Click Edit Source - capture state right before dispatch
    const editButton = getEditButton(view);
    console.log('\n=== CLICK EDIT SOURCE ===');

    // Dispatch the click
    editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    settleAllProbes();

    // After Edit Source
    console.log('\n=== AFTER EDIT SOURCE ===');
    const uiAfter = getImageUiState(view.state, 0, imageTo);
    console.log('getImageUiState(0, imageTo):', uiAfter);
    const imgAfter = getImg(view);
    console.log('img.classList:', imgAfter?.className);
    console.log('tok-image--fit present?', imgAfter?.classList.contains('tok-image--fit'));
    console.log('tok-image--fill present?', imgAfter?.classList.contains('tok-image--fill'));

    // Also check WITHOUT passing imageTo to see what happens
    console.log('\n=== ALTERNATIVE: getImageUiState WITHOUT to parameter ===');
    const uiNoTo = getImageUiState(view.state, 0);  // NO imageTo
    console.log('getImageUiState(0) [no to]:', uiNoTo);

    // Assertions
    expect(uiBefore.displayMode).toBe('fit');
    expect(imgBefore?.classList.contains('tok-image--fit')).toBe(true);

    expect(uiAfter.displayMode).toBe('fit');
    expect(uiAfter.revealed).toBe(true);
    expect(imgAfter?.classList.contains('tok-image--fit')).toBe(true);
    expect(view.dom.textContent).toContain(fitImageMd);
  });
});

/**
 * Regression coverage for a reported Link/Image inconsistency: Link's own
 * source-editing lifecycle (`inlineLivePreviewRegion.ts`'s shared
 * "engaged region -> fully raw source" contract) stays visible through any
 * edit as long as the caret remains inside, because raw text there is
 * *always* real (only concealment styling toggles). Image's own `revealed`
 * flag used to be re-derived by re-parsing the *current* syntax tree on
 * every transaction (`findEnclosingImageNode`) — a transient parse hiccup
 * (an interior edit that momentarily breaks `](` balance, an empty
 * destination, etc.) made that re-resolution come back `null`, which read
 * as "the caret left" and hid the source mid-edit. The fix
 * (`imageUiState.ts`) makes `revealed` tracking purely positional — a real
 * `RangeSet` span with `endSide = -1` — with no syntax-tree dependency at
 * all, matching Link's own resilience without literally sharing Link's
 * mechanism (Image is a deliberate non-participant in the shared
 * mechanism for unrelated reasons; see `imageUiState.ts`'s own doc
 * comment).
 */
describe('Edit source: Link/Image lifecycle consistency (source stays visible through edits, independent of parse/load validity)', () => {
  it('editing the URL character-by-character keeps the source visible the whole time', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    expect(getImageUiState(view.state, 0).revealed).toBe(true);

    let pos = view.state.doc.toString().indexOf('https://') + 8;
    for (const ch of ['a', 'b', 'c']) {
      view.dispatch({ changes: { from: pos, insert: ch }, selection: { anchor: pos + 1 } });
      pos += 1;
      expect(getImageUiState(view.state, 0).revealed).toBe(true);
    }

    expect(view.state.doc.toString()).toContain('https://abcexample.com');
    expect(view.dom.textContent).toContain(view.state.doc.toString());
  });

  it('a temporarily invalid URL while editing keeps the source visible — load state and source-editing state are independent', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    const raw = view.state.doc.toString();
    const urlFrom = raw.indexOf('https://');
    const urlTo = raw.indexOf(')', urlFrom);
    const replacement = 'not a url';

    view.dispatch({
      changes: { from: urlFrom, to: urlTo, insert: replacement },
      selection: { anchor: urlFrom + replacement.length },
    });

    expect(getImageUiState(view.state, 0).revealed).toBe(true);
    expect(view.dom.textContent).toContain(`![Mountain view](${replacement})`);
  });

  it('temporarily incomplete image syntax (deleting the closing paren mid-edit) keeps the source visible', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    const raw = view.state.doc.toString();
    const closeParen = raw.length - 1;

    view.dispatch({
      changes: { from: closeParen, to: closeParen + 1, insert: '' },
      selection: { anchor: closeParen },
    });

    expect(getImageUiState(view.state, 0).revealed).toBe(true);
    // No longer a complete Image node, so imageLivePreview's own
    // buildDecorations finds nothing to decorate — the raw text simply
    // stays visible as ordinary, still-editable text (the same resilience
    // Link already has), not a widget with something stale inside it.
    expect(view.dom.textContent).toContain(view.state.doc.toString());
    expect(getImg(view)).toBeNull();

    // Restoring the syntax (retyping the paren) resumes rendering a widget
    // for the node again — still without ever having hidden the source in
    // between. The edit that just touched the node's own text also
    // pessimistically flips `broken: true` (imageUiState.ts's own separate,
    // unrelated mechanism for load state — the probe hasn't resolved yet
    // in this test), so the rendered widget is the broken representation,
    // not a working `<img>`; asserting on the container is what actually
    // matters here, not which of the two representations it is.
    view.dispatch({ changes: { from: closeParen, insert: ')' }, selection: { anchor: closeParen + 1 } });
    expect(getImageUiState(view.state, 0).revealed).toBe(true);
    expect(view.dom.querySelector('.cm-image-container')).not.toBeNull();
  });

  it('moving the caret outside the image source mid-edit still hides it, consistent with leaving normally', () => {
    const view = mountView(`Before\n${IMAGE_MD}\nAfter`);
    const imageFrom = view.state.doc.toString().indexOf('![');
    view.dispatch({ selection: { anchor: imageFrom + 5 } });
    clickEdit(view);
    expect(getImageUiState(view.state, imageFrom).revealed).toBe(true);

    const urlFrom = view.state.doc.toString().indexOf('https://');
    view.dispatch({ changes: { from: urlFrom, insert: 'x' }, selection: { anchor: urlFrom + 1 } });
    expect(getImageUiState(view.state, imageFrom).revealed).toBe(true);

    const afterPos = view.state.doc.toString().indexOf('After');
    view.dispatch({ selection: { anchor: afterPos } });
    expect(getImageUiState(view.state, imageFrom).revealed).toBe(false);
  });

  it('normal Link behavior is unchanged: raw Markdown stays visible while the caret remains inside, and only hides once it leaves', () => {
    const linkMd = '[Testingc](https://www.google.co.in)';
    const view = mountView(`Before ${linkMd} after`);
    const linkFrom = view.state.doc.toString().indexOf('[');

    // At rest: syntax concealed, only the label renders.
    expect(view.dom.textContent).not.toContain(linkMd);
    expect(view.dom.textContent).toContain('Testingc');

    // Caret enters the link's own range: full raw source becomes visible.
    view.dispatch({ selection: { anchor: linkFrom + 3 } });
    expect(view.dom.textContent).toContain(linkMd);

    // Editing the URL character-by-character keeps it visible throughout —
    // this was always true for Link; asserted here so a future regression
    // in either construct's mechanism is caught the same way.
    const urlFrom = view.state.doc.toString().indexOf('https://');
    view.dispatch({
      changes: { from: urlFrom, to: urlFrom + 5, insert: 'httpX' },
      selection: { anchor: urlFrom + 5 },
    });
    expect(view.dom.textContent).toContain('httpX://www.google.co.in');

    // Caret leaves the link's own line: hides again.
    const afterPos = view.state.doc.toString().indexOf('after');
    view.dispatch({ selection: { anchor: afterPos } });
    expect(view.dom.textContent).not.toContain('httpX://www.google.co.in');
    expect(view.dom.textContent).toContain('Testingc');
  });
});

/**
 * Coverage for the follow-up interaction correction: the image itself is
 * a clickable UI element (opens an overlay), not a text-editing surface.
 *
 * jsdom has no `posAtCoords` geometry (the same limitation
 * `taskCheckboxMouseHandlers.ts`'s own doc comment already names for this
 * codebase), so a synthetic click's *pixel position* can never be proven
 * to map to a specific document offset here. What *is* fully deterministic
 * and jsdom-safe, regardless of geometry: whether CM6 ever attempts a
 * selection-changing dispatch at all in response to the event. These tests
 * assert `view.state.selection` is byte-identical before and after a
 * dispatched click/mousedown on the image's wrapping `<button>` — if
 * `ignoreEvent()` (or a stopped-propagation local listener) correctly keeps
 * the event from ever
 * reaching CM6's own internal handling, there is nothing for geometry to
 * go wrong *in* in the first place, so this assertion holds regardless of
 * jsdom's layout limitations. Full, real-pixel-click confirmation is a
 * manual/real-browser verification step (this task's own §9), not
 * something asserted here.
 */
describe('Image click behavior', () => {
  it('1. renders normally', () => {
    const view = mountView(`See: ${IMAGE_MD}`);
    expect(getImg(view)).not.toBeNull();
  });

  it('2. clicking the image does not reveal raw Markdown', () => {
    const view = mountView(`See: ${IMAGE_MD}`);
    const button = getImageButton(view);
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(getImg(view)).not.toBeNull();
    expect(view.dom.textContent).not.toContain(IMAGE_MD);
  });

  it('3. clicking the image does not change the CodeMirror selection (no caret placement)', () => {
    const view = mountView(`See: ${IMAGE_MD}`, 0);
    const selectionBefore = view.state.selection.toJSON();

    const button = getImageButton(view);
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button.dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);

    expect(view.state.selection.toJSON()).toEqual(selectionBefore);
  });

  it('4. clicking the image triggers the image-open callback with the resolved url/alt', () => {
    const clicks: Array<{ url: string; alt: string }> = [];
    const view = mountView(`See: ${IMAGE_MD}`, 0, (url, alt) => clicks.push({ url, alt }));

    const button = getImageButton(view);
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(clicks).toEqual([{ url: 'https://example.com/mountain.jpg', alt: 'Mountain view' }]);
  });

  it("4b. a standard Markdown image's click callback receives no copyUrl (undefined) — only a Resource embed has one; ImageOverlay's own resource resolution falls back to `url` for this case", () => {
    const calls: Array<[string, string, string | undefined]> = [];
    const view = mountView(`See: ${IMAGE_MD}`, 0, (url, alt, copyUrl) =>
      calls.push([url, alt, copyUrl])
    );

    const button = getImageButton(view);
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(calls).toEqual([
      ['https://example.com/mountain.jpg', 'Mountain view', undefined],
    ]);
  });

  it('5. clicking the size button does not open the overlay', () => {
    const clicks: Array<{ url: string; alt: string }> = [];
    const view = mountView(`See: ${IMAGE_MD}`, 0, (url, alt) => clicks.push({ url, alt }));

    const sizeButton = getSizeButton(view);
    sizeButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    sizeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(clicks).toEqual([]);
  });

  it('6. clicking the edit/source button does not open the overlay', () => {
    const clicks: Array<{ url: string; alt: string }> = [];
    const view = mountView(IMAGE_MD, 0, (url, alt) => clicks.push({ url, alt }));

    clickEdit(view);

    expect(clicks).toEqual([]);
  });

  it('7. clicking the size button opens the image-options menu with the correct target', () => {
    const opened: OpenImageMenuParams[] = [];
    const view = mountView(`See: ${IMAGE_MD}`, 0, () => {}, (params) => opened.push(params));

    const sizeButton = getSizeButton(view);
    sizeButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    sizeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      alt: 'Mountain view',
      url: 'https://example.com/mountain.jpg',
      anchor: sizeButton,
    });
  });

  it('8. source-reveal behavior still works after this change', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    settleAllProbes();
    expect(view.dom.textContent).toContain(IMAGE_MD);
    expect(getImg(view)).not.toBeNull();
  });

  it('9. clicking elsewhere in the editor still allows normal caret placement', () => {
    const view = mountView(`See: ${IMAGE_MD}`, 0);
    view.dispatch({ selection: { anchor: 2 } });
    expect(view.state.selection.main.head).toBe(2);
  });

  it('10. editing the Markdown still works', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    const altStart = view.state.doc.toString().indexOf('Mountain view');
    view.dispatch({
      changes: { from: altStart, to: altStart + 'Mountain view'.length, insert: 'Updated alt' },
    });
    // Resolving the recovery probe flips `broken: false`, which rebuilds
    // into `renderWorking()` — which, under the native-broken-icon fix,
    // itself starts a *fresh* probe before mounting a real `<img>` (never
    // trusting the just-recovered URL blindly). A second settle pass
    // resolves that follow-up probe too.
    latestProbe().dispatchEvent(new Event('load'));
    settleAllProbes();
    expect(getImg(view)?.getAttribute('alt')).toBe('Updated alt');
  });

  it('11. undo/redo still works', () => {
    const view = mountView(`See: ${IMAGE_MD}`);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    expect(getImg(view)).toBeNull();
    undo(view);
    settleAllProbes();
    expect(getImg(view)).not.toBeNull();
  });

  it('12. deleting the image still works', () => {
    const view = mountView(`See: ${IMAGE_MD}`);
    expect(getImg(view)).not.toBeNull();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    expect(getImg(view)).toBeNull();
  });
});

/**
 * Accessibility coverage for the image's own clickable control
 * (`ImageWidget.ts`'s `imageButton`) — a real `<button>` wrapping the
 * `<img>`, per that file's own comment on why this shape was chosen over
 * `role="button"`+`tabindex`+manual keydown (an earlier, since-corrected
 * version of this file used that shape).
 *
 * jsdom does not implement the browser-native "Enter/Space on a focused
 * button synthesizes a `click`" behavior (confirmed empirically: a bare
 * `dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}))` on a real
 * `<button>` fires zero `click` listeners in this project's jsdom/vitest
 * setup) — the same category of gap `taskCheckboxMouseHandlers.ts`'s own
 * doc comment already names for `posAtCoords` geometry. So "Enter"/"Space"
 * below are tested as **what a real browser's native activation actually
 * produces** (a `click` event) against a structural guarantee that the
 * element is a genuine, unmodified `<button type="button">` — the same
 * native contract that gives Enter/Space activation for free in any real
 * browser, with no custom keydown code in this codebase to independently
 * verify or get wrong. Full real-browser keyboard confirmation is a
 * manual-verification step, not asserted here.
 */
describe('Image accessibility', () => {
  it('the image control is a real, enabled, type="button" element (native keyboard-activation contract)', () => {
    const view = mountView(`See: ${IMAGE_MD}`);
    const button = getImageButton(view);
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.disabled).toBe(false);
    // No explicit tabindex="-1" (or any tabindex at all) — a native
    // <button> is keyboard-focusable by default; adding one would only
    // ever be needed to *remove* it from tab order, never to add it.
    expect(button.getAttribute('tabindex')).toBeNull();
  });

  it('Enter (as a real browser would produce via native button activation) opens the overlay', () => {
    const clicks: Array<{ url: string; alt: string }> = [];
    const view = mountView(`See: ${IMAGE_MD}`, 0, (url, alt) => clicks.push({ url, alt }));
    const button = getImageButton(view);

    button.focus();
    // What a real browser actually dispatches for native Enter-activation
    // of a focused <button> — see this describe block's own doc comment
    // for why jsdom can't be trusted to synthesize this itself.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(clicks).toEqual([{ url: 'https://example.com/mountain.jpg', alt: 'Mountain view' }]);
  });

  it('Space (as a real browser would produce via native button activation) opens the overlay', () => {
    const clicks: Array<{ url: string; alt: string }> = [];
    const view = mountView(`See: ${IMAGE_MD}`, 0, (url, alt) => clicks.push({ url, alt }));
    const button = getImageButton(view);

    button.focus();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(clicks).toEqual([{ url: 'https://example.com/mountain.jpg', alt: 'Mountain view' }]);
  });

  it('mouse click opens the overlay', () => {
    const clicks: Array<{ url: string; alt: string }> = [];
    const view = mountView(`See: ${IMAGE_MD}`, 0, (url, alt) => clicks.push({ url, alt }));
    const button = getImageButton(view);

    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(clicks).toEqual([{ url: 'https://example.com/mountain.jpg', alt: 'Mountain view' }]);
  });

  it('does not double-open the overlay: a keydown alone (no accompanying click) never activates it', () => {
    // Guards specifically against the old, corrected shape (a manual
    // keydown handler living *alongside* a click handler, both able to
    // fire independently) reappearing — with the current real-<button>
    // shape, keydown itself does nothing in this codebase; only the
    // browser's own native click-synthesis (or a real mouse click)
    // reaches the single click listener, so a keydown with no
    // accompanying click must produce zero activations.
    const clicks: Array<{ url: string; alt: string }> = [];
    const view = mountView(`See: ${IMAGE_MD}`, 0, (url, alt) => clicks.push({ url, alt }));
    const button = getImageButton(view);

    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

    expect(clicks).toEqual([]);
  });

  it('a single click (however triggered) opens the overlay exactly once, never twice', () => {
    const clicks: Array<{ url: string; alt: string }> = [];
    const view = mountView(`See: ${IMAGE_MD}`, 0, (url, alt) => clicks.push({ url, alt }));
    const button = getImageButton(view);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(clicks).toHaveLength(1);
  });

  it('controls remain independently interactive — activating the image button does not touch them, and vice versa', () => {
    const clicks: Array<{ url: string; alt: string }> = [];
    const opened: OpenImageMenuParams[] = [];
    const view = mountView(`See: ${IMAGE_MD}`, 0, (url, alt) => clicks.push({ url, alt }), (params) => opened.push(params));

    // Size/edit controls unaffected by an image-button activation.
    const button = getImageButton(view);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(opened).toHaveLength(0);
    expect(view.dom.textContent).not.toContain(IMAGE_MD);

    // And the reverse: activating a control never opens the overlay
    // (already covered in "Image click behavior" #5/#6 above; repeated
    // here as part of this task's explicit accessibility checklist).
    // clicks already has one entry from the image-button activation above
    // — the assertion is that the size control's own click adds nothing
    // further, not that `clicks` is empty.
    const clicksBeforeSizeClick = clicks.length;
    const sizeButton = getSizeButton(view);
    sizeButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    sizeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clicks).toHaveLength(clicksBeforeSizeClick);
    expect(opened).toHaveLength(1);
  });
});

/**
 * Composition/nesting verification — Image was pulled out of the shared
 * `inlineLivePreviewRegion` traversal into its own standalone extension
 * (same move WikiLink already made, for a different reason), which is
 * exactly the shape of change `docs/editor-architecture-decisions.md`'s
 * "Standalone-renderer extraction" section warns can silently break
 * composition with an enclosing shared-traversal construct. Investigated
 * directly (mounted `EditorView`, real DOM) rather than assumed correct by
 * analogy with WikiLink.
 *
 * **Findings:**
 * 1. Nesting inside Strong/Emphasis/Strikethrough/Link all compose
 *    correctly — `Prec.high` (mirroring WikiLink's own reasoning) is
 *    sufficient; the image widget nests *inside* the enclosing construct's
 *    own mark, never split or ejected. Covered below.
 * 2. A real bug, now fixed (see `inlineLivePreviewParticipants.ts`'s
 *    `urlRenderer`): a *revealed* Image's own nested `URL` child was
 *    incorrectly styled `tok-link` by the shared traversal's bare-URL
 *    participant, since `Image` wasn't in that renderer's parent-name
 *    exclusion guard (only `Link`/`Autolink` were). Covered below.
 * 3. Not a bug, verified as the intended consequence of Image's own
 *    deliberately selection-independent design: if an *enclosing*
 *    construct (e.g. `**`) is engaged by the caret, its own markers reveal
 *    as raw text as usual, but the nested Image widget keeps rendering
 *    regardless — `imageLivePreview.ts` never consults `isTokenEngaged` at
 *    all, so there is no ancestor-engagement signal for it to react to,
 *    by design. Typing at the enclosing marker boundary and the image's
 *    own Edit button both still work correctly in this state. Covered
 *    below as a pinned "does not break" regression, not as a "should
 *    reveal" expectation.
 */
describe('Image composition / nesting', () => {
  it('nests correctly inside StrongEmphasis (**![alt](url)**)', () => {
    const view = mountView('See: **![Mountain view](https://example.com/mountain.jpg)**');
    const strong = view.dom.querySelector('.tok-strong');
    expect(strong).not.toBeNull();
    expect(strong?.querySelector('.cm-image-container')).not.toBeNull();
    expect(getImg(view)).not.toBeNull();
  });

  it('nests correctly inside Emphasis (*![alt](url)*)', () => {
    const view = mountView('See: *![Mountain view](https://example.com/mountain.jpg)*');
    const emphasis = view.dom.querySelector('.tok-emphasis');
    expect(emphasis).not.toBeNull();
    expect(emphasis?.querySelector('.cm-image-container')).not.toBeNull();
  });

  it('nests correctly inside Strikethrough (~~![alt](url)~~)', () => {
    const view = mountView('See: ~~![Mountain view](https://example.com/mountain.jpg)~~');
    const strike = view.dom.querySelector('.tok-strike');
    expect(strike).not.toBeNull();
    expect(strike?.querySelector('.cm-image-container')).not.toBeNull();
  });

  it('nests correctly inside a Link ([![alt](url)](url2)) — the linked-image pattern', () => {
    const view = mountView(
      'See: [![Mountain view](https://example.com/mountain.jpg)](https://example.com)'
    );
    const link = view.dom.querySelector('.tok-link');
    expect(link).not.toBeNull();
    expect(link?.querySelector('.cm-image-container')).not.toBeNull();
  });

  it('renders correctly adjacent to plain inline text on both sides', () => {
    const view = mountView('Before ![Mountain view](https://example.com/mountain.jpg) after');
    expect(view.dom.textContent).toContain('Before ');
    expect(view.dom.textContent).toContain(' after');
    expect(getImg(view)).not.toBeNull();
  });

  it('regression: a revealed image\'s own URL is not incorrectly styled tok-link by the shared URL participant', () => {
    const doc = '![Alt](https://example.com/img.jpg)';
    const view = mountView(doc);
    view.dispatch({
      effects: setImageUiState.of({ pos: 0, to: doc.length, state: { revealed: true, displayMode: 'fit', broken: false, pendingFirstLeave: false } }),
    });

    expect(view.dom.textContent).toContain(doc);
    expect(view.dom.querySelector('.tok-link')).toBeNull();
  });

  it('a genuine bare URL elsewhere on the same line is still correctly styled (the fix is scoped to Image only)', () => {
    const view = mountView('See https://example.com and ![Alt](https://example.com/img.jpg)');
    expect(view.dom.querySelector('.tok-link')).not.toBeNull();
  });

  it('does not break when an enclosing construct is independently engaged: typing still works, Edit button still works', () => {
    const doc = 'See: **![Mountain view](https://example.com/mountain.jpg)**';
    const strongOpenEnd = doc.indexOf('**') + 2;
    const view = mountView(doc, strongOpenEnd);

    // The enclosing Strong's own markers reveal as raw text (engaged);
    // the nested Image widget keeps rendering regardless — both are
    // simultaneously true by design (finding 3 above), not a conflict.
    expect(view.dom.querySelector('.cm-strong-marker:not(.cm-marker--concealed)')).not.toBeNull();
    expect(getImg(view)).not.toBeNull();

    // Typing right at the engaged marker boundary still works normally.
    view.dispatch({ changes: { from: strongOpenEnd, to: strongOpenEnd, insert: 'X' } });
    expect(view.state.doc.toString()).toContain('**X![Mountain view]');

    // The image's own Edit button still works in this state.
    const editButton = view.dom.querySelector<HTMLButtonElement>('.cm-image-control[aria-label="Edit source"]')!;
    editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(view.dom.textContent).toContain('![Mountain view](https://example.com/mountain.jpg)');
  });
});

/**
 * Regression tripwire for the controls-don't-follow-fixed-width layout
 * bug: `.cm-image-container` must shrink-wrap the rendered image
 * (`width: fit-content`), not stretch to the editor's full width
 * (`display: block`'s implicit `width: auto`). jsdom cannot compute real
 * layout (a mounted `EditorView` always measures geometry as `0` there —
 * the same limitation `markerConcealedLineHeight.test.ts` already
 * documents for this codebase), so the actual pixel-tracking behavior is
 * only provable in a real browser (verified directly: toggling
 * full-width/fixed-width repeatedly, `.cm-image-controls`'s own
 * `getBoundingClientRect().right` stayed exactly 8px inside
 * `.cm-image-container`'s own right edge every time, tracking a 500x120
 * test image shrinking from ~454px down to the fixed 240px cap and back).
 * What a source-level test can still do cheaply and reliably: guard the
 * CSS rule itself against silently reverting to a full-width box, which
 * is the exact root cause this fix addresses — `.cm-image-controls`'s own
 * `position: absolute; right: ...` is only ever correct relative to
 * whatever `.cm-image-container`'s own box actually is.
 */
describe('MarkdownEditor.css — .cm-image-container', () => {
  it('shrink-wraps its content (width: fit-content), not display: block\'s implicit full-width stretch', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const match = css.match(/\.cm-editor\s+\.cm-image-container\s*\{([^}]*)\}/);

    expect(match, '.cm-image-container rule not found').not.toBeNull();
    const body = match![1];

    expect(body).toMatch(/width\s*:\s*fit-content\s*;/);
    // A container that has reverted to filling its containing block
    // (`display: block` with no `width` override, or an explicit
    // `width: 100%`) would silently reintroduce the bug — the fixed-width
    // image would shrink but the container (and therefore the controls
    // anchored to it) would not.
    expect(body).not.toMatch(/(?<!max-)width\s*:\s*100%\s*;/);
    // `max-width: 100%` must remain alongside `width: fit-content` — it's
    // what still caps the container at the editor's width when the
    // image's own natural size would otherwise exceed it.
    expect(body).toMatch(/max-width\s*:\s*100%\s*;/);
    expect(body).toMatch(/position\s*:\s*relative\s*;/);
  });

  it('does NOT declare its own display — governed exclusively by the shared .cm-media-block class (global block-flow contract), never a per-widget inline-flex/block declaration', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const match = css.match(/\.cm-editor\s+\.cm-image-container\s*\{([^}]*)\}/);

    expect(match, '.cm-image-container rule not found').not.toBeNull();
    const body = match![1];

    expect(body).not.toMatch(/display\s*:/);
    expect(body).not.toMatch(/vertical-align\s*:/);
  });

  it('no other rule re-overrides .cm-line padding-block for a line containing an image — the exact regression that reintroduced ~12px of extra top+bottom space (6px extra per side) after the inline-flex fix already landed; .cm-line must stay at its own plain padding-block: 3px for every line, image or not', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');

    expect(css).not.toMatch(/\.cm-line\s*:\s*has\(\s*\.cm-image-container\s*\)\s*\{/);
    expect(css).not.toMatch(/\.cm-image-container[^{]*\{[^}]*padding-block/);
  });
});

/**
 * GLOBAL media/embed block-flow contract (`.cm-media-block`,
 * MarkdownEditor.css) — regression coverage for a real reported bug: a
 * narrow/custom-width image could render beside adjacent Markdown text
 * on the same source line whenever there was horizontal room, because
 * `.cm-image-container` used to be `display: inline-flex` (an
 * inline-level display, which can always share a line with other
 * inline content given enough space, regardless of its own width).
 *
 * jsdom performs no real layout, so these tests can't literally observe
 * text wrapping beside the widget (same limitation every other CSS
 * tripwire in this file already works around) — they assert the two
 * things that, together, *cause* block isolation instead: the shared
 * `.cm-media-block` rule is genuinely `display: block` in the real
 * stylesheet (a raw-text CSS tripwire, this file's own established
 * pattern), and every rendered widget root — every mode, every state,
 * even mid-paragraph with real text on both sides — actually carries
 * that class. See embedLivePreview.test.ts for the PDF-embed side of
 * this same shared contract.
 */
describe('Global media/embed block-flow contract — every ImageWidget root carries the shared .cm-media-block class', () => {
  function getContainer(view: EditorView): HTMLElement {
    const container = view.dom.querySelector<HTMLElement>('.cm-image-container');
    if (!container) throw new Error('image container not found');
    return container;
  }

  it('.cm-media-block itself is display: block in the stylesheet — the one shared rule every media widget opts into', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const match = css.match(/\.cm-media-block\s*\{([^}]*)\}/);
    expect(match, '.cm-media-block rule not found').not.toBeNull();
    expect(match![1]).toMatch(/display\s*:\s*block\s*;/);
  });

  it('every rendered ImageWidget root carries .cm-media-block, regardless of mode', () => {
    for (const mode of ['fill', 'fit'] as const) {
      const view = mountView(`![Photo|320,${mode}](https://example.com/a.jpg)`);
      expect(getContainer(view).classList.contains('cm-media-block')).toBe(true);
    }
  });

  it('a broken image root also carries .cm-media-block — the contract applies in every state, not just working Fit/Fill', () => {
    const view = mountView(IMAGE_MD);
    const img = getImg(view);
    img?.dispatchEvent(new Event('error'));
    const container = getContainer(view);
    expect(container.classList.contains('cm-image-container--broken')).toBe(true);
    expect(container.classList.contains('cm-media-block')).toBe(true);
  });

  it('a narrow custom-width image still carries .cm-media-block even mid-paragraph, with real text immediately before and after it on the same Markdown line', () => {
    // The exact reported shape: an embed with real text immediately
    // before and after it, all on one Markdown line/one Paragraph — the
    // scenario where an inline-level container could visually sit
    // beside the surrounding text. Presence of the class is what a
    // jsdom test can actually verify; real block isolation itself is a
    // real-browser-layout guarantee (the CSS rule's own doc comment).
    const view = mountView('Some text here. ![Image|320](https://example.com/a.jpg) More text here.');
    expect(view.dom.textContent).toContain('Some text here.');
    expect(view.dom.textContent).toContain('More text here.');
    expect(getContainer(view).classList.contains('cm-media-block')).toBe(true);
  });

  it('the same holds for Fill mode mid-paragraph', () => {
    const view = mountView('Some text here. ![Image|320,fill](https://example.com/a.jpg) More text here.');
    expect(getContainer(view).classList.contains('cm-media-block')).toBe(true);
  });
});

describe('MarkdownEditor.css — .cm-content min-width (narrow-viewport horizontal scroll)', () => {
  it('is min-width: 0 — .cm-content is a flex item of .cm-scroller (flex: 2 1 auto, set by CM6 itself), and flex items default to min-width: auto, which floors an item at its content\'s max-content width regardless of viewport. An unbreakable run inside a line (e.g. the broken-image hint\'s nowrap URL text) was bubbling all the way up to permanently floor .cm-content, overflowing .cm-scroller below ~478px and simultaneously preventing that hint\'s own text-overflow: ellipsis from ever engaging. Confirmed by live measurement: without this rule .cm-scroller.scrollWidth > .cm-scroller.clientWidth at narrow widths; with it, they match at every tested width.', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    // Strip block comments first: this rule's own doc comment prose
    // contains a literal `{ font-family: monospace }` example, which
    // would otherwise terminate a naive `[^}]*` match early.
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const match = cssWithoutComments.match(/\.markdown__editor\s+\.cm-content\s*\{([^}]*)\}/);

    expect(match, '.cm-content rule not found').not.toBeNull();
    const body = match![1];

    expect(body).toMatch(/min-width\s*:\s*0\s*;/);
  });
});

/**
 * Display modes (image-options-menu task): Large/Fill/Fit replace the
 * earlier two-state `fullWidth: boolean` model (`imageUiState.ts`'s own
 * doc comment explains why a boolean can't represent three mutually-
 * exclusive modes). What's verifiable at this level: switching modes
 * dispatches only a `setImageUiState` effect (never a `changes` spec) —
 * the Markdown source is untouched by construction, not by a separate
 * guard — and the resulting widget carries the right CSS class. The
 * actual pixel geometry (400px height cap, 320px width cap, Fill's
 * centering) is CSS the jsdom-layout-limitation notes above already cover
 * for `.cm-image-container`; verified in the real app instead (see this
 * task's manual verification).
 */
describe('Image display modes', () => {
  function dispatchMode(view: EditorView, pos: number, mode: 'fill' | 'fit', revealed = false) {
    view.dispatch({
      effects: setImageUiState.of({ pos, to: view.state.doc.length, state: { revealed, displayMode: mode, broken: false, pendingFirstLeave: false } }),
    });
  }

  // These fixtures use the bare `IMAGE_MD` doc (no leading text) so the
  // Image node's own `pos` is always 0 — `dispatchMode`'s `pos` argument
  // must match the node's real `from` exactly (imageUiState.ts keys its
  // RangeSet by exact position), and Image's own rendering never depends
  // on selection/engagement (confirmed elsewhere in this file), so there
  // is no "at rest" boundary ambiguity here the way there is for
  // selection-derived constructs.
  it('Fill is the default display mode', () => {
    const view = mountView(IMAGE_MD);
    expect(getImg(view)?.classList.contains('tok-image--fill')).toBe(true);
    expect(getImg(view)?.classList.contains('tok-image--large')).toBe(false);
    expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(false);
    expect(view.dom.querySelector('.cm-image-container--fill')).not.toBeNull();
  });

  it('Fill applies the fill class and the container gets the centering modifier', () => {
    const view = mountView(IMAGE_MD);
    dispatchMode(view, 0, 'fill');

    expect(getImg(view)?.classList.contains('tok-image--fill')).toBe(true);
    expect(view.dom.querySelector('.cm-image-container--fill')).not.toBeNull();
  });

  it('Fit applies the fit class to the image and the full-width modifier class to the container (not the fill class)', () => {
    const view = mountView(IMAGE_MD);
    dispatchMode(view, 0, 'fit');
    settleAllProbes();

    expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(true);
    expect(view.dom.querySelector('.cm-image-container--fit')).not.toBeNull();
    expect(view.dom.querySelector('.cm-image-container--fill')).toBeNull();
  });

  it('switching Fill → Fit → Fill never modifies the Markdown source', () => {
    const view = mountView(IMAGE_MD);

    dispatchMode(view, 0, 'fill');
    expect(view.state.doc.toString()).toBe(IMAGE_MD);

    dispatchMode(view, 0, 'fit');
    expect(view.state.doc.toString()).toBe(IMAGE_MD);

    dispatchMode(view, 0, 'fill');
    expect(view.state.doc.toString()).toBe(IMAGE_MD);
  });

  it('a display-mode change preserves the revealed source alongside the still-rendered image', () => {
    const view = mountView(IMAGE_MD);
    clickEdit(view);
    dispatchMode(view, 0, 'fit', true);
    settleAllProbes();

    expect(view.dom.textContent).toContain(IMAGE_MD);
    expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(true);
  });
});

/**
 * Custom numeric width — always applied to the *container*, never the
 * `<img>`, per `applyMediaWidth`'s own doc comment. `mediaPresentation
 * Model.ts`'s `parseMediaPresentationTokens` already classifies tokens by
 * shape (a run of digits vs. a recognized keyword), so width and mode
 * were already order-independent at the parse layer before this
 * milestone — these tests cover that the *rendered DOM* (container
 * class, inline width, `<img>` class) is identical regardless of which
 * order the Markdown actually wrote them in, for both Fit and Fill.
 */
describe('Custom numeric width — applied to the container, order-independent from mode', () => {
  function getContainer(view: EditorView): HTMLElement {
    const container = view.dom.querySelector<HTMLElement>('.cm-image-container');
    if (!container) throw new Error('image container not found');
    return container;
  }

  it('320,fit and fit,320 render identically: container width 320px + fit class, image fit class, no inline height anywhere', () => {
    const a = mountView('![Photo|320,fit](https://example.com/a.jpg)');
    const b = mountView('![Photo|fit,320](https://example.com/a.jpg)');

    for (const view of [a, b]) {
      const container = getContainer(view);
      expect(container.classList.contains('cm-image-container--fit')).toBe(true);
      expect(container.classList.contains('cm-image-container--fill')).toBe(false);
      expect(container.style.width).toBe('320px');
      expect(container.style.height).toBe('');
      expect(getImg(view)?.classList.contains('tok-image--fit')).toBe(true);
      expect(getImg(view)?.style.width).toBe('');
      expect(getImg(view)?.style.height).toBe('');
    }
  });

  it('320,fill and fill,320 render identically: container width 320px + fill class (height stays the fixed 400px from CSS, never inline)', () => {
    const a = mountView('![Photo|320,fill](https://example.com/a.jpg)');
    const b = mountView('![Photo|fill,320](https://example.com/a.jpg)');

    for (const view of [a, b]) {
      const container = getContainer(view);
      expect(container.classList.contains('cm-image-container--fill')).toBe(true);
      expect(container.classList.contains('cm-image-container--fit')).toBe(false);
      expect(container.style.width).toBe('320px');
      // Fill's 400px height is exclusively `.cm-image-container--fill`'s
      // own CSS (MarkdownEditor.css) — a custom width never adds an
      // inline height of any kind, for either mode.
      expect(container.style.height).toBe('');
      expect(getImg(view)?.classList.contains('tok-image--fill')).toBe(true);
      expect(getImg(view)?.style.width).toBe('');
      expect(getImg(view)?.style.height).toBe('');
    }
  });

  it('a default-width Fit/Fill image (no numeric token) never carries an inline width — pure CSS fallback', () => {
    const fit = mountView('![Photo|fit](https://example.com/a.jpg)');
    const fill = mountView('![Photo|fill](https://example.com/a.jpg)');
    expect(getContainer(fit).style.width).toBe('');
    expect(getContainer(fill).style.width).toBe('');
  });
});

/**
 * 2026-09-02 UX baseline, item 5: the widget's own initial (never-yet-
 * opened) `[data-menu-open]`/active-state defaults, at this CM6-only
 * level. The open/closed *toggle* itself is deliberately not CM6 state at
 * all (see `imageUiState.ts`'s doc comment for the bug that approach
 * caused — a stale `Overlay` anchor after the widget's DOM got recreated
 * mid-open) — it's driven by direct DOM mutation from
 * `MarkdownEditor.tsx`'s `setImageMenuButtonOpen`, exercised in
 * `MarkdownEditor.test.tsx`'s own "image options menu" coverage instead,
 * where the real anchor/Overlay wiring actually exists.
 */
describe('Image size menu — initial (closed) state', () => {
  it('defaults to closed', () => {
    const view = mountView(IMAGE_MD);
    const container = view.dom.querySelector('.cm-image-container') as HTMLElement;
    expect(container.dataset.menuOpen).toBe('false');
    expect(getSizeButton(view).classList.contains('cm-image-control--active')).toBe(false);
    expect(getSizeButton(view).getAttribute('aria-expanded')).toBe('false');
  });
});

/**
 * "Broken / Invalid Image UX" (2026-09-02 UX baseline). A genuine `<img>`
 * load failure — never a guess from the raw Markdown text — swaps the
 * widget for a dedicated broken-image representation with a trimmed-down
 * controls set. Detection is exclusively the real `error` event; a
 * *syntactically incomplete* image (`![Text]` with no destination) is
 * covered separately below ("Incomplete image syntax") and never reaches
 * this state at all, since it never becomes an `ImageWidget` (and
 * therefore never has an `<img>` to fail loading) in the first place.
 */
describe('Broken image fallback', () => {
  function getDeleteButton(view: EditorView): HTMLButtonElement {
    const button = view.dom.querySelector<HTMLButtonElement>('.cm-image-control[aria-label="Delete image"]');
    if (!button) {
      throw new Error('delete control not found');
    }
    return button;
  }

  it('MarkdownEditor.css: .cm-image-container--broken fills the available width, minus a deliberate 1px caret-overflow reserve', () => {
    // Not a literal 100% — see this rule's own doc comment in
    // MarkdownEditor.css: at width:100% the container left zero slack for
    // CM6's own boundary-caret rendering, which measurably overflowed
    // .cm-content's right edge (confirmed directly) and could flip
    // .cm-scroller into horizontal-scroll mode, shifting the whole editor.
    // `calc(100% - 1px)` is sub-pixel-imperceptible but eliminates the
    // overflow at its source.
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const match = css.match(/\.cm-editor\s+\.cm-image-container--broken\s*\{([^}]*)\}/);
    expect(match, '.cm-image-container--broken rule not found').not.toBeNull();
    // `(?<!max-)` is load-bearing, not decorative — regression test for a
    // real bug: `max-width: calc(100% - 1px)` only *caps* the container's
    // width, it doesn't set it, so with the base `.cm-image-container`
    // rule's own `width: fit-content` (the widget-buffer spacing fix)
    // still in effect, the broken bar silently shrink-wrapped to its own
    // content instead of filling the line. A bare `/width\s*:.../` regex
    // (no lookbehind) doesn't catch this — "max-width: calc(...)" still
    // *contains* the substring "width: calc(...)", so the assertion kept
    // passing throughout that regression. Confirmed directly (live
    // browser measurement) that switching this back to `max-width` was
    // NOT what caused a separately-observed horizontal-scroll issue —
    // that reproduced identically with or without this property, from an
    // unrelated general narrow-viewport `.cm-content` sizing issue.
    expect(match![1]).toMatch(/(?<!max-)width\s*:\s*calc\(100%\s*-\s*1px\)\s*;/);
    expect(match![1]).not.toMatch(/max-width\s*:/);
  });

  it('renders the broken representation (icon + alt + hint) instead of an <img>', () => {
    const view = mountView(IMAGE_MD);
    expect(getImg(view)).not.toBeNull();

    getImg(view)!.dispatchEvent(new Event('error'));

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();
    const broken = view.dom.querySelector('.cm-image-broken');
    expect(broken).not.toBeNull();
    expect(broken?.querySelector('.cm-image-broken__icon-wrap')).not.toBeNull();
    expect(broken?.querySelector('.cm-image-broken__icon-wrap .cm-image-broken__icon')).not.toBeNull();
    expect(broken?.querySelector('.cm-image-broken__alt')?.textContent).toBe('Unable to load');
    expect(broken?.querySelector('.cm-image-broken__hint')?.textContent).toBe(
      'https://example.com/mountain.jpg'
    );
  });

  it('shows hover controls with ONLY Edit source + Delete — no size button', () => {
    const view = mountView(IMAGE_MD);
    getImg(view)!.dispatchEvent(new Event('error'));

    expect(view.dom.querySelector('.cm-image-control[aria-label="Edit source"]')).not.toBeNull();
    expect(view.dom.querySelector('.cm-image-control[aria-label="Delete image"]')).not.toBeNull();
    expect(view.dom.querySelector('.cm-image-control[aria-label="Image size options"]')).toBeNull();
    // Exactly two controls — guards against a future addition silently
    // reintroducing a size/options affordance for a broken image.
    expect(view.dom.querySelectorAll('.cm-image-controls .cm-image-control').length).toBe(2);
  });

  it('never opens the image overlay — no image button/click-to-open wiring exists in the broken state', () => {
    const view = mountView(IMAGE_MD);
    getImg(view)!.dispatchEvent(new Event('error'));

    expect(view.dom.querySelector('button.cm-image-button')).toBeNull();
  });

  it('Edit source reveals the raw Markdown above the still-broken representation, caret at the end', () => {
    const view = mountView(IMAGE_MD);
    getImg(view)!.dispatchEvent(new Event('error'));

    clickEdit(view);

    expect(view.dom.textContent).toContain(IMAGE_MD);
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();
    const sel = view.state.selection.main;
    expect(sel.empty).toBe(true);
    expect(sel.from).toBe(IMAGE_MD.length);
  });

  it('Edit source auto-hides once the caret leaves the image line, same as the working state', () => {
    const view = mountView(`Before\n${IMAGE_MD}\nAfter`);
    getImg(view)!.dispatchEvent(new Event('error'));
    clickEdit(view);
    expect(view.dom.textContent).toContain(IMAGE_MD);

    const afterLineStart = view.state.doc.toString().indexOf('After');
    view.dispatch({ selection: { anchor: afterLineStart } });

    expect(view.dom.textContent).not.toContain(IMAGE_MD);
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();
  });

  it('Delete removes the Markdown image via a real CM6 transaction, undo/redo both work', () => {
    // Single-line doc: computeImageDeletionRange's own "image is the
    // document's only line" case deletes the whole line, "See: " prefix
    // included — same behavior the existing (non-broken) Delete coverage
    // in imageDeletion.test.ts already establishes; not special-cased for
    // the broken state.
    const view = mountView(`See: ${IMAGE_MD}`);
    getImg(view)!.dispatchEvent(new Event('error'));

    getDeleteButton(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.state.doc.toString()).toBe('');
    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();

    undo(view);
    expect(view.state.doc.toString()).toBe(`See: ${IMAGE_MD}`);
    // Re-inserting the image's own line is itself an edit that touches
    // that line, so imageUiState.ts's own `broken`-reset logic (by
    // design, not a bug here — see that file's doc comment) gives the
    // restored occurrence a fresh load attempt rather than remembering
    // it was broken; a real browser would very likely re-fail against the
    // same bad URL and re-enter the broken state on its own. What matters
    // for Delete's own undo/redo contract is that the Markdown and a
    // rendered occurrence both come back — asserted directly.
    expect(view.dom.querySelector('.cm-image-container')).not.toBeNull();

    redo(view);
    expect(view.state.doc.toString()).toBe('');
  });

  it('editing a broken image\'s own URL stays broken (our own UI, never a live <img>) until a background probe confirms the new URL actually loads', () => {
    const view = mountView(IMAGE_MD);
    getImg(view)!.dispatchEvent(new Event('error'));
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();

    // Simulate fixing the URL by editing the (currently hidden) source —
    // reveal it first, same as a real user would via the Edit button.
    clickEdit(view);
    const urlStart = view.state.doc.toString().indexOf('https://');
    const urlEnd = view.state.doc.toString().indexOf(')');
    view.dispatch({
      changes: { from: urlStart, to: urlEnd, insert: 'https://example.com/fixed.jpg' },
    });

    // Immediately after the edit: still our own broken UI, NOT a live
    // <img> with the new (as-yet-unverified) URL — this is the whole
    // point of the pessimistic-until-confirmed design. A background probe
    // was started for the new URL (captured below) but hasn't resolved.
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();
    expect(getImg(view)).toBeNull();
    expect(getImageUiState(view.state, 0).broken).toBe(true);

    // The probe itself was given the corrected URL, and — critically —
    // was never inserted into the visible DOM (never queryable via
    // `getImg`, which only ever finds `img.tok-image` inside `view.dom`).
    const probe = latestProbe();
    expect(probe.src).toBe('https://example.com/fixed.jpg');
    expect(view.dom.contains(probe)).toBe(false);

    // Only once the probe's own `load` event confirms the URL genuinely
    // resolves does the widget switch to the normal, working
    // representation — at which point the real, visible <img> is
    // constructed for a URL already known to load.
    probe.dispatchEvent(new Event('load'));
    // The now-recovered widget's own renderWorking() starts a fresh probe
    // of its own before mounting a real <img> — see settleAllProbes's doc
    // comment.
    settleAllProbes();

    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();
    expect(getImg(view)?.getAttribute('src')).toBe('https://example.com/fixed.jpg');
  });

  it('editing a previously-WORKING image\'s URL toward a bad one also flips pessimistic immediately — the direction the earlier design never covered at all', () => {
    const view = mountView(IMAGE_MD);
    expect(getImg(view)).not.toBeNull();
    expect(getImageUiState(view.state, 0).broken).toBe(false);

    clickEdit(view);
    const urlStart = view.state.doc.toString().indexOf('https://');
    const urlEnd = view.state.doc.toString().indexOf(')');
    view.dispatch({
      changes: { from: urlStart, to: urlEnd, insert: 'https://example.com/now-broken.jpg' },
    });

    // No live <img> was ever mounted for the edited (unverified) URL —
    // this is the exact mechanism that closes the "browser's native
    // broken-image glyph flashes during rapid URL editing" report: a
    // working image being edited toward a bad URL never gets a chance to
    // mount a real <img> with that unverified URL in the first place.
    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();
    expect(getImageUiState(view.state, 0).broken).toBe(true);

    const probe = latestProbe();
    expect(probe.src).toBe('https://example.com/now-broken.jpg');
    probe.dispatchEvent(new Event('error'));

    // Confirmed broken — stays on our own representation, never the
    // browser's native one (there was never a visible <img> to show it).
    expect(getImageUiState(view.state, 0).broken).toBe(true);
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();
  });

  it('a stale probe (superseded by further typing before it resolved) is discarded, never applying a stale verdict', () => {
    const view = mountView(IMAGE_MD);
    getImg(view)!.dispatchEvent(new Event('error'));
    clickEdit(view);

    const urlStart = view.state.doc.toString().indexOf('https://');
    const firstUrlEnd = view.state.doc.toString().indexOf(')');
    view.dispatch({ changes: { from: urlStart, to: firstUrlEnd, insert: 'https://example.com/first.jpg' } });
    const firstProbe = latestProbe();
    expect(firstProbe.src).toBe('https://example.com/first.jpg');

    // Superseded by a second edit before the first probe ever resolved —
    // exactly what rapid character-by-character typing produces.
    const secondUrlEnd = view.state.doc.toString().indexOf(')');
    view.dispatch({ changes: { from: urlStart, to: secondUrlEnd, insert: 'https://example.com/second.jpg' } });
    expect(getImageUiState(view.state, 0).broken).toBe(true);

    // The stale first probe finally resolves (a slow network reply
    // arriving late) — must be silently discarded, not applied.
    firstProbe.dispatchEvent(new Event('load'));

    expect(getImageUiState(view.state, 0).broken).toBe(true);
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();
    expect(getImg(view)).toBeNull();

    // The second (current) probe resolving is what's actually allowed to
    // change anything.
    const secondProbe = latestProbe();
    expect(secondProbe.src).toBe('https://example.com/second.jpg');
    secondProbe.dispatchEvent(new Event('load'));
    settleAllProbes();

    expect(getImageUiState(view.state, 0).broken).toBe(false);
    expect(getImg(view)?.getAttribute('src')).toBe('https://example.com/second.jpg');
  });

  it('editing a line ABOVE the image never marks it broken — the exact coordinate-space bug this whole mechanism was rewritten to fix', () => {
    // The originally-reported bug: deleting characters on an unrelated
    // preceding line, confirmed via a direct coordinate-space sweep
    // against the real reducer to false-positive specifically when the
    // deleted count was large relative to the gap before the image.
    const view = mountView(`AB\n${IMAGE_MD}\nAfter`);
    const imageFrom = view.state.doc.toString().indexOf('![');
    getImg(view)!.dispatchEvent(new Event('error'));
    expect(getImageUiState(view.state, imageFrom).broken).toBe(true);

    // Delete "AB\n" entirely — the exact boundary case the coordinate-
    // space bug mishandled (image shifts backward by the deleted count).
    view.dispatch({ changes: { from: 0, to: 3, insert: '' } });
    const newImageFrom = imageFrom - 3;

    // The whole point: `broken` must stay exactly `true`, never reset by
    // an edit that never touched the image's own text. (A widget
    // reconstruction — and therefore a fresh, harmless, redundant probe —
    // can still happen here for an unrelated reason: `ImageWidget.eq()`
    // also compares `pos`, which genuinely did shift by 3 when the
    // preceding line was deleted; that's expected CM6 diffing, not the
    // bug this test guards against.)
    expect(getImageUiState(view.state, newImageFrom).broken).toBe(true);
  });

  it('typing text immediately after a broken image does NOT reset broken: false — its own URL never changed', () => {
    const view = mountView(IMAGE_MD);
    getImg(view)!.dispatchEvent(new Event('error'));
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();
    clickEdit(view);

    // Same shape as the "completing source editing" scenario: text
    // inserted strictly after the node's own `to`, never touching its
    // URL — must leave `broken` alone, not hand it a fresh (and, for the
    // same unchanged bad URL, doomed-to-fail-again) <img> just because
    // something was typed nearby on the same line.
    view.dispatch({
      changes: { from: IMAGE_MD.length, insert: ' more text' },
      selection: { anchor: IMAGE_MD.length + ' more text'.length },
    });

    expect(getImageUiState(view.state, 0).broken).toBe(true);
  });
});

/**
 * Regression coverage for a reported bug: two Image nodes directly
 * adjacent with no separator (`![A](url1)![B](url2)`) share a document
 * position — the first node's own `to` equals the second node's own
 * `from`. `imageUiState.ts`'s `getImageUiState` looks up per-node state
 * via `RangeSet.between(pos, pos, cb)`, and `between`'s point query also
 * visits any *other* entry whose own span happens to *end* exactly at
 * that point (confirmed directly against `RangeSet`'s real behavior, not
 * assumed) — which is exactly what the shared boundary above produces the
 * instant the first image has any stored entry at all (an edit touched
 * it, its own controls were used, anything). The reported, reproduced
 * failure: the second image's own correct `broken: true` entry went
 * unseen — the lookup returned the first (working) image's `broken:
 * false` instead — silently authorizing `ImageWidget.renderWorking()` to
 * mount a real, visible `<img>` for the second image's invalid URL,
 * showing the browser's own native broken-image glyph inside a full-size
 * `--fill` box. Fixed by requiring the found entry's own `from` to
 * exactly equal the queried position at both lookup sites in
 * `imageUiState.ts` (`getImageUiState` and the `broken`-forcing block's
 * own "existing entry" lookup) — see those functions' own doc comments
 * for the full account.
 */
describe('Adjacent images with no separator — each node has fully independent UI/load state', () => {
  function mountAdjacent(firstUrl: string, secondUrl: string): EditorView {
    return mountView(`![A](${firstUrl})![B](${secondUrl})`);
  }

  function getImages(view: EditorView): HTMLImageElement[] {
    return Array.from(view.dom.querySelectorAll<HTMLImageElement>('img.tok-image'));
  }

  function getContainers(view: EditorView): HTMLElement[] {
    return Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-image-container'));
  }

  it('valid + invalid (no separator): only the second image goes broken when its own <img> errors', () => {
    const view = mountAdjacent('https://example.com/valid.jpg', 'https://example.com/invalid.jpg');
    const images = getImages(view);
    expect(images.length).toBe(2);

    images[1]!.dispatchEvent(new Event('error'));

    const containers = getContainers(view);
    expect(containers.length).toBe(2);
    expect(containers[0]!.classList.contains('cm-image-container--broken')).toBe(false);
    expect(containers[1]!.classList.contains('cm-image-container--broken')).toBe(true);
    // The first image is completely unaffected — still a real, working
    // <img>, still its own default (untouched) UI state.
    expect(getImages(view).length).toBe(1);
    expect(getImageUiState(view.state, 0).broken).toBe(false);
  });

  it('invalid + valid (no separator): only the first image goes broken when its own <img> errors', () => {
    const view = mountAdjacent('https://example.com/invalid.jpg', 'https://example.com/valid.jpg');
    const images = getImages(view);

    images[0]!.dispatchEvent(new Event('error'));
    // The first image's own broken transition also happens to rebuild the
    // second image's widget (an existing, harmless CM6 decoration-diffing
    // detail this fixture already exercises — the second image's own
    // content/state is genuinely unchanged) — under the native-broken-icon
    // fix, that rebuild starts a fresh probe of its own before showing a
    // real <img> again, so it needs settling too. Excludes the first
    // image's own URL — settling *that* probe would silently recover it
    // before this test gets to assert it's broken.
    settleAllProbesExceptUrl('https://example.com/invalid.jpg');

    const containers = getContainers(view);
    expect(containers[0]!.classList.contains('cm-image-container--broken')).toBe(true);
    expect(containers[1]!.classList.contains('cm-image-container--broken')).toBe(false);
    expect(getImages(view).length).toBe(1);
  });

  it('two invalid images (no separator): each goes broken independently, neither depends on the other', () => {
    const view = mountAdjacent('https://example.com/bad1.jpg', 'https://example.com/bad2.jpg');
    const images = getImages(view);

    images[0]!.dispatchEvent(new Event('error'));
    settleAllProbesExceptUrl('https://example.com/bad1.jpg');
    // Only the first has failed so far — the second must still be a real,
    // working <img> (this is the exact case the reported bug's DOM
    // evidence came from: the second rendering via renderWorking()).
    expect(getContainers(view)[0]!.classList.contains('cm-image-container--broken')).toBe(true);
    expect(getContainers(view)[1]!.classList.contains('cm-image-container--broken')).toBe(false);

    getImages(view)[0]!.dispatchEvent(new Event('error'));
    const containers = getContainers(view);
    expect(containers[0]!.classList.contains('cm-image-container--broken')).toBe(true);
    expect(containers[1]!.classList.contains('cm-image-container--broken')).toBe(true);
    expect(getImages(view).length).toBe(0);
  });

  it('two valid images (no separator): both render normally, neither ever goes broken', () => {
    const view = mountAdjacent('https://example.com/valid1.jpg', 'https://example.com/valid2.jpg');
    expect(getImages(view).length).toBe(2);
    expect(getContainers(view).some((c) => c.classList.contains('cm-image-container--broken'))).toBe(false);
  });

  it('editing (touching) the first image after it renders does not corrupt the second image\'s own lookup', () => {
    // Reproduces the exact mechanism: the first image acquires a stored
    // imageUiState entry (via its own Edit-source toggle) whose span's
    // `to` lands exactly on the second image's own `from` — the shared
    // boundary a plain `RangeSet.between(pos, pos, ...)` point query
    // conflates without the `from === pos` guard this fix adds.
    const view = mountAdjacent('https://example.com/valid.jpg', 'https://example.com/invalid.jpg');
    clickEdit(view); // toggles the FIRST image's own edit button (first in DOM order)
    settleAllProbes();

    getImages(view)[1]!.dispatchEvent(new Event('error'));

    const secondImageFrom = view.state.doc.toString().indexOf('![B]');
    expect(getImageUiState(view.state, secondImageFrom).broken).toBe(true);
    expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();
  });

  it('sanity: a space separator was never affected by this bug (images no longer share a boundary position)', () => {
    const view = mountView('![A](https://example.com/valid.jpg) ![B](https://example.com/invalid.jpg)');
    const images = getImages(view);
    images[1]!.dispatchEvent(new Event('error'));

    const containers = getContainers(view);
    expect(containers[0]!.classList.contains('cm-image-container--broken')).toBe(false);
    expect(containers[1]!.classList.contains('cm-image-container--broken')).toBe(true);
  });
});

/**
 * "Incomplete image syntax must remain plain editable Markdown" — a
 * syntactically incomplete `![...]`/`![...](...` never satisfies
 * `scanImage`'s own `](`+trailing-`)` check (imageScanner.ts), so
 * `imageLivePreview.ts`'s existing `if (!match) return;` guard already
 * excludes it before any decoration/widget is ever created — confirmed
 * directly against the real Lezer tree (not assumed): `![Text]` parses as
 * a genuine `Image` node (CommonMark's shortcut-reference-image syntax
 * tentatively matches any `![...]`), but that node's own range never
 * includes a destination, which is exactly what `scanImage` checks for.
 * This is what makes the broken-image state's own detection (a real
 * `<img>` `error` event) safe by construction: it can only ever apply to
 * an occurrence that already parsed as a syntactically complete image.
 */
describe('Incomplete image syntax', () => {
  it.each([
    ['![Text]', '![Text]'],
    ['![Text](', '![Text]('],
    ['![Text](http', '![Text](http'],
    ['![', '!['],
    ['![Text](  ', '![Text](  '],
    // closeBrackets() auto-closes `(` to `()` the instant it's typed —
    // see imageScanner.ts's own doc comment on its empty-destination
    // check. An already-closed-but-empty destination must stay just as
    // editable as a still-open one.
    ['![Text]()', '![Text]()'],
    ['![Text](   )', '![Text](   )'],
  ])('%s remains plain editable Markdown — no widget, no broken state', (_label, doc) => {
    const view = mountView(doc);
    expect((getImg(view) !== null)).toBe(false);
    expect(view.dom.textContent).toContain(doc);
  });

  it('a complete valid-looking URL renders the normal working image', () => {
    const view = mountView('![Text](valid-url)');
    expect((getImg(view) !== null)).toBe(true);
    expect(view.dom.querySelector('.cm-image-container--broken')).toBeNull();
    expect(getImg(view)?.getAttribute('src')).toBe('valid-url');
  });

  it('a complete image only goes broken after its own <img> actually fails to load, never merely from being present', () => {
    const view = mountView('![Text](https://example.com/nonexistent.jpg)');
    expect(view.dom.querySelector('.cm-image-container--broken')).toBeNull();
    expect(getImg(view)).not.toBeNull();

    getImg(view)!.dispatchEvent(new Event('error'));

    expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();
  });

  it('typing an image progressively never renders a widget while the syntax is still incomplete', () => {
    const view = mountView('');
    const steps = ['!', '![', '![Text', '![Text]', '![Text](', '![Text](https://example.com/x.png'];
    for (const doc of steps) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
      expect((getImg(view) !== null)).toBe(false);
    }
  });

  it('Phase 2: completing the syntax by typing does not itself render it — the caret is still there, so raw Markdown stays visible until the caret first leaves', () => {
    const view = mountView('');
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '![Text](https://example.com/x.png)' },
    });

    expect((getImg(view) !== null)).toBe(false);
    expect(view.dom.textContent).toContain('![Text](https://example.com/x.png)');

    // The caret leaves (e.g. typing a space right after) — now it renders.
    view.dispatch({
      changes: { from: view.state.doc.length, insert: ' ' },
      selection: { anchor: view.state.doc.length + 1 },
    });
    settleAllProbes();

    expect((getImg(view) !== null)).toBe(true);
  });
});

/**
 * Every dispatch below explicitly sets `selection` to track the end of
 * whatever it just typed — this is load-bearing, not decoration. CM6's
 * *default* selection mapping (`EditorSelection.map`'s own `assoc: -1`)
 * does **not** advance the caret through an insertion made exactly at the
 * caret's own old position — confirmed directly, the hard way, when an
 * earlier version of these tests omitted `selection` and produced results
 * that only made sense once traced back to the caret silently staying at
 * position 0 throughout. A real keystroke always ends with the caret
 * after what was typed; a hand-built `{changes}}`-only dispatch does not
 * reproduce that unless told to.
 */
describe('Phase 2: two consecutive images (no separator) are independent through the first-leave lifecycle', () => {
  const ONE = '![one](one.png)';
  const TWO = '![two](two.png)';

  function typeAt(view: EditorView, from: number, insert: string): void {
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length } });
  }

  it('the first image completes its own first-leave lifecycle as soon as typing the second moves the caret past it — the second stays in its own initial (raw) editing state', () => {
    const view = mountView('', 0);
    typeAt(view, 0, ONE); // caret now at ONE.length, inside image #1
    expect(getImg(view)).toBeNull();

    typeAt(view, view.state.doc.length, TWO); // caret now at the end, inside image #2
    settleAllProbes();

    // Image #1's own caret has moved past its `to` boundary as a direct
    // consequence of typing #2 right after it — this IS its first leave,
    // independent of anything about #2. #2, whose own caret is still at
    // its own end, has not had a first leave yet.
    const images = view.dom.querySelectorAll<HTMLImageElement>('img.tok-image');
    expect(images.length).toBe(1);
    expect(images[0]!.src).toContain('one.png');
    expect(view.dom.textContent).toContain(TWO);
  });

  it('leaving the second image afterward does not re-trigger or otherwise affect the already-settled first image', () => {
    const view = mountView('', 0);
    typeAt(view, 0, ONE);
    typeAt(view, view.state.doc.length, TWO);
    settleAllProbes();
    const firstImgSrcAfterFirstLeave = view.dom.querySelector<HTMLImageElement>('img.tok-image')?.src;
    expect(firstImgSrcAfterFirstLeave).toContain('one.png');

    typeAt(view, view.state.doc.length, ' '); // leave #2 too
    settleAllProbes();

    const images = view.dom.querySelectorAll<HTMLImageElement>('img.tok-image');
    expect(images.length).toBe(2);
    expect(images[0]!.src).toBe(firstImgSrcAfterFirstLeave);
    expect(images[1]!.src).toContain('two.png');
  });

  it('navigating back into either already-rendered image does not reveal raw Markdown for it', () => {
    const view = mountView('', 0);
    typeAt(view, 0, ONE);
    typeAt(view, view.state.doc.length, TWO);
    typeAt(view, view.state.doc.length, ' ');
    settleAllProbes();
    expect(view.dom.querySelectorAll('img.tok-image').length).toBe(2);

    // Arrow-key-equivalent navigation into #1 (position 3, inside "one.png").
    view.dispatch({ selection: { anchor: 3 } });
    expect(view.dom.querySelectorAll('img.tok-image').length).toBe(2);

    // ...and into #2 (inside "two.png").
    view.dispatch({ selection: { anchor: ONE.length + 3 } });
    expect(view.dom.querySelectorAll('img.tok-image').length).toBe(2);
  });
});

describe('Phase 2: pendingFirstLeave lifecycle edge cases (does not accidentally reactivate for an already-settled occurrence)', () => {
  function typeAt(view: EditorView, from: number, insert: string): void {
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length } });
  }

  it('undo/redo across an unrelated edit does not disturb an already-settled image\'s rendering', () => {
    const view = mountView('', 0);
    typeAt(view, 0, IMAGE_MD);
    typeAt(view, view.state.doc.length, ' x'); // settles it
    settleAllProbes();
    expect(getImg(view)).not.toBeNull();

    // An unrelated edit elsewhere, then undo it. `isolateHistory: 'before'`
    // forces this into its own undo group, separate from the image's own
    // creation above — otherwise CM6's own default time-based grouping
    // (dispatches within `newGroupDelay`, 500ms, of each other) merges
    // everything dispatched synchronously in one test into a single undo
    // step, which is a test-harness artifact, not something a real user's
    // spaced-out keystrokes would do.
    view.dispatch({
      changes: { from: view.state.doc.length, insert: 'y' },
      selection: { anchor: view.state.doc.length + 1 },
      annotations: isolateHistory.of('before'),
    });
    undo(view);
    settleAllProbes();

    expect(view.state.doc.toString()).toContain(IMAGE_MD); // only 'y' was undone
    expect(getImg(view)).not.toBeNull();

    redo(view);
    settleAllProbes();
    expect(getImg(view)).not.toBeNull();
  });

  it('editing the URL of an already-settled, revealed image does not reset pendingFirstLeave — the raw source stays visible for the reason Edit-source put it there, not because it re-became "fresh"', () => {
    const view = mountView(IMAGE_MD, 0); // mounted at rest, no entry — settled by construction
    expect(getImg(view)).not.toBeNull();

    clickEdit(view);
    expect(view.dom.textContent).toContain(IMAGE_MD);
    // Edit a character inside the URL.
    const urlPos = view.state.doc.toString().indexOf('mountain');
    view.dispatch({ changes: { from: urlPos, insert: 'X' }, selection: { anchor: urlPos + 1 } });

    // Still revealed (Edit-source's own state), not additionally re-marked pending.
    expect(getImageUiState(view.state, 0).pendingFirstLeave).toBe(false);
    expect(getImageUiState(view.state, 0).revealed).toBe(true);
  });

  it('deleting an image entirely and retyping an identical-looking one at the same position does not leak the old settled state into treating the new one as already-settled — OR, if it does inherit the old entry, it never regresses to showing raw Markdown for content the user never engaged (documenting actual RangeSet.map behavior, not assumed)', () => {
    const view = mountView('', 0);
    typeAt(view, 0, IMAGE_MD);
    typeAt(view, view.state.doc.length, ' x');
    settleAllProbes();
    expect(getImg(view)).not.toBeNull(); // settled

    // Delete the image text entirely (keep the trailing " x").
    view.dispatch({ changes: { from: 0, to: IMAGE_MD.length, insert: '' }, selection: { anchor: 0 } });
    expect(getImg(view)).toBeNull();

    // Retype an identical image at the same position.
    typeAt(view, 0, IMAGE_MD);

    // Whatever the RangeSet mapping did with the old entry, the caret is
    // now at IMAGE_MD.length — genuinely still inside the just-retyped
    // node. The invariant that actually matters (per the product rule)
    // is: it must not show the *rendered* widget while the caret is still
    // sitting inside content the user is actively retyping right now.
    expect(getImg(view)).toBeNull();
    expect(view.dom.textContent).toContain(IMAGE_MD);
  });

  it('moving an already-settled image through document changes (editing text before it) preserves its settled (non-pending) state — no spurious reveal on unrelated edits', () => {
    const view = mountView('', 0);
    typeAt(view, 0, IMAGE_MD);
    typeAt(view, view.state.doc.length, ' x');
    settleAllProbes();
    expect(getImg(view)).not.toBeNull();

    // Insert unrelated text before the image, shifting its position, with
    // the caret ending up right after that prefix — NOT inside the image.
    typeAt(view, 0, 'prefix ');
    settleAllProbes();

    const shiftedFrom = view.state.doc.toString().indexOf('![');
    expect(shiftedFrom).toBe('prefix '.length);
    expect(getImageUiState(view.state, shiftedFrom).pendingFirstLeave).toBe(false);
    expect(getImg(view)).not.toBeNull();
  });
});

/**
 * CSS tripwires for the three display modes, same jsdom-cannot-compute-
 * real-layout rationale as `.cm-image-container`'s own tripwire above.
 */
describe('MarkdownEditor.css — display mode rules', () => {
  function ruleBody(css: string, selector: RegExp): string {
    const match = css.match(selector);
    expect(match, `rule not found: ${selector}`).not.toBeNull();
    return match![1] ?? '';
  }

  it('.tok-image--fill fills a real 100%-wide, 100%-tall box (of its 400px-tall container) via object-fit: cover (not just a max-height cap)', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const body = ruleBody(css, /\.cm-editor\s+\.tok-image\.tok-image--fill\s*\{([^}]*)\}/);
    // A real `height`, not `max-height` — object-fit only has a box to
    // crop into once both dimensions are real sizes, not caps a smaller
    // image could still shrink below (the exact bug this rule was fixed
    // for: a `max-height` + `width: 100%` version left short images
    // short instead of filling the box). The fixed 400px length itself
    // lives on `.cm-image-container--fill` (below) — the image is
    // `height: 100%` of that box, not a literal `400px` of its own.
    expect(body).toMatch(/height\s*:\s*100%\s*;/);
    expect(body).not.toMatch(/max-height\s*:/);
    expect(body).toMatch(/width\s*:\s*100%\s*;/);
    // object-fit: cover is what makes filling both dimensions compatible
    // with "never distort" — it uniformly scales the image (its own
    // proportions never altered) and crops whatever doesn't fit; it
    // never stretches the image to match the *container's* aspect
    // ratio, which is a structurally different thing `object-fit: fill`
    // (a different keyword, never used here) would do instead.
    expect(body).toMatch(/object-fit\s*:\s*cover\s*;/);
    expect(body).not.toMatch(/object-fit\s*:\s*fill\s*;/);
  });

  it('.tok-image--fill anchors its crop at mathematical center — a real "subject pushed to the bottom edge" bug was a missing height:100% relay on .cm-image-button, not an object-position problem, so center stays correct once the box itself is the right size', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const body = ruleBody(css, /\.cm-editor\s+\.tok-image\.tok-image--fill\s*\{([^}]*)\}/);
    expect(body).toMatch(/object-position\s*:\s*center\s*;/);
  });

  it('.cm-image-button relays height:100% down to the <img> alongside its existing width:100% relay — the actual root cause of the "subject pushed to the bottom edge" Fill-crop bug: without it, this button (and therefore the height:100% <img> inside it) stayed shrink-wrapped to the image\'s own natural height instead of the container\'s real 400px, so object-fit: cover cropped into the wrong box regardless of object-position', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const body = ruleBody(css, /\.cm-editor\s+\.cm-image-button\s*\{([^}]*)\}/);
    expect(body).toMatch(/width\s*:\s*100%\s*;/);
    expect(body).toMatch(/height\s*:\s*100%\s*;/);
  });

  it('Fit and Fill both render a full-width container; the image is always width:100%, and Fit never crops or fixes a height', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const fitImgBody = ruleBody(css, /\.cm-editor\s+\.tok-image\.tok-image--fit\s*\{([^}]*)\}/);
    expect(fitImgBody).toMatch(/width\s*:\s*100%\s*;/);
    expect(fitImgBody).toMatch(/height\s*:\s*auto\s*;/);
    expect(fitImgBody).not.toMatch(/object-fit\s*:/);

    // Fit's own container rule: full-width, same 1px caret-overflow reserve
    // as Fill, but no fixed height and no overflow clipping — the browser
    // derives the box's height entirely from the image's own intrinsic
    // aspect ratio at this width, never a value computed in code.
    const fitContainerBody = ruleBody(css, /\.cm-editor\s+\.cm-image-container--fit\s*\{([^}]*)\}/);
    expect(fitContainerBody).toMatch(/width\s*:\s*calc\(100%\s*-\s*1px\)\s*;/);
    expect(fitContainerBody).not.toMatch(/height\s*:/);
    expect(fitContainerBody).not.toMatch(/overflow\s*:/);
  });

  it('.cm-image-container--fill is a full-width, fixed 400px-tall box (minus the same 1px caret-overflow reserve --broken uses), clipping overflow so object-fit: cover has a real box to crop into', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const body = ruleBody(css, /\.cm-editor\s+\.cm-image-container--fill\s*\{([^}]*)\}/);
    expect(body).toMatch(/width\s*:\s*calc\(100%\s*-\s*1px\)\s*;/);
    expect(body).toMatch(/height\s*:\s*400px\s*;/);
    expect(body).toMatch(/overflow\s*:\s*hidden\s*;/);
  });

  it("alignment (resize milestone) centers/right-aligns the widget container itself via position:relative + translateX, keyed off data-align — never the containing .cm-line's own text-align (raw Markdown must never move)", () => {
    // Supersedes the pre-resize-milestone rule that unconditionally
    // centered every Fit-mode image regardless of any alignment setting —
    // see MarkdownEditor.css's own comment at this rule's location for the
    // disclosed behavior change (a Fit image with no explicit alignment
    // now renders left, matching the locked persistence model's default
    // for every mode, Fit included).
    //
    // Also supersedes an intermediate version of this same rule that used
    // `.cm-line:has(> .cm-image-container[data-align=...])` to set
    // `text-align` on the *line* — that visually aligned the widget but
    // also text-aligned the line's own raw Markdown source once revealed
    // for editing, which is exactly the bug the alignment-UX fix corrects.
    // Alignment must be scoped to the widget container element alone.
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const centerBody = ruleBody(css, /\.cm-editor\s+\.cm-image-container\[data-align='center'\]\s*\{([^}]*)\}/);
    expect(centerBody).toMatch(/left\s*:\s*50%\s*;/);
    expect(centerBody).toMatch(/transform\s*:\s*translateX\(-50%\)\s*;/);

    const rightBody = ruleBody(css, /\.cm-editor\s+\.cm-image-container\[data-align='right'\]\s*\{([^}]*)\}/);
    expect(rightBody).toMatch(/left\s*:\s*100%\s*;/);
    expect(rightBody).toMatch(/transform\s*:\s*translateX\(-100%\)\s*;/);

    // Never text-align the line or the editing surface for media alignment.
    expect(css).not.toMatch(/\.cm-line:has\(>\s*\.cm-image-container\[data-align/);
    expect(css).not.toMatch(/\.cm-line:has\(>\s*\.cm-image-container--fit\)/);

    // `margin-inline: auto` (the old, since-superseded Fit-centering
    // mechanism) must never be reintroduced — alignment is exclusively
    // the `data-align` + `left`/`transform` mechanism above, for every
    // mode, Fit's own full-width container included.
    expect(css).not.toMatch(/margin-inline\s*:\s*auto\s*;/);
  });

  it('there is no Auto mode class anywhere in the stylesheet', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    expect(css).not.toMatch(/tok-image--auto/);
  });
});

/**
 * Standard Markdown Image, local Vault path: `![Alt name](Assets/image.jpg)`.
 * Distinct from `![[Assets/image.jpg]]` (Embed, embedLivePreview.test.ts's
 * own coverage) — same shared `ImageWidget`/`imageUiState`/broken-image/
 * Edit-source/display-mode infrastructure every test above already covers
 * for external-URL standard images, just with `resolveImageSrc` now wired
 * so a local path resolves to a real, loadable file URL instead of being
 * handed to `<img src>` verbatim. Nothing here duplicates infrastructure
 * coverage already established above — only what changes once local-path
 * resolution is wired in.
 */
describe('Standard Markdown image, local Vault path — resolveImageSrc', () => {
  const LOCAL_MD = '![Alt name](Assets/image.jpg)';
  const resolveLocal = resolverFor({
    'Assets/image.jpg': resolvedSrc('app://vault/Assets/image.jpg', 'Assets/image.jpg'),
  });

  it('renders using the existing ImageWidget — real <img> src is the resolved file URL, not the raw Markdown path', () => {
    const view = mountView(`See: ${LOCAL_MD}`, 0, () => {}, () => {}, resolveLocal);

    const container = view.dom.querySelector('.cm-image-container');
    expect(container).not.toBeNull();
    expect(getImg(view)?.getAttribute('src')).toBe('app://vault/Assets/image.jpg');
  });

  it('the Alt text remains the Markdown alt text — never a caption, never overwritten by the resolved resource', () => {
    const view = mountView(LOCAL_MD, 0, () => {}, () => {}, resolveLocal);

    expect(getImg(view)?.getAttribute('alt')).toBe('Alt name');
    // No separate caption element exists anywhere in this construct.
    expect(view.dom.querySelector('[class*="caption"]')).toBeNull();
  });

  it('an unresolved local path (missing/renamed resource) is passed through unchanged — the real <img> attempt fails naturally, same as today, never a pre-guessed broken state', () => {
    const view = mountView(`See: ${LOCAL_MD}`, 0, () => {}, () => {}, resolverFor({}));

    // Not pre-determined broken — a real <img> was attempted with the raw path.
    expect(getImg(view)?.getAttribute('src')).toBe('Assets/image.jpg');
    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();
  });

  it('broken state for an unresolved local path shows "Unable to load" + the exact failed path, e.g. "Unable to load Assets/image.jpg"', () => {
    const view = mountView(LOCAL_MD, 0, () => {}, () => {}, resolverFor({}));
    getImg(view)!.dispatchEvent(new Event('error'));

    const broken = view.dom.querySelector('.cm-image-broken');
    expect(broken?.querySelector('.cm-image-broken__alt')?.textContent).toBe('Unable to load');
    expect(broken?.querySelector('.cm-image-broken__hint')?.textContent).toBe('Assets/image.jpg');
  });

  it('broken state for a resolved-but-unloadable local path shows the raw Markdown path as the hint, not the resolved file URL', () => {
    const view = mountView(LOCAL_MD, 0, () => {}, () => {}, resolveLocal);
    getImg(view)!.dispatchEvent(new Event('error'));

    const broken = view.dom.querySelector('.cm-image-broken');
    expect(broken?.querySelector('.cm-image-broken__hint')?.textContent).toBe('Assets/image.jpg');
  });

  it('external URLs continue to work exactly as before — a resolver that reports every local path unresolved never touches an external URL\'s rendering', () => {
    const view = mountView(`See: ${IMAGE_MD}`, 0, () => {}, () => {}, resolveLocal);

    expect(getImg(view)?.getAttribute('src')).toBe('https://example.com/mountain.jpg');
    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();
  });

  it('does not rewrite the Markdown source — the document text is untouched by resolution', () => {
    const view = mountView(`See: ${LOCAL_MD}`, 0, () => {}, () => {}, resolveLocal);
    expect(view.state.doc.toString()).toBe(`See: ${LOCAL_MD}`);
  });

  function typeAt(view: EditorView, from: number, insert: string): void {
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length } });
  }

  it('while actively editing (first-leave pending), raw Markdown is shown, same as any standard image', () => {
    const view = mountView('', 0, () => {}, () => {}, resolveLocal);
    typeAt(view, 0, LOCAL_MD);

    // Still mid-typing (pendingFirstLeave, caret still engaged) — raw text, no widget yet.
    expect(view.dom.textContent).toContain(LOCAL_MD);
    expect(getImg(view)).toBeNull();
  });

  it('after leaving the syntax, it renders normally (resolved)', () => {
    const view = mountView('', 0, () => {}, () => {}, resolveLocal);
    typeAt(view, 0, LOCAL_MD);
    typeAt(view, view.state.doc.length, ' '); // caret leaves
    settleAllProbes();

    expect(view.dom.textContent).not.toContain(LOCAL_MD);
    expect(getImg(view)?.getAttribute('src')).toBe('app://vault/Assets/image.jpg');
  });

  it('cursor navigation into an at-rest rendered image does not unnecessarily reveal Markdown', () => {
    const view = mountView(`See: ${LOCAL_MD}`, 5, () => {}, () => {}, resolveLocal); // anchor inside the image node
    expect(view.dom.textContent).not.toContain(LOCAL_MD);
    expect(getImg(view)).not.toBeNull();
  });

  it('Edit Source reveals the existing raw Markdown editing state, image stays rendered alongside it', () => {
    const view = mountView(LOCAL_MD, 0, () => {}, () => {}, resolveLocal);
    clickEdit(view);
    settleAllProbes();

    expect(view.dom.textContent).toContain(LOCAL_MD);
    expect(getImg(view)?.getAttribute('src')).toBe('app://vault/Assets/image.jpg');
  });

  it('Fill/Fit apply identically to a resolved local image', () => {
    const view = mountView(LOCAL_MD, 0, () => {}, () => {}, resolveLocal);
    const container = () => view.dom.querySelector('.cm-image-container')!;

    view.dispatch({
      effects: setImageUiState.of({
        pos: 0,
        to: LOCAL_MD.length,
        state: { ...getImageUiState(view.state, 0), displayMode: 'fill' },
      }),
    });
    expect(container().classList.contains('cm-image-container--fill')).toBe(true);

    view.dispatch({
      effects: setImageUiState.of({
        pos: 0,
        to: LOCAL_MD.length,
        state: { ...getImageUiState(view.state, 0), displayMode: 'fit' },
      }),
    });
    expect(container().classList.contains('cm-image-container--fit')).toBe(true);
    expect(container().classList.contains('cm-image-container--fill')).toBe(false);
  });

  it('floating controls open ImageOptionsMenu with the resolved url AND the raw-path copyUrl, so Copy link/Set as cover keep using the Markdown path', () => {
    let received: OpenImageMenuParams | undefined;
    const view = mountView(LOCAL_MD, 0, () => {}, (params) => (received = params), resolveLocal);

    getSizeButton(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(received).toMatchObject({
      alt: 'Alt name',
      url: 'app://vault/Assets/image.jpg',
      copyUrl: 'Assets/image.jpg',
    });
  });

  it('clicking the rendered image opens the existing ImageOverlay dispatch with the resolved url and raw-path copyUrl', () => {
    let clicked: [string, string, string | undefined] | undefined;
    const view = mountView(LOCAL_MD, 0, (url, alt, copyUrl) => (clicked = [url, alt, copyUrl]), () => {}, resolveLocal);

    getImageButton(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicked).toEqual(['app://vault/Assets/image.jpg', 'Alt name', 'Assets/image.jpg']);
  });

  it('undo/redo: deleting and restoring a resolved local image round-trips through the document', () => {
    // Same "See: " prefix imageLivePreview.test.ts's own established
    // Delete/undo/redo coverage uses (Broken image fallback describe,
    // "Delete removes the Markdown image...") — keeps position 0 genuinely
    // outside the Image node both before and after undo re-inserts it, so
    // this doesn't hit imageUiState.ts's own boundary-inclusive engagement
    // check (a caret sitting exactly at a node's own `from` counts as
    // "engaged," which a re-inserted-at-position-0 node's fresh
    // pendingFirstLeave would otherwise keep raw — a test-construction
    // detail, not a product bug).
    const view = mountView(`See: ${LOCAL_MD}`, 0, () => {}, () => {}, resolveLocal);
    expect(getImg(view)?.getAttribute('src')).toBe('app://vault/Assets/image.jpg');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    expect(view.state.doc.toString()).toBe('');
    expect(getImg(view)).toBeNull();

    undo(view);
    expect(view.state.doc.toString()).toBe(`See: ${LOCAL_MD}`);
    // Re-inserting is itself an edit touching the node, so — same as the
    // existing Delete/undo/redo coverage documents for the broken state —
    // this asserts a rendered occurrence exists, not that it's necessarily
    // still resolved-and-working on the very first frame back.
    expect(view.dom.querySelector('.cm-image-container')).not.toBeNull();

    redo(view);
    expect(view.state.doc.toString()).toBe('');
  });

  it('the broken-image recovery probe re-resolves through resolveImageSrc, not the raw Markdown text — a resolved local image\'s probe uses the resolved URL', () => {
    const view = mountView(LOCAL_MD, 0, () => {}, () => {}, resolveLocal);
    getImg(view)!.dispatchEvent(new Event('error'));
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();

    const probe = latestProbe();
    // The probe itself attempts the resolved file URL (what a real retry
    // needs), never the raw vault-relative path.
    expect(probe.src).toBe('app://vault/Assets/image.jpg');

    probe.dispatchEvent(new Event('load'));
    settleAllProbes();

    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();
    expect(getImg(view)?.getAttribute('src')).toBe('app://vault/Assets/image.jpg');
  });

  it('no resolveImageSrc supplied at all (prop omitted) behaves exactly like today — a local path is passed through raw', () => {
    const view = mountView(`See: ${LOCAL_MD}`);
    expect(getImg(view)?.getAttribute('src')).toBe('Assets/image.jpg');
  });
});

/**
 * `![Testing](Delete me.jpg)` — a local Vault path containing a literal,
 * unencoded space. Root cause was one layer above `scanImage()`: native
 * `@lezer/markdown` breaks its own destination scan at the first raw
 * whitespace (CommonMark spec, confirmed directly against `parseURL`'s own
 * source), so `Image:0-10 "![Testing]"` was the entire node — the rest was
 * left as plain surrounding text, never reaching `scanImage()` at all.
 * `imageSyntax.ts`'s `imageSpacedDestinationSyntax` (wired into
 * `markdownGrammarExtensions.ts`, so exercised here through the real
 * `markdownLanguageExtension()` this file's own `mountView` already uses)
 * fixes this at the parser layer — activating only for the one destination
 * shape native parsing rejects outright, deferring to native for every
 * other case (titles, angle-bracket/percent-encoded destinations,
 * reference-style links, `![[...]]` Embeds — all covered by
 * `embedSyntax.test.ts`'s own suite, confirmed unaffected).
 */
describe('Standard Markdown image, local Vault path with a raw space — imageSpacedDestinationSyntax + scanImage', () => {
  const SPACED_MD = '![Testing](Delete me.jpg)';
  const NESTED_SPACED_MD = '![Testing](Assets/My Photos/Delete me.jpg)';
  const resolveSpaced = resolverFor({
    'Delete me.jpg': resolvedSrc('app://vault/Delete%20me.jpg', 'Delete me.jpg'),
    'Assets/My Photos/Delete me.jpg': resolvedSrc(
      'app://vault/Assets/My%20Photos/Delete%20me.jpg',
      'Assets/My Photos/Delete me.jpg'
    ),
  });

  it('resolves and renders a local path containing a space — the canonical Markdown is untouched, never rewritten/encoded', () => {
    const view = mountView(SPACED_MD, 0, () => {}, () => {}, resolveSpaced);

    expect(view.state.doc.toString()).toBe(SPACED_MD);
    expect(getImg(view)?.getAttribute('src')).toBe('app://vault/Delete%20me.jpg');
    expect(getImg(view)?.getAttribute('alt')).toBe('Testing');
  });

  it('resolves a nested local path containing a space, if supported by the existing resource model — same resolveResourceEmbed lookup as every other local path', () => {
    const view = mountView(NESTED_SPACED_MD, 0, () => {}, () => {}, resolveSpaced);

    expect(getImg(view)?.getAttribute('src')).toBe('app://vault/Assets/My%20Photos/Delete%20me.jpg');
  });

  it('external URL behavior is unchanged — a destination with no raw space still goes through native Image parsing untouched', () => {
    const view = mountView(`See: ${IMAGE_MD}`, 0, () => {}, () => {}, resolveSpaced);

    expect(getImg(view)?.getAttribute('src')).toBe('https://example.com/mountain.jpg');
    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();
  });

  it('an unresolved local path with a space produces the existing broken state — "Unable to load" + the exact raw path, spaces included', () => {
    const view = mountView(SPACED_MD, 0, () => {}, () => {}, resolverFor({}));
    getImg(view)!.dispatchEvent(new Event('error'));

    const broken = view.dom.querySelector('.cm-image-broken');
    expect(broken?.querySelector('.cm-image-broken__alt')?.textContent).toBe('Unable to load');
    expect(broken?.querySelector('.cm-image-broken__hint')?.textContent).toBe('Delete me.jpg');
  });

  it('raw Markdown editing still works — while actively typing, the space-containing destination shows as plain editable text, same first-leave lifecycle as any standard image', () => {
    function typeAt(view: EditorView, from: number, insert: string): void {
      view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length } });
    }

    const view = mountView('', 0, () => {}, () => {}, resolveSpaced);
    typeAt(view, 0, SPACED_MD);

    expect(view.dom.textContent).toContain(SPACED_MD);
    expect(getImg(view)).toBeNull();

    typeAt(view, view.state.doc.length, ' '); // caret leaves
    settleAllProbes();
    expect(view.dom.textContent).not.toContain(SPACED_MD);
    expect(getImg(view)?.getAttribute('src')).toBe('app://vault/Delete%20me.jpg');
  });

  it('Edit Source still reveals the exact raw Markdown, space included', () => {
    const view = mountView(SPACED_MD, 0, () => {}, () => {}, resolveSpaced);
    clickEdit(view);
    settleAllProbes();

    expect(view.dom.textContent).toContain(SPACED_MD);
    expect(getImg(view)?.getAttribute('src')).toBe('app://vault/Delete%20me.jpg');
  });

  it('ImageOverlay still works — clicking dispatches the resolved url and the raw, space-containing path as copyUrl', () => {
    let clicked: [string, string, string | undefined] | undefined;
    const view = mountView(
      SPACED_MD,
      0,
      (url, alt, copyUrl) => (clicked = [url, alt, copyUrl]),
      () => {},
      resolveSpaced
    );

    getImageButton(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicked).toEqual(['app://vault/Delete%20me.jpg', 'Testing', 'Delete me.jpg']);
  });

  it('existing Fill/Fit behavior remains unchanged for a space-containing local image', () => {
    const view = mountView(SPACED_MD, 0, () => {}, () => {}, resolveSpaced);
    const container = () => view.dom.querySelector('.cm-image-container')!;

    view.dispatch({
      effects: setImageUiState.of({
        pos: 0,
        to: SPACED_MD.length,
        state: { ...getImageUiState(view.state, 0), displayMode: 'fill' },
      }),
    });
    expect(container().classList.contains('cm-image-container--fill')).toBe(true);

    view.dispatch({
      effects: setImageUiState.of({
        pos: 0,
        to: SPACED_MD.length,
        state: { ...getImageUiState(view.state, 0), displayMode: 'fit' },
      }),
    });
    expect(container().classList.contains('cm-image-container--fit')).toBe(true);
    expect(container().classList.contains('cm-image-container--fill')).toBe(false);
  });

  it('a genuine title after a space-free destination still works — native title parsing is untouched by the space-tolerant fallback', () => {
    const view = mountView('![Alt](https://example.com/image.png "A title")');

    expect(getImg(view)?.getAttribute('src')).toBe('https://example.com/image.png');
    expect(getImg(view)?.getAttribute('alt')).toBe('Alt');
  });

  it('![[...]] Embed syntax with a space in its path is unaffected by this fix — still its own distinct construct, never routed through Image', () => {
    const view = mountView('![[Delete me.jpg]]');

    // Embed has no resolver wired in this file's mountView at all — the
    // point here is only that this doesn't crash or get misparsed as a
    // (broken) standard Image; embedLivePreview.test.ts owns Embed's own
    // full resolution/rendering coverage.
    expect(view.dom.textContent).toContain('![[Delete me.jpg]]');
  });
});
