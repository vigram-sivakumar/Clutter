// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, redo, undo } from '@codemirror/commands';
import { acceptCompletion, autocompletion, completionStatus } from '@codemirror/autocomplete';

import { markdownLanguageExtension } from '../markdownLanguage';
import { embedLivePreview } from './embedLivePreview';
import { embedCompletionSource } from './embedCompletionSource';
import { embedAutocomplete } from './embedAutocomplete';
import type { OnImageClick, OnOpenImageMenu, OpenImageMenuParams } from '../image/ImageWidget';
import type { EmbedImageResolution, ResolveEmbedImage } from './embedImageResolution';
import type { GetEmbedSuggestions } from './embedSuggestion';

/**
 * Same capturing-probe technique imageLivePreview.test.ts already
 * established, reused verbatim: jsdom never fires real load/error events
 * for a detached `new Image()` on its own, so tests need to reach in and
 * fire them directly.
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

/**
 * `anchor` defaults to 0 — every fixture in this file that cares about
 * "at rest" rendering wraps its embed as `x ${EMBED} y`-shaped text (or
 * places the embed after leading text), so position 0 is always safely
 * outside any embed's own `[from, to)` range, mirroring
 * imageLivePreview.test.ts's identical `anchor = 0` default for the same
 * reason. Tests that specifically exercise engagement pass an explicit
 * `anchor` inside the embed's range instead.
 */
function mountView(
  doc: string,
  resolveEmbedImage: ResolveEmbedImage,
  anchor = 0,
  onImageClick: OnImageClick = () => {},
  onOpenImageMenu: OnOpenImageMenu = () => {}
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      history(),
      markdownLanguageExtension(),
      embedLivePreview(() => resolveEmbedImage, () => onImageClick, () => onOpenImageMenu, () => undefined, () => undefined),
    ],
  });
  const view = new EditorView({ state, parent });
  // ImageWidget.renderWorking() (2026-09 native-broken-icon fix, shared by
  // Embed image rendering too) probes before ever mounting a real `<img>`
  // — see imageLivePreview.test.ts's own `mountView` doc comment for the
  // full rationale. Auto-resolving here keeps every test that just wants
  // "a rendered, working image" working exactly as before that fix.
  for (const probe of capturedProbes) {
    probe.dispatchEvent(new Event('load'));
  }
  return view;
}

/** Mounts the full stack (live preview + completion + reactivation listeners) — for Flow A/B/C interaction tests, where autocomplete behavior itself is under test, not only rendering. */
function mountFullView(
  doc: string,
  resolveEmbedImage: ResolveEmbedImage,
  getEmbedSuggestions: GetEmbedSuggestions,
  anchor = 0
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      history(),
      markdownLanguageExtension(),
      autocompletion({ override: [embedCompletionSource(() => getEmbedSuggestions)] }),
      embedAutocomplete(),
      embedLivePreview(() => resolveEmbedImage, () => undefined, () => undefined, () => undefined, () => undefined),
    ],
  });
  return new EditorView({ state, parent });
}

/**
 * Resolves every probe captured so far to 'load', in creation order — see
 * imageLivePreview.test.ts's own identical helper doc comment (2026-09
 * native-broken-icon fix: `ImageWidget.renderWorking()` now probes before
 * ever mounting a real `<img>`, so any action that reconstructs a widget —
 * Edit-source toggle, undo/redo, a sibling embed's own broken transition —
 * needs settling before asserting the resulting rendered state). Safe to
 * call repeatedly.
 */
function settleAllProbes(): void {
  for (const probe of capturedProbes) {
    probe.dispatchEvent(new Event('load'));
  }
}

function getImg(view: EditorView): HTMLImageElement | null {
  return view.dom.querySelector('img.tok-image');
}

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

function getSizeButton(view: EditorView): HTMLButtonElement {
  const button = view.dom.querySelector<HTMLButtonElement>('.cm-image-control[aria-label="Image size options"]');
  if (!button) {
    throw new Error('size button not found');
  }
  return button;
}

