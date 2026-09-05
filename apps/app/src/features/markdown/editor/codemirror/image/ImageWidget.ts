import { EditorSelection, type EditorState } from '@codemirror/state';
import { WidgetType, type EditorView } from '@codemirror/view';

import { computeImageDeletionRange } from './imageDeletion';
import {
  findEnclosingImageNode,
  getImageUiState,
  setImageUiState,
  type ImageUiState,
} from './imageUiState';
import { scanImage } from './imageScanner';
import {
  applyMediaAlignment,
  applyMediaWidth,
  disconnectMediaWidthObserver,
  flipDimensionTransition,
  measureBox,
  type ResizeObserverHolder,
} from '../mediaPresentation/mediaLayoutStyle';
import type { ImagePresentation } from '../mediaPresentation/mediaPresentationModel';

// Temporary icons only (per this change's own scope) — plain inline SVG
// following TaskCheckboxWidget.ts's exact established convention for
// hand-built icons inside a CodeMirror widget's raw DOM (no React tree
// available here): 16x16 viewBox, `fill="none"`, `stroke="currentColor"`,
// round caps/joins. Not the app's real icon system
// (`shared/icon/iconRegistry.ts`) — that system emits React components,
// which cannot be mounted inside a `WidgetType`'s plain DOM (unlike
// ImageOptionsMenu.tsx's own menu items, which are real React and do use
// AppIcon). To be replaced with real, designed icons later; deliberately
// not polished. SIZE_ICON reuses the same horizontal-double-arrow shape
// as the project's real `widthFill`/`widthHug` icons
// (shared/icon/svg/width-fill.svg) — the closest existing visual
// convention for "this button controls horizontal sizing" — hand-copied
// here rather than imported, since AppIcon's React components can't
// mount in this raw-DOM context either. TRASH_ICON/BROKEN_IMAGE_ICON are
// the exact same paths as `shared/icon/svg/trash.svg`/`broken-image.svg`
// (TRASH_ICON matches the icon `ImageOptionsMenu.tsx`'s own real "Delete"
// item already uses via `AppIcon`; `broken-image.svg` is this project's
// own existing dedicated icon for exactly this state, not borrowed from
// an unrelated construct the way the earlier link-icon placeholder was),
// hand-copied for the same raw-DOM reason.

const EDIT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.625 4L3.64738 9.30947C3.22603 9.7589 2.95326 10.3272 2.86614 10.937L2.64142 12.5101C2.57071 13.005 2.99497 13.4293 3.48995 13.3586L4.95655 13.1491C5.63195 13.0526 6.25428 12.7288 6.7209 12.231L11.625 7M8.625 4L9.79364 2.75345C10.18 2.34132 10.831 2.33098 11.2304 2.73044C11.7865 3.28654 12.2541 3.75413 12.8152 4.31518C13.1968 4.69683 13.2069 5.31263 12.8378 5.70638L11.625 7M8.625 4L11.625 7" stroke="currentColor" stroke-linecap="round"/><path d="M8 13.5H13.5" stroke="currentColor" stroke-linecap="round"/></svg>';

const SIZE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="3.5" cy="8" r="1.25" fill="currentColor"/><circle cx="8" cy="8" r="1.25" fill="currentColor"/><circle cx="12.5" cy="8" r="1.25" fill="currentColor"/></svg>';

const TRASH_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 4L12.1801 12.199C12.0779 13.2214 11.2175 14 10.19 14H5.80998C4.78247 14 3.92214 13.2214 3.8199 12.199L3 4M13 4H14M13 4H10.5M3 4H2M3 4H5.5M10.5 4H5.5M10.5 4C10.5 2.89543 9.60457 2 8.5 2H7.5C6.39543 2 5.5 2.89543 5.5 4" stroke="currentColor" stroke-linecap="round"/></svg>';

const BROKEN_IMAGE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2L14 14" stroke="currentColor" stroke-linecap="round"/><path d="M5 2H11C12.6569 2 14 3.34315 14 5V9.5V11M5 14H11C11.8284 14 12.5783 13.6643 13.1212 13.1215L9.03648 9.05728M5 14L7.2265 10.6603C7.69922 9.95118 8.32842 9.41242 9.03648 9.05728M5 14C3.34315 14 2 12.6569 2 11V5C2 4.18477 2.32517 3.44549 2.8529 2.90478L9.03648 9.05728" stroke="currentColor" stroke-linecap="round"/><path d="M5 7C5.55228 7 6 6.55228 6 6C6 5.44772 5.55228 5 5 5C4.44772 5 4 5.44772 4 6C4 6.55228 4.44772 7 5 7Z" stroke="currentColor" stroke-linecap="round"/></svg>';

/**
 * `copyUrl` mirrors `OpenImageMenuParams.copyUrl` below — present (and a
 * vault-relative path) only for a local Resource embed, `undefined` for a
 * standard Markdown image (whose `url` already *is* the value to resolve
 * against). This is the one piece of information `ImageOverlay` needs to
 * ask "does this image have a `VaultResource` behind it" without this
 * widget/the editor layer ever resolving that question itself — see
 * `MarkdownEditor.tsx`'s own `onImageClickRef` for where `copyUrl ?? url`
 * gets handed to the injected `resolveImageResource`.
 */
export type OnImageClick = (
  url: string,
  alt: string,
  copyUrl?: string
) => void;