/** A resolver reporting a fixed, resolved-image outcome for `path`, unresolved/non-image for anything else — mirrors what createEmbedImageResolver would produce for a single-resource fixture. */
function resolverFor(entries: Record<string, EmbedImageResolution>): ResolveEmbedImage {
  return (path) => entries[path] ?? { status: 'unresolved', alt: path };
}

function imageResolution(url: string, copyUrl: string, alt: string): EmbedImageResolution {
  return { status: 'image', url, copyUrl, alt };
}

const HERO = '![[hero.png]]';

describe('embedLivePreview — rendering (cursor already outside — "at rest")', () => {
  it('renders a resolved root-level image resource', () => {
    const view = mountView(
      `x ${HERO}`,
      resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') })
    );

    const img = getImg(view);
    expect(img).not.toBeNull();
    expect(img!.src).toBe('app://vault/hero.png');
    expect(img!.alt).toBe('hero.png');
  });

  it('renders a resolved nested image resource', () => {
    const view = mountView(
      'x ![[Projects/A/hero.png]]',
      resolverFor({
        'Projects/A/hero.png': imageResolution('app://vault/Projects/A/hero.png', 'Projects/A/hero.png', 'hero.png'),
      })
    );

    expect(getImg(view)?.src).toBe('app://vault/Projects/A/hero.png');
  });

  it('renders a resolved resource inside the managed Assets/ folder', () => {
    const view = mountView(
      'x ![[Assets/hero.png]]',
      resolverFor({
        'Assets/hero.png': imageResolution('app://vault/Assets/hero.png', 'Assets/hero.png', 'hero.png'),
      })
    );

    expect(getImg(view)?.src).toBe('app://vault/Assets/hero.png');
  });

  it('a non-image resource (pdf) is left as plain, undecorated Markdown text — no image renderer used', () => {
    const view = mountView('x ![[spec.pdf]]', resolverFor({ 'spec.pdf': { status: 'non-image' } }));

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container')).toBeNull();
    expect(view.dom.textContent).toContain('![[spec.pdf]]');
  });

  it('a missing/unresolved (but non-empty) resource renders the broken-resource state, never a real <img> load attempt', () => {
    const view = mountView('x ![[missing.png]]', resolverFor({}));

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();
  });

  it('an invalid image URL/load failure for an otherwise-resolved resource renders the custom broken state, via the exact same ImageWidget onerror mechanism standard images already use', () => {
    const view = mountView(
      `x ${HERO}`,
      resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') })
    );
    expect(getImg(view)).not.toBeNull();

    getImg(view)!.dispatchEvent(new Event('error'));

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();
  });

  it('incomplete syntax (![[hero, no closing ]]) remains editable Markdown text — no Embed node, no widget', () => {
    const view = mountView('x ![[hero', resolverFor({}));

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container')).toBeNull();
    expect(view.dom.textContent).toContain('![[hero');
  });

  it('no resolver injected at all: renders nothing, leaves raw Markdown untouched', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc: `x ${HERO}`,
      extensions: [markdownLanguageExtension(), embedLivePreview(() => undefined, () => undefined, () => undefined, () => undefined, () => undefined)],
    });
    const view = new EditorView({ state, parent });

    expect(getImg(view)).toBeNull();
    expect(view.dom.textContent).toContain(HERO);
  });
});

describe('embedLivePreview — empty/incomplete targets never render, in any state, forever (universal rule)', () => {
  it('![[]] (fully empty) never shows a broken widget, cursor outside', () => {
    const view = mountView('x ![[]]', resolverFor({}));

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container')).toBeNull();
    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();
    expect(view.dom.textContent).toContain('![[]]');
  });

  it('![[ ]] (whitespace-only) never shows a broken widget either', () => {
    const view = mountView('x ![[ ]]', resolverFor({}));

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container')).toBeNull();
  });

  it('a resolver that would (incorrectly) treat empty as a real path is never even asked — the empty check short-circuits before resolution', () => {
    const resolveEmbedImage = vi.fn(() => ({ status: 'unresolved' as const, alt: '' }));
    mountView('x ![[]]', resolveEmbedImage);

    expect(resolveEmbedImage).not.toHaveBeenCalled();
  });

  it('leaving the cursor (moving away) does not cause an empty embed to render — stays literal forever, not merely "while engaged"', () => {
    const view = mountView('x ![[]] y', resolverFor({}), 5); // cursor inside the empty target
    expect(getImg(view)).toBeNull();

    view.dispatch({ selection: { anchor: 0 } }); // cursor moves fully away

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container')).toBeNull();
    expect(view.dom.textContent).toContain('![[]]');
  });
});