export interface OpenImageMenuParams {
  readonly anchor: HTMLElement;
  /** The Image node's own `[from, to)` — `imageDeletion.ts`/the Delete action need both. */
  readonly pos: number;
  readonly to: number;
  /** Already-resolved alt/url — Copy link/Set as cover image use these directly, no re-parsing of the raw source needed. */
  readonly alt: string;
  readonly url: string;
  /**
   * What Copy link/Set as cover image should actually use, when it differs
   * from `url` — added for local Resource embeds (embed/embedLivePreview.ts),
   * whose `url` is a resolved, loadable file URL (what `<img src>` needs)
   * but whose Copy link/Set-as-cover value must stay the vault-relative
   * embed path (`Assets/hero.png`, the same text written between the
   * embed's own `![[...]]` brackets) — never the resolved absolute
   * filesystem URL. `undefined` for a standard Markdown image, where `url`
   * already *is* the vault-relative-or-external value the Markdown itself
   * carries, so there is nothing to distinguish.
   */
  readonly copyUrl?: string;
}
export type OnOpenImageMenu = (params: OpenImageMenuParams) => void;

/**
 * What a probe (`ImageWidget.probeForRecovery`) should treat as "the
 * currently-valid image source at this position," or `null` if none
 * exists any more. Injected via `getCurrentSource` below rather than
 * hardcoded, so `ImageWidget` itself never needs to know whether it's
 * rendering a standard Markdown `![alt](url)` image or a local Resource
 * `![[path]]` embed — `currentImageSource` (below) is the standard-Markdown-
 * Image implementation every existing call site (`imageLivePreview.ts`)
 * already passes; `embedLivePreview.ts` injects a different one that
 * re-resolves through `resolveResourceEmbed()`/an `Embed` node instead,
 * without duplicating any lookup logic here.
 */
export interface CurrentImageSource {
  readonly url: string;
  /** The node's own current `to`, re-resolved fresh — see probeForRecovery's own doc comment for why this must never be the widget's stale, construction-time `to`. */
  readonly to: number;
}

export type GetCurrentImageSource = (state: EditorState, pos: number) => CurrentImageSource | null;

/**
 * The default `GetCurrentImageSource` for a standard Markdown `![alt](url)`
 * image — extracted verbatim from what `probeForRecovery` used to inline
 * directly, so this is the exact same re-verification logic, now shared
 * behind one small seam instead of assumed inside the widget itself.
 */
export function currentImageSource(state: EditorState, pos: number): CurrentImageSource | null {
  const node = findEnclosingImageNode(state, pos);
  if (!node) {
    return null;
  }
  const raw = state.sliceDoc(node.from, node.to);
  const match = scanImage(raw);
  return match ? { url: match.url, to: node.to } : null;
}