describe('embedLivePreview — first-leave rendering lifecycle (Flow A/B/C style: stay raw while engaged, render once the cursor leaves)', () => {
  // Phase 2 (2026-09 rendering-lifecycle unification): "freshly created"
  // (`pendingFirstLeave`) is detected from a real `docChanged` transaction
  // — mounting a view directly via `EditorState.create` with the embed
  // already present (as `mountView` does) never fires that detection, so
  // these tests dispatch a real insertion first, exactly the way a user's
  // own keystroke/paste would, mirroring `imageLivePreview.test.ts`'s own
  // "Phase 2" test's same real-transaction methodology.
  //
  // The explicit `selection` is load-bearing, not decoration: CM6's
  // *default* selection mapping (`EditorSelection.map`'s own `assoc: -1`)
  // does not advance the caret through an insertion made exactly at (or
  // after) the caret's own old position — confirmed directly, the hard
  // way, when an earlier version of these tests omitted it and produced
  // results that only made sense once traced back to the caret silently
  // never having moved from position 0. A real keystroke always ends with
  // the caret after what was typed.
  function mountAndType(resolveEmbedImage: ResolveEmbedImage, prefix: string, suffix: string): EditorView {
    const view = mountView(`${prefix}${suffix}`, resolveEmbedImage, 0);
    view.dispatch({
      changes: { from: prefix.length, insert: HERO },
      selection: { anchor: prefix.length + HERO.length },
    });
    return view;
  }

  it('a freshly-completed, still-engaged embed (cursor at its own end, as typing/completion leaves it) does not render yet — no widget, no broken state', () => {
    const view = mountAndType(resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') }), '', '');

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container')).toBeNull();
    expect(view.dom.textContent).toContain(HERO);
  });

  it('a still-engaged embed that would resolve to broken also does not render the broken state yet — "do not show a broken state while editing is active"', () => {
    const view = mountAndType(resolverFor({}), '', '');

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container--broken')).toBeNull();
  });

  it('cursor strictly inside the target (mid-typing) also stays raw, not only at the exact boundary', () => {
    const view = mountAndType(resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') }), '', '');
    view.dispatch({ selection: { anchor: 6 } }); // still inside the just-typed embed's own range

    expect(getImg(view)).toBeNull();
  });

  it('moving the cursor away from a freshly-completed embed for the first time transitions it to the rendered image', () => {
    const view = mountAndType(
      resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') }),
      '',
      ' x'
    );
    expect(getImg(view)).toBeNull();

    view.dispatch({ selection: { anchor: HERO.length + 2 } }); // past the trailing " x"
    settleAllProbes();

    expect(getImg(view)?.src).toBe('app://vault/hero.png');
  });

  it('moving the cursor away from a freshly-completed, genuinely-nonexistent embed for the first time transitions it to the broken state — this is the expected, accepted outcome for a complete-but-nonexistent target (distinct from empty syntax, which never renders)', () => {
    const view = mountAndType(resolverFor({}), '', ' x');
    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container--broken')).toBeNull();

    view.dispatch({ selection: { anchor: HERO.length + 2 } });

    expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();
  });

  it('Phase 2: once an embed has settled (rendered once), merely navigating back into it does NOT hide the rendered widget again — navigation is not editing', () => {
    const view = mountAndType(
      resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') }),
      'x ',
      ' y'
    );
    // Leave once — this is what "settles" it (pendingFirstLeave -> false).
    view.dispatch({ selection: { anchor: 0 } });
    settleAllProbes();
    expect(getImg(view)).not.toBeNull();

    // Navigate back inside via a pure selection change (click/arrow-key
    // equivalent) — must NOT revert to raw, matching the same rule
    // WikiLink/standard images now follow.
    view.dispatch({ selection: { anchor: 'x '.length + 6 } });

    expect(getImg(view)).not.toBeNull();
  });
});

describe('embedLivePreview — Edit source still works exactly like standard images (ui.revealed overrides plain engagement)', () => {
  const resolve = resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') });

  it('Edit reveals the raw Embed source above the still-rendered image, caret at the end', () => {
    const view = mountView(`x ${HERO}`, resolve);

    clickEdit(view);
    settleAllProbes();

    expect(view.dom.textContent).toContain(HERO);
    expect(getImg(view)).not.toBeNull(); // both representations coexist, per the shared ImageWidget contract
    const sel = view.state.selection.main;
    expect(sel.empty).toBe(true);
    expect(sel.from).toBe(`x ${HERO}`.length);
  });

  it('while editing, the revealed source is ordinary document text — clicking it does not open the image overlay or navigate', () => {
    const onImageClick = vi.fn();
    const view = mountView(`x ${HERO}`, resolve, 0, onImageClick);

    clickEdit(view);
    view.dom.querySelector('.cm-line')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onImageClick).not.toHaveBeenCalled();
  });

  it('moving the caret outside the embed line hides the source again, restoring the rendered image', () => {
    const view = mountView(`Before\n${HERO}\nAfter`, resolve, 0); // starts outside — rendered at rest
    clickEdit(view);
    expect(view.dom.textContent).toContain(HERO);

    const afterLineStart = view.state.doc.toString().indexOf('After');
    view.dispatch({ selection: { anchor: afterLineStart } });
    settleAllProbes();

    expect(view.dom.textContent).not.toContain(HERO);
    expect(getImg(view)).not.toBeNull();
  });
});

describe('embedLivePreview — delete', () => {
  it("opening the size menu for a resolved embed reports the exact node pos/to computeImageDeletionRange (MarkdownEditor.tsx's own handleDeleteImage) needs — Delete for a working embed is MarkdownEditor-level wiring shared unchanged with standard images, not this plugin's own concern", () => {
    let captured: OpenImageMenuParams | null = null;
    const view = mountView(
      `See: ${HERO}`,
      resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') }),
      0,
      () => {},
      (params) => {
        captured = params;
      }
    );

    getSizeButton(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(captured).not.toBeNull();
    expect(view.state.sliceDoc(captured!.pos, captured!.to)).toBe(HERO);
  });

  it('deleting a broken (unresolved) embed removes only the Markdown, never touches any resource — no VaultResource exists to touch, by construction', () => {
    const view = mountView(`See: ![[missing.png]]`, resolverFor({}));
    const deleteButton = view.dom.querySelector<HTMLButtonElement>('.cm-image-control[aria-label="Delete image"]');
    expect(deleteButton).not.toBeNull();

    deleteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.state.doc.toString()).toBe('');
  });

  it('undo restores a deleted broken embed, redo removes it again', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = 'See: ![[missing.png]]';
    const state = EditorState.create({
      doc,
      extensions: [history(), markdownLanguageExtension(), embedLivePreview(() => resolverFor({}), () => undefined, () => undefined, () => undefined, () => undefined)],
    });
    const view = new EditorView({ state, parent });

    const deleteButton = view.dom.querySelector<HTMLButtonElement>('.cm-image-control[aria-label="Delete image"]')!;
    deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(view.state.doc.toString()).toBe('');

    undo(view);
    expect(view.state.doc.toString()).toBe(doc);

    redo(view);
    expect(view.state.doc.toString()).toBe('');
  });
});

describe('embedLivePreview — controls: copyUrl threading', () => {
  it("Copy link/Set-as-cover receive the vault-relative embed path (copyUrl), never the resolved app:// URL", () => {
    let captured: OpenImageMenuParams | null = null;
    const view = mountView(
      'x ![[Projects/A/hero.png]]',
      resolverFor({
        'Projects/A/hero.png': imageResolution('app://vault/Projects/A/hero.png', 'Projects/A/hero.png', 'hero.png'),
      }),
      0,
      () => {},
      (params) => {
        captured = params;
      }
    );

    getSizeButton(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('app://vault/Projects/A/hero.png');
    expect(captured!.copyUrl).toBe('Projects/A/hero.png');
  });

  it('a standard Markdown image (imageLivePreview.ts) never sets copyUrl — undefined, not a duplicate of url', async () => {
    const { imageLivePreview } = await import('../image/imageLivePreview');
    let captured: OpenImageMenuParams | null = null;
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc: '![alt](https://example.com/a.png)',
      extensions: [
        markdownLanguageExtension(),
        imageLivePreview(
          () => () => {},
          () => (params: OpenImageMenuParams) => {
            captured = params;
          }
        ),
      ],
    });
    const view = new EditorView({ state, parent });
    const sizeButton = view.dom.querySelector<HTMLButtonElement>('.cm-image-control[aria-label="Image size options"]')!;

    sizeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(captured).not.toBeNull();
    expect(captured!.copyUrl).toBeUndefined();
  });

  it("clicking the image (opening ImageOverlay) also receives copyUrl as its own image-click callback's third argument — what ImageOverlay's own resource resolution resolves against", () => {
    const calls: Array<[string, string, string | undefined]> = [];
    const view = mountView(
      'x ![[Projects/A/hero.png]]',
      resolverFor({
        'Projects/A/hero.png': imageResolution('app://vault/Projects/A/hero.png', 'Projects/A/hero.png', 'hero.png'),
      }),
      0,
      (url, alt, copyUrl) => calls.push([url, alt, copyUrl])
    );

    const button = view.dom.querySelector<HTMLButtonElement>('button.cm-image-button')!;
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(calls).toEqual([
      ['app://vault/Projects/A/hero.png', 'hero.png', 'Projects/A/hero.png'],
    ]);
  });
});