/**
 * The rendered form of a native Markdown `![alt](url)` image. Always
 * renders the image (and its controls) regardless of selection — see
 * `imageLivePreview.ts`'s own doc comment for why Image is a deliberate
 * exception to the shared reveal-on-engagement contract, and
 * `imageUiState.ts` for where `revealed`/`displayMode`/`broken` actually
 * live (the options menu's own open/closed state deliberately does *not*
 * live there — see that file's doc comment for why, and `toDOM`'s own
 * `menuOpen`-related comments below for the DOM-mutation mechanism that
 * replaces it).
 *
 * This one widget class serves both of `imageLivePreview.ts`'s decoration
 * shapes: the at-rest `Decoration.replace` (source hidden, this is the
 * only rendered form) and the revealed `Decoration.widget` inserted after
 * the raw source (source visible above, this renders below) — the widget
 * itself doesn't know or care which; both need the exact same rendered
 * content (working *or* broken), which is why there is still only one
 * widget class here, not two.
 *
 * **Edit source (2026-09-02 UX baseline, items 3–4)**: revealing the
 * source (`makeEditButton` below) also places a plain caret — never a
 * range selection — at the Image node's own `to` (the end of its raw
 * Markdown), via the same `dispatch` call that flips `revealed` on, so the
 * two never visibly happen out of order. Auto-hide when the caret later
 * leaves the image's own line is `imageUiStateField.update`'s own
 * responsibility (`imageUiState.ts`), not this widget's — this file only
 * ever turns `revealed` on/off in direct response to the edit button's own
 * click. Identical in both the working and broken states — `makeEditButton`
 * is one shared method precisely so this never needs a second
 * implementation.
 *
 * **Broken/invalid image (2026-09-02 UX baseline, "Broken / Invalid Image
 * UX")**: `toDOM` renders one of two entirely different subtrees depending
 * on `this.ui.broken` (`imageUiState.ts`'s own doc comment covers exactly
 * when/how that flips, and why it's safe to store in CM6 state unlike
 * `menuOpen`). Broken:
 * - Shows a dedicated `.cm-image-broken` representation (broken-image icon
 *   + a static "Unable to load" label + the exact invalid reference — the
 *   vault-relative path or URL that failed) instead of an `<img>` — never
 *   the *native* (browser-drawn) broken-image icon, never the plain
 *   `tok-link`-styled fallback an earlier revision of this file used
 *   (superseded: that version lost the controls entirely, which this UX
 *   explicitly still wants, just
 *   trimmed down).
 * - Controls contain **only** Edit source + Delete — no size button, so no
 *   `OnOpenImageMenu` call is ever wired up for a broken image, and no
 *   size/options menu can ever open for one.
 * - Nothing in the broken representation opens `ImageOverlay` — there is
 *   no `imageButton`/`getOnImageClick()` wiring in this branch at all, not
 *   a guard that happens to suppress it.
 * - Delete is a real, direct action here (unlike the working state, where
 *   Delete only ever lives inside `ImageOptionsMenu`) — computed via the
 *   exact same `computeImageDeletionRange` helper `MarkdownEditor.tsx`'s
 *   own `handleDeleteImage` calls for the working state, dispatched
 *   directly against `view` from this widget. One implementation, two
 *   entry points — never a second deletion-range algorithm.
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly url: string,
    readonly ui: ImageUiState,
    /** The Image node's own `from` — the stable key `imageUiState.ts` uses to address this occurrence, and half of the range `imageDeletion.ts`'s Delete action needs. */
    readonly pos: number,
    /** The Image node's own `to` — the other half of the range Delete needs; also what the revealed-state block widget is anchored after (`imageLivePreview.ts`), and where the caret lands on reveal. */
    readonly to: number,
    /**
     * Stable getters (mirror `ResolveWikiLink`'s own injected-getter
     * shape) — read fresh inside each button's own click listener, never
     * resolved once and baked into this widget. Deliberately excluded
     * from `eq()`, same as `WikiLinkWidget`/`TagWidget` exclude their own
     * injected resolvers — each getter's identity is constant for the
     * extension's whole lifetime (closed over once in
     * `imageLivePreview()`), never a signal that the widget's own
     * rendered content changed.
     */
    readonly getOnImageClick: () => OnImageClick | undefined,
    readonly getOnOpenImageMenu: () => OnOpenImageMenu | undefined,
    /**
     * See `CurrentImageSource`'s own doc comment. Defaults to
     * `currentImageSource` (standard Markdown Image re-verification) so
     * every pre-existing construction site keeps compiling and behaving
     * identically unchanged.
     */
    readonly getCurrentSource: GetCurrentImageSource = currentImageSource,
    /** See `OpenImageMenuParams.copyUrl`'s own doc comment. */
    readonly copyUrl?: string,
    /**
     * Persisted width/alignment (resize milestone) — `mode` is
     * deliberately never read off this for rendering; `this.ui.displayMode`
     * stays the single source of truth for which mode is showing (see
     * `imageUiState.ts`'s own `getImageUiState` doc comment for how that
     * field now seeds itself from this same presentation's `mode` when no
     * ephemeral entry exists yet — this widget never needs to reconcile
     * two different "current mode" values because only one is ever read).
     * Defaulted so every pre-existing construction site (tests included)
     * keeps compiling unchanged.
     */
    readonly presentation: ImagePresentation = { width: 11, alignment: 'left', mode: 'fill' }
  ) {
    super();
    console.log(`[ImageWidget] constructor pos=${this.pos} displayMode=${this.ui.displayMode} presentation.mode=${this.presentation.mode} revealed=${this.ui.revealed}`);
  }

  /**
   * Owns the live pixel-width `ResizeObserver` `applyMediaWidth` creates
   * for a non-default numeric width (`mediaPresentationModel.ts`'s
   * `width` encoding: 1–10 proportional, 11 = default/full, 12+ pixel) —
   * see that function's own doc comment. Applied to the *container*, for
   * both Fill and Fit alike (the custom-width feature is mode-agnostic —
   * only the container's own height/crop behavior differs by mode, per
   * `.cm-image-container--fill`/`--fit` in MarkdownEditor.css). Never a
   * drag/pointer interaction — purely a static value read from the
   * persisted Markdown; the observer here only ever reacts to the
   * *editor's* own column resizing, not a user resize gesture. Disconnected
   * in `destroy()`; a fresh one is created per `toDOM()` call, never
   * shared across widget instances.
   */
  private readonly widthObserver: ResizeObserverHolder = { current: null };

  override eq(other: ImageWidget): boolean {
    return (
      this.alt === other.alt &&
      this.url === other.url &&
      this.copyUrl === other.copyUrl &&
      this.pos === other.pos &&
      this.to === other.to &&
      this.ui.revealed === other.ui.revealed &&
      this.ui.displayMode === other.ui.displayMode &&
      this.ui.broken === other.ui.broken &&
      this.presentation.width === other.presentation.width &&
      this.presentation.alignment === other.presentation.alignment
    );
  }

  /**
   * The CM6 "lightweight DOM update" pattern (`WidgetType.updateDOM`,
   * called on the *new* widget instance with the *old* DOM and the *old*
   * widget instance as `from`) — this is what actually fixes the
   * Fill↔Fit/width/alignment flicker, not `eq()`. `eq()` still correctly
   * returns `false` whenever presentation changes (the render genuinely
   * needs to differ), which is what makes CM6 consider replacing the
   * widget at all; without overriding `updateDOM`, `WidgetType`'s own
   * default (`return false`) would force CM6 straight to
   * `destroy(oldDom)` + a fresh `toDOM()` for every single presentation
   * change — a real DOM teardown/rebuild (a new container, a new
   * `<img>`, a fresh probe-then-mount cycle), which is the actual
   * mechanism behind "the image disappears and then renders again."
   *
   * Handles only the narrow case that's actually safe to patch in place:
   * a working→working update (never a broken transition either
   * direction — `renderBroken`'s own probe/DOM shape is different enough
   * not to worth special-casing) where alt/url/copyUrl/pos/to/`revealed`
   * are all unchanged — i.e. *only* `presentation`/`ui.displayMode`
   * differ. Anything else returns `false`, falling back to the normal,
   * fully-safe rebuild path (still correct, just not fast) — content
   * edits, reveal toggling, and broken/recovery all keep behaving
   * exactly as before this method existed.
   */
  override updateDOM(dom: HTMLElement, view: EditorView, from: ImageWidget): boolean {
    console.log(`[ImageWidget.updateDOM] pos=${this.pos} from.displayMode=${from.ui.displayMode} → this.displayMode=${this.ui.displayMode} from.revealed=${from.ui.revealed} → this.revealed=${this.ui.revealed}`);

    // Deliberately does NOT compare `this.to`/`from.to` — the node's own
    // `to` legitimately shifts on a pure presentation update (`{6}` vs
    // `{620}` vs no pipe segment at all are different text lengths), so
    // requiring equality here would make this method never fire for the
    // exact case it exists to handle. `pos` (`from`, in Lezer's sense —
    // unfortunately named the same as this parameter) never moves for a
    // presentation-only edit, so it stays a safe same-node-identity check
    // on its own. See `makeEditButton`'s own doc comment for how every
    // *other* piece of this DOM that still needs an accurate `to` reads
    // it live off `container.dataset.nodeTo` instead of a captured field,
    // precisely because this method reuses `dom`/`this` are the ones the
    // page keeps, not `from`.
    if (
      this.ui.broken ||
      from.ui.broken ||
      this.alt !== from.alt ||
      this.url !== from.url ||
      this.copyUrl !== from.copyUrl ||
      this.pos !== from.pos ||
      this.ui.revealed !== from.ui.revealed
    ) {
      console.log(`[ImageWidget.updateDOM] returning false - full rebuild needed`);
      return false;
    }

    const container = dom;
    const img = container.querySelector<HTMLImageElement>('img.tok-image');
    if (!img) {
      // Still mid-probe (no confirmed-good <img> mounted yet, per
      // `probeThenMount`'s own doc comment) — nothing safe to patch in
      // place; let the normal rebuild path handle it.
      return false;
    }

    // Keeps every existing control's own live `to` reader
    // (`container.dataset.nodeTo`, set up in `renderWorking`) current —
    // without this, Edit-source/the size button would keep dispatching
    // against the *old*, now-shifted position.
    container.dataset.nodeTo = String(this.to);

    // `from`'s own live-width `ResizeObserver` (if any — only a 12+ pixel
    // width ever creates one) would otherwise leak: `this` is a brand-new
    // instance with its own, currently-empty `widthObserver`, so nothing
    // would ever disconnect `from`'s the way `destroy()` normally would
    // — except `destroy()` is never called here (the DOM, and therefore
    // ownership, transfers to `this` without a teardown).
    disconnectMediaWidthObserver(from.widthObserver);

    // Self-heals a stale inline `height` pin from a *previous* FLIP cycle
    // before measuring anything (2026-09, real bug — confirmed live in
    // WebKit/Tauri's own webview, not reproducible in Chromium or jsdom).
    // `flipDimensionTransition`'s own cleanup (`mediaLayoutStyle.ts`) only
    // ever runs in response to a `transitionend`/`transitioncancel` event
    // — but WebKit does not reliably fire *either* event for this
    // container's own `height` transition specifically (confirmed by
    // directly instrumenting all four transition events live: `<img>`'s
    // own height transition settles and cleans up every time; the
    // *container's* does not, non-deterministically, with no interruption
    // or rapid toggling involved). `width` never showed this symptom only
    // because `applyMediaWidth` (below) unconditionally re-asserts the
    // correct width on every single call regardless of FLIP's own pin
    // state — width is self-healing every call; height had no equivalent,
    // so a single missed cleanup event left it stuck forever: once
    // `container.style.height` holds a stale value, it *is* the box's
    // real rendered height (inline always wins over the class-driven
    // rule, regardless of which class is active), so both this method's
    // own `startContainer`/`endContainer` measurements read that same
    // stale number — `flipDimensionTransition`'s `|from - to| > 0.5`
    // check then sees no change at all and skips the property entirely,
    // perpetuating the stuck value on every subsequent switch too.
    // Removing it *first*, unconditionally, before either measurement,
    // makes this self-correcting regardless of whether any given
    // transition's own end/cancel event ever fires — the same
    // "authoritative value re-applied every call" property `width`
    // already has, now extended to `height`. Never removes a *width*
    // pin (custom pixel widths are meant to stay inline permanently, not
    // just during a transition — clearing it here would be wrong, not
    // merely unnecessary), and never touches the `<img>`'s own height
    // (already confirmed reliable — see above).
    container.style.removeProperty('height');

    // FLIP measurement — capture the *rendered* box before touching any
    // class/style, since that's the only reliable "from" a CSS transition
    // can interpolate against (see `flipDimensionTransition`'s own doc
    // comment for why the raw `auto`/`fit-content`/`100%` keywords
    // involved here never animate on their own).
    const startContainer = measureBox(container);
    const startImg = measureBox(img);

    container.classList.toggle('cm-image-container--fill', this.ui.displayMode === 'fill');
    container.classList.toggle('cm-image-container--fit', this.ui.displayMode === 'fit');
    img.className = `tok-image tok-image--${this.ui.displayMode}`;
    applyMediaAlignment(container, this.presentation.alignment);

    // The persisted width is always applied to the *container*, for
    // either mode — `.tok-image--fill`/`--fit` never receive their own
    // width, so the `<img>` simply fills whatever box the container
    // resolves to. Fit's height still always follows from `height: auto`
    // (never computed here); Fill's stays a fixed 400px regardless of
    // width (`.cm-image-container--fill`'s own CSS). The measuring below
    // gives the genuine target box this produced, never hand-computed.
    applyMediaWidth(container, null, this.presentation.width, view, this.widthObserver);

    const endContainer = measureBox(container);
    const endImg = measureBox(img);

    // DIAGNOSTIC: Log all measurements to diagnose the 800px line height issue
    if (this.ui.displayMode === 'fill') {
      const cmLine = container.closest('.cm-line') as HTMLElement | null;
      const button = container.querySelector<HTMLElement>('.cm-image-button');
      const buffers = container.closest('.cm-line')?.querySelectorAll('.cm-widgetBuffer') ?? [];

      console.log(`\n[ImageWidget.updateDOM] DIAGNOSTIC: Fill mode measurement`);
      console.log(`  displayMode: ${this.ui.displayMode}`);

      if (cmLine) {
        const lineStyles = window.getComputedStyle(cmLine);
        console.log(`\n  .cm-line:`);
        console.log(`    offsetHeight: ${cmLine.offsetHeight}px`);
        console.log(`    scrollHeight: ${cmLine.scrollHeight}px`);
        console.log(`    getBoundingClientRect().height: ${cmLine.getBoundingClientRect().height.toFixed(0)}px`);
        console.log(`    computed height: ${lineStyles.height}`);
        console.log(`    computed min-height: ${lineStyles.minHeight}`);
        console.log(`    computed max-height: ${lineStyles.maxHeight}`);
        console.log(`    computed display: ${lineStyles.display}`);
        console.log(`    computed line-height: ${lineStyles.lineHeight}`);
        console.log(`    children count: ${cmLine.children.length}`);

        // Log each direct child
        let childrenHeightSum = 0;
        for (let i = 0; i < cmLine.children.length; i++) {
          const child = cmLine.children[i] as HTMLElement;
          childrenHeightSum += child.offsetHeight;
          console.log(`      [${i}] ${child.className || child.tagName}: offsetHeight=${child.offsetHeight}px`);
        }
        console.log(`    sum of children: ${childrenHeightSum}px`);
      }

      const containerStyles = window.getComputedStyle(container);
      console.log(`\n  .cm-image-container:`);
      console.log(`    offsetHeight: ${container.offsetHeight}px`);
      console.log(`    scrollHeight: ${container.scrollHeight}px`);
      console.log(`    getBoundingClientRect().height: ${container.getBoundingClientRect().height.toFixed(0)}px`);
      console.log(`    computed height: ${containerStyles.height}`);
      console.log(`    computed min-height: ${containerStyles.minHeight}`);
      console.log(`    computed max-height: ${containerStyles.maxHeight}`);
      console.log(`    computed display: ${containerStyles.display}`);
      console.log(`    computed overflow: ${containerStyles.overflow}`);
      console.log(`    inline style.height: '${container.style.height || '(empty)'}'`);
      console.log(`    inline style.width: '${container.style.width || '(empty)'}'`);
      console.log(`    FLIP startContainer: ${startContainer.width.toFixed(0)}x${startContainer.height.toFixed(0)}px`);
      console.log(`    FLIP endContainer: ${endContainer.width.toFixed(0)}x${endContainer.height.toFixed(0)}px`);

      if (button) {
        const buttonStyles = window.getComputedStyle(button);
        console.log(`\n  .cm-image-button:`);
        console.log(`    offsetHeight: ${button.offsetHeight}px`);
        console.log(`    getBoundingClientRect().height: ${button.getBoundingClientRect().height.toFixed(0)}px`);
        console.log(`    computed height: ${buttonStyles.height}`);
        console.log(`    computed max-height: ${buttonStyles.maxHeight}`);
        console.log(`    computed display: ${buttonStyles.display}`);
        console.log(`    inline style.height: '${(button as HTMLElement).style.height || '(empty)'}'`);
      }

      const imgStyles = window.getComputedStyle(img);
      console.log(`\n  img.tok-image:`);
      console.log(`    offsetHeight: ${img.offsetHeight}px`);
      console.log(`    getBoundingClientRect().height: ${img.getBoundingClientRect().height.toFixed(0)}px`);
      console.log(`    computed height: ${imgStyles.height}`);
      console.log(`    computed display: ${imgStyles.display}`);
      console.log(`    inline style.height: '${img.style.height || '(empty)'}'`);
      console.log(`    naturalWidth: ${img.naturalWidth}px, naturalHeight: ${img.naturalHeight}px`);
      console.log(`    rendered width: ${img.width}px, height: ${img.height}px`);
      console.log(`    FLIP startImg: ${startImg.width.toFixed(0)}x${startImg.height.toFixed(0)}px`);
      console.log(`    FLIP endImg: ${endImg.width.toFixed(0)}x${endImg.height.toFixed(0)}px`);

      if (buffers.length > 0) {
        console.log(`\n  .cm-widgetBuffer (${buffers.length}):`);
        let bufferHeightSum = 0;
        for (let idx = 0; idx < buffers.length; idx++) {
          const buffer = buffers[idx] as HTMLElement;
          const bufferStyles = window.getComputedStyle(buffer);
          bufferHeightSum += buffer.offsetHeight;
          console.log(`    [${idx}] offsetHeight: ${buffer.offsetHeight}px, computed height: ${bufferStyles.height}, computed display: ${bufferStyles.display}`);
        }
        console.log(`    total buffers height: ${bufferHeightSum}px`);
      }

      if (cmLine) {
        const lineHeight = cmLine.offsetHeight;
        const containerHeight = container.offsetHeight;
        const extra = lineHeight - containerHeight;
        console.log(`\n  ANALYSIS:`);
        console.log(`    line height: ${lineHeight}px`);
        console.log(`    container height: ${containerHeight}px`);
        console.log(`    extra height: ${extra}px`);
        if (extra > 350) {
          console.log(`    ⚠️  PROBLEM: Extra height is significant (>350px)`);
          if (Math.abs(extra - containerHeight) < 50) {
            console.log(`    💡 Extra height ≈ container height: possible double rendering`);
          }
        }
      }

      console.log('');
    }

    // Container `height` is FLIP-animated too (2026-09, fixing a real
    // Fit→Fill asymmetry) — see `.cm-image-container`'s own CSS doc
    // comment (MarkdownEditor.css) for the full mechanism: without this,
    // `.cm-image-container--fill`'s `height: 400px` + `overflow: hidden`
    // took effect the instant the class swapped, clipping a taller
    // Fit-mode image to exactly 400px before its own height transition
    // had moved at all — a real snap, not merely fast. Pinning the
    // container's height the same way its width already is gives
    // `overflow: hidden` a correctly-animating boundary to clip against
    // in both directions, not one that already jumped to its final size.
    flipDimensionTransition([
      { el: container, property: 'width', from: startContainer.width, to: endContainer.width },
      { el: container, property: 'height', from: startContainer.height, to: endContainer.height },
      { el: img, property: 'width', from: startImg.width, to: endImg.width },
      { el: img, property: 'height', from: startImg.height, to: endImg.height },
    ]);

    return true;
  }

  override toDOM(view: EditorView): HTMLElement {
    console.log(`[ImageWidget.toDOM] pos=${this.pos} displayMode=${this.ui.displayMode} presentation.mode=${this.presentation.mode} revealed=${this.ui.revealed}`);
    const container = document.createElement('div');
    // `cm-media-block` — the shared global media/embed block-flow
    // contract (MarkdownEditor.css) every media widget opts into: this
    // element must always occupy its own block position in the document
    // flow, regardless of its own width or a broken/working state, never
    // sharing a line with surrounding Markdown text. See that class's
    // own doc comment for the full rationale/mechanism.
    container.classList.add('cm-image-container', 'cm-media-block');
    container.dataset.imageSourceRevealed = String(this.ui.revealed);
    // Starts closed unconditionally — a freshly-rendered widget is never
    // mid-open (there is no CM6-tracked "menu is open" state for this to
    // read; see imageUiState.ts's own doc comment for exactly why not).
    // `MarkdownEditor.tsx`'s onOpenImageMenuRef/closeImageMenu set/clear
    // this dataset attribute and the size button's own active state via
    // direct DOM mutation instead, specifically so opening/closing the
    // menu never goes through eq()/toDOM() and therefore never risks
    // recreating (and thereby detaching) the very button Overlay is
    // anchored to. A broken image has no size button to open a menu from
    // at all, so this is dead weight for it, but harmless — no rule this
    // attribute's rendering.
    container.dataset.menuOpen = 'false';

    if (this.ui.broken) {
      return this.renderBroken(container, view);
    }

    return this.renderWorking(container, view);
  }

  private renderWorking(container: HTMLElement, view: EditorView): HTMLElement {
    console.log(`[ImageWidget.renderWorking] pos=${this.pos} displayMode=${this.ui.displayMode} applying class: cm-image-container--${this.ui.displayMode}`);
    // Both modes are a full-width-by-default box (`.cm-image-container
    // --fill`/`--fit`, MarkdownEditor.css) — they differ only in height:
    // Fill is a fixed 400px cover-cropped box, Fit's height is `auto`,
    // derived by the browser from the `<img>`'s own intrinsic aspect
    // ratio. Neither height is ever computed here — pure CSS. A
    // non-default persisted width (below) narrows the container itself;
    // neither mode's own `<img>` ever receives a width of its own.
    container.classList.add(this.ui.displayMode === 'fill' ? 'cm-image-container--fill' : 'cm-image-container--fit');

    applyMediaAlignment(container, this.presentation.alignment);

    // Live source of truth for this node's own `to`, read by every
    // control whose closure outlives a single `updateDOM` patch — see
    // `makeEditButton`'s own doc comment for exactly why `this.to` alone
    // isn't safe to close over here. Kept in sync by `updateDOM` on every
    // presentation-only patch.
    container.dataset.nodeTo = String(this.to);
    const getCurrentTo = () => Number(container.dataset.nodeTo);

    const controls = document.createElement('div');
    controls.classList.add('cm-image-controls');
    controls.contentEditable = 'false';

    const sizeButton = this.makeButton(SIZE_ICON, 'Image size options', () => {
      this.getOnOpenImageMenu()?.({
        anchor: sizeButton,
        pos: this.pos,
        to: getCurrentTo(),
        alt: this.alt,
        url: this.url,
        copyUrl: this.copyUrl,
      });
    });
    sizeButton.setAttribute('aria-expanded', 'false');
    controls.append(sizeButton, this.makeEditButton(view, getCurrentTo));

    // The image itself is a clickable UI affordance (opens ImageOverlay),
    // not editable text. A real <button> wrapping the <img> — not
    // role="button"+tabindex+manual keydown on the <img> itself (an
    // earlier, since-corrected version of this file did that) — matching
    // TaskCheckboxWidget.ts's own established pattern for exactly this
    // shape of control (a clickable icon-like element inside a CM6
    // widget), not WikiLinkWidget's/TagWidget's (those are mouse-only —
    // role="link"/"button" + aria-label, no tabIndex, no keyboard
    // handling at all; confirmed by direct inspection, not assumed —
    // keyboard-only activation for THAT family was explicitly left an
    // open question and never built, per docs/editor-architecture-
    // decisions.md's "Keyboard-only activation gap" entry). A native
    // <button> gets Tab-focusability and Enter/Space activation for free
    // from browser semantics — no custom keydown code, and critically,
    // exactly one `click` event per activation regardless of whether it
    // was triggered by a mouse click or a keyboard Enter/Space (native
    // guarantee, not something this file has to coordinate itself), which
    // is what rules out double-firing between a manual keydown handler
    // and a separate click handler.
    //
    // No `<img>` is created here — see `probeThenMount`'s own doc comment
    // (2026-09, "native broken-image icon" fix) for why the real `<img>`
    // is only ever created once a detached probe has already confirmed
    // `this.url` loads.
    const imageButton = document.createElement('button');
    imageButton.type = 'button';
    imageButton.classList.add('cm-image-button');
    imageButton.setAttribute(
      'aria-label',
      `Open image: ${this.alt || this.url}`
    );

    // Same pattern as makeButton's own listeners: preventDefault on
    // mousedown stops CM6's own click-to-position default outright (this
    // no longer depends on ignoreEvent() alone — see the class doc
    // comment — but keeping it is still correct defense-in-depth, same as
    // every control button already does). Native keyboard activation
    // (Enter/Space) never dispatches a `mousedown` at all, so this never
    // interferes with it. stopPropagation on `click` keeps the event from
    // reaching any other ancestor handler, mouse- or keyboard-triggered
    // alike.
    imageButton.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    imageButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.getOnImageClick()?.(this.url, this.alt, this.copyUrl);
    });

    // Applied synchronously here, before the `<img>` itself even exists
    // yet (`probeThenMount` mounts it once the probe confirms `this.url`
    // loads) — there is no image-specific width target left to wait for
    // any more; the container is the only element a numeric width ever
    // touches.
    applyMediaWidth(container, null, this.presentation.width, view, this.widthObserver);

    container.append(controls, imageButton);

    this.probeThenMount(imageButton, view);

    return container;
  }

  override destroy(): void {
    disconnectMediaWidthObserver(this.widthObserver);
  }

  /**
   * Never creates a real, visible `<img>` until an invisible, detached
   * probe (`new Image()`, never inserted into the DOM) confirms `this.url`
   * actually loads — the exact same established mechanism
   * `probeForRecovery` already uses for a *broken* image's silent retry,
   * now also applied to the very first render (2026-09, "native
   * broken-image icon" fix).
   *
   * Before this fix, `renderWorking()` created a real, visible `<img
   * src>` immediately and only reacted *after* the browser's own `error`
   * event fired on it — which left a real, unavoidable-by-CSS window,
   * however brief, during which a genuinely resolved-but-failing-to-load
   * URL (a deleted/renamed file whose Vault entry hasn't caught up yet, a
   * broken external link, a transient network failure) could paint the
   * browser's own native broken-image glyph before this widget's error
   * handler ever got a chance to replace it with the custom
   * broken-resource UI (`renderBroken`). Probing first makes that
   * structurally impossible: the only `<img>` this method ever creates is
   * one already confirmed to succeed, so its own `src` assignment can
   * never itself produce a failed paint.
   *
   * On success, the real `<img>` is appended directly to the already-
   * mounted `imageButton` — a plain DOM mutation, not a CM6 dispatch, the
   * same "ephemeral, widget-local" reasoning `PdfEmbedWidget`'s own
   * page/zoom state and `MarkdownEditor.tsx`'s `menuOpen` already
   * establish (this doesn't need to persist as document state; the next
   * `eq()`-equal rebuild simply reuses this same DOM, real `<img>` and
   * all). A second `error` listener on that real `<img>` is kept anyway,
   * purely as defense-in-depth for the vanishingly rare case where the
   * exact same URL somehow fails on its second (real) request after
   * succeeding on the probe's first one — same fallback path, `broken:
   * true` via `setImageUiState`.
   *
   * On failure, the existing `broken` mechanism fires exactly as it did
   * before this fix — dispatched through `setImageUiState`, causing the
   * next rebuild to construct this widget via `renderBroken()` instead.
   */
  private probeThenMount(imageButton: HTMLElement, view: EditorView): void {
    const dispatchBroken = () => {
      view.dispatch({
        effects: setImageUiState.of({ pos: this.pos, to: this.to, state: { ...this.ui, broken: true } }),
      });
    };

    const probe = new Image();
    probe.addEventListener(
      'load',
      () => {
        const img = document.createElement('img');
        img.classList.add('tok-image', `tok-image--${this.ui.displayMode}`);
        img.alt = this.alt;
        img.addEventListener('error', dispatchBroken, { once: true });
        img.src = this.url;
        imageButton.append(img);
        // No width/height application here — both modes are pure CSS
        // (`.tok-image--fill`/`.tok-image--fit`, MarkdownEditor.css): the
        // image carries no inline sizing of its own, it simply fills
        // whatever box its mode's own rule describes the moment it mounts.
      },
      { once: true }
    );
    probe.addEventListener('error', dispatchBroken, { once: true });
    probe.src = this.url;
  }

  private renderBroken(container: HTMLElement, view: EditorView): HTMLElement {
    container.classList.add('cm-image-container--broken');

    const controls = document.createElement('div');
    controls.classList.add('cm-image-controls');
    controls.contentEditable = 'false';

    const deleteButton = this.makeButton(TRASH_ICON, 'Delete image', () => {
      const { from, to } = computeImageDeletionRange(view.state, this.pos);
      view.dispatch({ changes: { from, to, insert: '' } });
    });
    // No size button here at all — this UX's explicit requirement is that
    // a broken image never offers Large/Fill/Fit/Copy link/Set as cover
    // image/etc., not merely that those items are hidden/disabled once a
    // menu is somehow open.
    controls.append(deleteButton, this.makeEditButton(view));

    const broken = document.createElement('div');
    broken.classList.add('cm-image-broken');

    // A 24x24 wrapper around the 16x16 icon — the icon's own hit/visual
    // area matches the controls' own buttons (`.cm-image-control` is
    // `--height-md` square with a 16x16 `svg` centered inside, above) for
    // visual rhythm, even though this particular icon isn't interactive.
    const iconWrap = document.createElement('span');
    iconWrap.classList.add('cm-image-broken__icon-wrap');
    iconWrap.innerHTML = BROKEN_IMAGE_ICON;
    iconWrap.querySelector('svg')?.classList.add('cm-image-broken__icon');
    broken.append(iconWrap);

    const altSpan = document.createElement('span');
    altSpan.classList.add('cm-image-broken__alt');
    altSpan.textContent = 'Unable to load';
    broken.append(altSpan);

    const hintSpan = document.createElement('span');
    hintSpan.classList.add('cm-image-broken__hint');
    hintSpan.textContent = this.copyUrl ?? this.url;
    broken.append(hintSpan);

    this.probeForRecovery(view);

    container.append(controls, broken);
    return container;
  }

  /**
   * Invisible retry — never a visible, real `<img>` (2026-09-02, "the
   * browser's native broken-image rendering must NEVER be visible"). A
   * `new Image()` that is never inserted into the DOM still fires real
   * `load`/`error` events for whatever `src` it's given, which is exactly
   * what's needed here: attempt `this.url` in the background, and only
   * once its own `load` event *confirms* success does this dispatch
   * `broken: false` — at which point a fresh `toDOM()` call (triggered by
   * that same dispatch, since `broken` participates in `eq()`) renders via
   * `renderWorking()` for a URL already known to load, so *that* real,
   * visible `<img>`'s own `error` path is realistically unreachable, not
   * merely rare. `imageUiState.ts`'s own doc comment has the full account
   * of why this replaced the earlier "just reset `broken` optimistically
   * and let the visible `<img>` sort it out" design — that design was
   * exactly what let the browser's native glyph flash during rapid
   * character-by-character URL editing.
   *
   * Runs unconditionally on every `renderBroken()` call — including the
   * very next keystroke while a previous probe for a now-superseded URL
   * is still in flight. Never cancelled (`Image` has no abort primitive to
   * cancel with), which is why the **staleness check on resolve** is load-
   * bearing, not defensive-in-depth: it re-resolves the actual current
   * document at `this.pos` and confirms it's still `this.url` — via
   * `findEnclosingImageNode` + `scanImage`, the exact same two steps
   * `imageLivePreview.ts`'s own `buildDecorations` already uses to arrive
   * at a URL from a position, reused rather than re-derived — before
   * dispatching anything. A stale probe (superseded by further typing
   * before it resolved) is silently discarded; only the probe for
   * whatever URL is *actually* current at resolve time is allowed to
   * change state.
   */
  private probeForRecovery(view: EditorView): void {
    const pos = this.pos;
    const url = this.url;
    const getCurrentSource = this.getCurrentSource;
    const probe = new Image();
    probe.addEventListener(
      'load',
      () => {
        const current = getCurrentSource(view.state, pos);
        if (!current || current.url !== url) {
          return; // Superseded by further edits since this probe started.
        }
        const ui = getImageUiState(view.state, pos);
        if (!ui.broken) {
          return; // Already recovered via some other path.
        }
        view.dispatch({ effects: setImageUiState.of({ pos, to: current.to, state: { ...ui, broken: false } }) });
      },
      { once: true }
    );
    probe.src = url;
  }

  /**
   * Shared by both `renderWorking`/`renderBroken` — see the class doc
   * comment for why Edit source must behave identically in both states,
   * which this single implementation is what actually guarantees rather
   * than merely documents.
   *
   * `getTo` (default `() => this.to`) exists for `updateDOM`'s own sake:
   * `renderWorking` passes a live reader off the container's own
   * `data-node-to` attribute instead, since the button element itself
   * (and its closure, permanently bound to whichever widget instance
   * created it) survives a presentation-only `updateDOM` patch — the
   * *node's* own `to` genuinely shifts whenever the pipe segment's own
   * text length changes (`{6}` vs `{620}` vs no segment at all are
   * different lengths), so a closure that captured `this.to` once at
   * construction time would silently dispatch against a stale position
   * after such a patch. `renderBroken` never goes through `updateDOM`
   * (broken transitions always get a full rebuild — see that method's
   * own doc comment), so it keeps the simpler default unchanged.
   */
  private makeEditButton(view: EditorView, getTo: () => number = () => this.to): HTMLButtonElement {
    return this.makeButton(
      EDIT_ICON,
      this.ui.revealed ? 'Hide source' : 'Edit source',
      () => {
        const revealing = !this.ui.revealed;
        const to = getTo();
        console.log(`[ImageWidget.makeEditButton] pos=${this.pos} BEFORE dispatch: displayMode=${this.ui.displayMode} revealed=${this.ui.revealed} → revealing=${revealing}`);
        view.dispatch({
          effects: setImageUiState.of({
            pos: this.pos,
            to,
            state: { ...this.ui, revealed: revealing },
          }),
          // Cursor at the end of the raw Markdown, never a range
          // selection — the 2026-09-02 UX baseline's explicit "cursor
          // placed at the end of the Markdown" / "must not be selected
          // automatically" requirements (items 3). Only set when
          // revealing: hiding via this same button never needs to move
          // the caret anywhere.
          selection: revealing ? EditorSelection.cursor(to) : undefined,
          scrollIntoView: revealing,
        });
      }
    );
  }

  private makeButton(
    iconHtml: string,
    label: string,
    onActivate: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('cm-image-control');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = iconHtml;
    // contentEditable="false" on the controls container already keeps
    // CM6 from treating this subtree as document text; stopping
    // propagation here additionally keeps a button click from bubbling
    // to any ancestor listener (the container, CM6's own delegated
    // handlers, etc.) — it never reaches the sibling <img>'s own listener
    // either way, since bubbling only travels up through ancestors, not
    // across siblings. Plain DOM listeners, independent of
    // ignoreEvent()/CM6's event dispatch either way.
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onActivate();
    });
    return button;
  }
}