describe('embedLivePreview — consecutive embeds are independent', () => {
  // "x " / "y " prefixes give each embed a real, unclaimed neighboring
  // position for the shared default anchor=0 to land on — two embeds with
  // literally nothing but a single "\n" between them have no position
  // that isn't "engaged" with one or the other (both boundaries are
  // inclusive), which is a real, separate, already-known edge case
  // (imageLivePreview.test.ts's own "Adjacent images with no separator"
  // coverage), not something this test suite needs to re-prove.
  it('two valid embeds on separate lines render independently, no whitespace inserted', () => {
    const view = mountView(
      'x ![[one.png]]\ny ![[two.png]]',
      resolverFor({
        'one.png': imageResolution('app://vault/one.png', 'one.png', 'one.png'),
        'two.png': imageResolution('app://vault/two.png', 'two.png', 'two.png'),
      })
    );

    const imgs = [...view.dom.querySelectorAll('img.tok-image')] as HTMLImageElement[];
    expect(imgs).toHaveLength(2);
    expect(imgs.map((img) => img.src).sort()).toEqual(['app://vault/one.png', 'app://vault/two.png']);
    expect(view.state.doc.toString()).toBe('x ![[one.png]]\ny ![[two.png]]');
  });

  it('a valid embed followed by a missing one on the next line: the first renders working, the second renders broken, independently', () => {
    const view = mountView(
      'x ![[valid.png]]\ny ![[missing.png]]',
      resolverFor({ 'valid.png': imageResolution('app://vault/valid.png', 'valid.png', 'valid.png') })
    );

    expect(view.dom.querySelectorAll('img.tok-image')).toHaveLength(1);
    expect(view.dom.querySelectorAll('.cm-image-container--broken')).toHaveLength(1);
  });

  it('deleting one embed does not affect its neighbor', () => {
    const view = mountView(
      'x ![[one.png]]\ny ![[two.png]]',
      resolverFor({
        'one.png': imageResolution('app://vault/one.png', 'one.png', 'one.png'),
        'two.png': imageResolution('app://vault/two.png', 'two.png', 'two.png'),
      })
    );

    view.dispatch({ changes: { from: 0, to: 'x ![[one.png]]\n'.length, insert: '' } });
    settleAllProbes();

    expect(view.state.doc.toString()).toBe('y ![[two.png]]');
    expect(getImg(view)?.src).toBe('app://vault/two.png');
  });

  it('Phase 2: two consecutive embeds (no separator) are independent through the first-leave lifecycle', () => {
    const ONE = '![[one.png]]';
    const TWO = '![[two.png]]';
    const resolve = resolverFor({
      'one.png': imageResolution('app://vault/one.png', 'one.png', 'one.png'),
      'two.png': imageResolution('app://vault/two.png', 'two.png', 'two.png'),
    });
    const view = mountView('', resolve, 0);

    // Type both embeds back to back, caret tracking each insertion's own
    // end explicitly — CM6's default selection mapping does not advance
    // the caret through an insertion made at/after its own old position,
    // so this is load-bearing, not decoration (see imageLivePreview.test.ts's
    // identical note on its own equivalent helper).
    view.dispatch({ changes: { from: 0, insert: ONE }, selection: { anchor: ONE.length } });
    expect(getImg(view)).toBeNull();

    view.dispatch({ changes: { from: ONE.length, insert: TWO }, selection: { anchor: ONE.length + TWO.length } });
    settleAllProbes();

    // #1's caret moved past its own boundary as a direct consequence of
    // typing #2 right after it — its own first leave, independent of #2.
    // #2's own caret is still at its own end — still pending.
    const images = view.dom.querySelectorAll<HTMLImageElement>('img.tok-image');
    expect(images.length).toBe(1);
    expect(images[0]!.src).toBe('app://vault/one.png');
    expect(view.dom.textContent).toContain(TWO);

    // Leave #2 as well.
    view.dispatch({
      changes: { from: view.state.doc.length, insert: ' ' },
      selection: { anchor: view.state.doc.length + 1 },
    });
    settleAllProbes();
    const bothImages = view.dom.querySelectorAll<HTMLImageElement>('img.tok-image');
    expect(bothImages.length).toBe(2);
    expect(bothImages[0]!.src).toBe('app://vault/one.png');
    expect(bothImages[1]!.src).toBe('app://vault/two.png');

    // Navigating back into either already-rendered embed must not reveal
    // raw Markdown for it — navigation is not editing.
    view.dispatch({ selection: { anchor: 3 } }); // inside "one.png"
    expect(view.dom.querySelectorAll('img.tok-image').length).toBe(2);
    view.dispatch({ selection: { anchor: ONE.length + 3 } }); // inside "two.png"
    expect(view.dom.querySelectorAll('img.tok-image').length).toBe(2);
  });
});

describe('embedLivePreview — lifecycle (Resource Sync/Reconciliation implications)', () => {
  it('renamed/moved resource: the same embed text that used to resolve now resolves to unresolved on the next rebuild', () => {
    let resolve: ResolveEmbedImage = resolverFor({
      'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png'),
    });
    const view = mountView(`x ${HERO}`, (path, alias) => resolve(path, alias));
    expect(getImg(view)).not.toBeNull();

    // The resource was renamed/moved externally — a real ResolveEmbedImage
    // (createEmbedImageResolver) would now report 'unresolved' for this
    // exact path the instant Vault reflects the rename (already guaranteed
    // by the Resource Sync/Reconciliation milestone). Simulated here by
    // swapping the injected resolver, then forcing a rebuild the same way
    // any document edit already would.
    resolve = resolverFor({});
    view.dispatch({ selection: { anchor: 0 } }); // any transaction triggers buildDecorations to re-run

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();
  });

  it('deleted resource: an embed pointing at it becomes unresolved on the next rebuild', () => {
    let resolve: ResolveEmbedImage = resolverFor({
      'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png'),
    });
    const view = mountView(`x ${HERO}`, (path, alias) => resolve(path, alias));
    expect(getImg(view)).not.toBeNull();

    resolve = resolverFor({});
    view.dispatch({ selection: { anchor: 0 } });

    expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();
  });

  it('restored resource: an embed resolves again once its exact original path is valid again', () => {
    let resolve: ResolveEmbedImage = resolverFor({});
    const view = mountView(`x ${HERO}`, (path, alias) => resolve(path, alias));
    expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();

    resolve = resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') });
    view.dispatch({ selection: { anchor: 0 } });
    settleAllProbes();

    expect(getImg(view)?.src).toBe('app://vault/hero.png');
  });
});

describe('embedLivePreview — Flow A: new Embed (type ![[, select, leave)', () => {
  it('typing ![[ opens autocomplete, raw Markdown stays visible, no widget of any kind', () => {
    const getEmbedSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' },
    ];
    // A real insert transaction (simulating actual typing), not a
    // pre-loaded document — CM6's own activateOnTyping heuristic only
    // classifies genuine insertions this way, which is exactly the
    // behavior under test here (embedCompletionSource.test.ts already
    // covers the completion source function's own logic in isolation;
    // this test exists to confirm CM6 actually invokes it for real typing).
    const view = mountFullView('', resolverFor({}), getEmbedSuggestions, 0);
    view.dispatch({
      changes: { from: 0, insert: '![[' },
      selection: { anchor: 3 },
      userEvent: 'input.type',
    });

    expect(completionStatus(view.state)).not.toBeNull();
    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container')).toBeNull();
    expect(view.dom.textContent).toContain('![[');
  });

  it('Phase 2: after selecting a suggestion, the embed renders IMMEDIATELY — the selected resource is already known/resolved, so there is nothing to wait for a "first leave" for', async () => {
    const getEmbedSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' },
    ];
    const resolveEmbedImage = resolverFor({
      'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png'),
    });
    const view = mountFullView('', resolveEmbedImage, getEmbedSuggestions, 0);
    view.dispatch({ changes: { from: 0, insert: '![[' }, selection: { anchor: 3 }, userEvent: 'input.type' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(completionStatus(view.state)).toBe('active');
    // `@codemirror/autocomplete` refuses to accept a completion within its
    // own `interactionDelay` (75ms) of becoming active — settle past it.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const accepted = acceptCompletion(view);
    settleAllProbes();
    expect(accepted).toBe(true);

    expect(view.state.doc.toString()).toBe(HERO);
    expect(view.state.selection.main.head).toBe(HERO.length);
    expect(getImg(view)?.src).toBe('app://vault/hero.png');
  });

  it('moving the cursor away from a freshly-typed (not completed) embed still follows the ordinary first-leave rule', () => {
    const resolveEmbedImage = resolverFor({
      'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png'),
    });
    const view = mountView('\nmore', resolveEmbedImage, 0);
    view.dispatch({ changes: { from: 0, insert: HERO }, selection: { anchor: HERO.length } });
    expect(getImg(view)).toBeNull();

    view.dispatch({ selection: { anchor: HERO.length + 1 } }); // next line
    settleAllProbes();

    expect(getImg(view)?.src).toBe('app://vault/hero.png');
  });
});

describe('embedLivePreview — Flow B: empty Embed (![[]] in the document, click inside)', () => {
  it('the empty embed stays literal, no broken image, leaving the cursor does not cause rendering', () => {
    const view = mountView('![[]]', resolverFor({}), 0);
    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();

    view.dispatch({ selection: { anchor: 5 } });

    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();
  });

  it('clicking inside the empty target (![[|]]) opens autocomplete with suggestions, without rendering anything first', () => {
    const getEmbedSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' },
    ];
    const view = mountFullView('![[]]', resolverFor({}), getEmbedSuggestions, 0);
    expect(completionStatus(view.state)).toBeNull();

    view.dispatch({ selection: { anchor: 3 } }); // between "![[" and "]]"

    expect(completionStatus(view.state)).not.toBeNull();
    expect(getImg(view)).toBeNull();
  });
});

describe('embedLivePreview — Flow C: editing an existing Embed (![[image.png]] → edit value)', () => {
  it('moving the cursor into the value does NOT reopen autocomplete — merely entering valid syntax must not, matching WikiLink', () => {
    // Reversal, 2026-09: Embed previously had a deliberately *broader*
    // reactivation rule than WikiLink's ("entering an already-populated
    // reference zone also reopens completion"). That violated the locked
    // product contract ("entering valid syntax must not open autocomplete;
    // only editing it should") and is gone — Embed now shares WikiLink's
    // exact narrower rule via completionLifecycle.ts's
    // `completionReactivation`.
    //
    // Phase 2 addition: mere navigation into an at-rest embed no longer
    // reveals raw source either (`pendingFirstLeave`, `imageUiState.ts`)
    // — an at-rest embed mounted directly (no creating transaction) never
    // had `pendingFirstLeave` set, so it stays rendered regardless of
    // where the cursor is. Both "don't reopen autocomplete" and "don't
    // reveal raw source" are the same underlying rule now: mere
    // navigation into valid syntax is not editing.
    const suggestions = vi.fn((query: string) =>
      query === 'hero.png' ? [{ kind: 'resource' as const, path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' as const }] : []
    );
    const view = mountFullView(
      HERO,
      resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') }),
      suggestions,
      HERO.length // starts at the end (already left once, at rest / rendered)
    );

    // Force a rebuild so the widget actually renders before re-entry (the
    // real interaction: an at-rest, already-rendered embed).
    view.dispatch({ selection: { anchor: 0 } });
    settleAllProbes();
    expect(getImg(view)).not.toBeNull();

    view.dispatch({ selection: { anchor: 5 } }); // inside "hero.png"

    expect(completionStatus(view.state)).toBeNull();
    expect(getImg(view)).not.toBeNull();
  });

  it('editing the value (typing) still reopens/filters autocomplete — only mere cursor entry is excluded', () => {
    const getEmbedSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'hero2.png', title: 'hero2.png', breadcrumb: null, resourceKind: 'image' },
    ];
    const view = mountFullView(
      HERO,
      resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') }),
      getEmbedSuggestions,
      5 // inside "hero.png"
    );
    expect(completionStatus(view.state)).toBeNull();

    view.dispatch({ changes: { from: 5, to: 5, insert: '2' }, selection: { anchor: 6 }, userEvent: 'input.type' });

    expect(completionStatus(view.state)).not.toBeNull();
  });

  it('deleting the value down to ![[|]] keeps the autocomplete available, no broken/invalid renderer appears', () => {
    const getEmbedSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' },
    ];
    const view = mountFullView(
      HERO,
      resolverFor({ 'hero.png': imageResolution('app://vault/hero.png', 'hero.png', 'hero.png') }),
      getEmbedSuggestions,
      11 // right after "hero.png" (i.e. "![[hero.png|]]"), inside the target
    );

    // Delete "hero.png" character by character down to nothing, as a real
    // Backspace sequence would — the exact interaction
    // reactivateOnReferenceDeletion exists for.
    for (let i = 0; i < 'hero.png'.length; i++) {
      const from = view.state.selection.main.head;
      view.dispatch({
        changes: { from: from - 1, to: from, insert: '' },
        selection: { anchor: from - 1 },
        userEvent: 'delete.backward',
      });
    }

    expect(view.state.doc.toString()).toBe('![[]]');
    expect(completionStatus(view.state)).not.toBeNull();
    expect(getImg(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container--broken')).toBeNull();
  });
});
