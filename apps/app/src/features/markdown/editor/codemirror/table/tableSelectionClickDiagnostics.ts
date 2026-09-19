import type { EditorView } from '@codemirror/view';

import type { TableActiveCellController } from './tableActiveCellController';
import { tableSelectionField } from './tableSelection';

// ============================================================
// TEMP DIAGNOSTIC — "click outside a table doesn't clear Ctrl+A halo"
// investigation. Not a fix, no behavior change: every addition here is
// either a console.log or a listener that only logs. Remove this whole
// file, its import, and its two call sites in MarkdownEditor.tsx once the
// investigation concludes — do NOT remove it before the user has
// collected the logs they need.
//
// Logs a full BEFORE_CLICK / CAPTURE_MOUSEDOWN / BUBBLE_MOUSEDOWN /
// MOUSEUP / CLICK / SELECTIONCHANGE / AFTER_SETTLE sequence for every
// physical mousedown gesture anywhere in the document, tagged with a
// monotonic `click#N` id. Every phase now also logs the *native*
// `document.getSelection()` (rangeCount/isCollapsed/anchor+focus node,
// each tagged with whether it falls inside `.cm-table-widget`) and, for
// the two mousedown phases, what CM6's own `view.posAtCoords()` resolves
// the click's screen coordinates to — directly testing whether the
// divergence is in the *native* selection collapsing around the table's
// `contenteditable=false` island, or in CM6's own coordinate-to-position
// mapping near the block widget. Every line is a single
// `console.log('[TABLE-CLICK-DIAG] ...')` string (not a raw object arg)
// so it survives a plain-text copy/paste out of a real WKWebView console.
// ============================================================

function describeElementLike(el: Element | null): { tag: string; className: string; inTableWidget: boolean; inContent: boolean; inEditor: boolean } {
  if (!el) {
    return { tag: '(none)', className: '', inTableWidget: false, inContent: false, inEditor: false };
  }
  return {
    tag: el.tagName,
    className: el.className || '(none)',
    inTableWidget: !!el.closest('.cm-table-widget'),
    inContent: !!el.closest('.cm-content'),
    inEditor: !!el.closest('.cm-editor'),
  };
}

function describeTarget(target: EventTarget | null): ReturnType<typeof describeElementLike> {
  return describeElementLike(target instanceof Element ? target : null);
}

function describeNode(node: Node | null): { kind: string; text: string } & ReturnType<typeof describeElementLike> {
  if (!node) {
    return { kind: '(none)', text: '', ...describeElementLike(null) };
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return { kind: '#text', text: (node.textContent ?? '').slice(0, 24), ...describeElementLike(node.parentElement) };
  }
  return { kind: 'element', text: '', ...describeElementLike(node as Element) };
}

function describeNativeSelection(): unknown {
  const sel = document.getSelection();
  if (!sel) {
    return { present: false };
  }
  return {
    present: true,
    rangeCount: sel.rangeCount,
    isCollapsed: sel.isCollapsed,
    type: sel.type,
    anchor: describeNode(sel.anchorNode),
    anchorOffset: sel.anchorOffset,
    focus: describeNode(sel.focusNode),
    focusOffset: sel.focusOffset,
  };
}

function describeActiveElement(): ReturnType<typeof describeElementLike> {
  return describeElementLike(document.activeElement instanceof Element ? document.activeElement : null);
}

function describeEditorState(view: EditorView, controller: TableActiveCellController) {
  const sel = view.state.selection.main;
  const tableSelection = view.state.field(tableSelectionField, false) ?? null;
  const anchor = controller.activeAnchor;
  const nestedView = controller.nestedView;
  const nestedFocused = !!nestedView && nestedView.root.activeElement === nestedView.contentDOM;
  return {
    rootSelection: { from: sel.from, to: sel.to, empty: sel.empty },
    tableSelection,
    activeCell: anchor ? { from: anchor.from, to: anchor.to, nestedFocused, nestedConnected: nestedView?.dom.isConnected ?? null } : null,
    haloRendered: document.querySelectorAll('.cm-table-wrapper-selected').length > 0,
    viewHasFocus: view.hasFocus,
    nativeSelection: describeNativeSelection(),
    activeElement: describeActiveElement(),
  };
}

/** What CM6 itself believes the click's screen coordinates map to — `null` if CM6 can't resolve a position there at all. Directly tests whether a divergence is in CM6's own coordinate mapping near the table widget. */
function describePosAtCoords(view: EditorView, event: MouseEvent): unknown {
  try {
    // `precise: false` (CM6's own naming) always returns a number —
    // extrapolates/clamps to the nearest position even for a coordinate
    // far outside any real content. Omitting the second argument
    // (CM6's "precise" mode) instead returns `null` when it can't
    // confidently resolve an exact position — the more informative one
    // for this investigation, since a `null` here would directly confirm
    // "CM6 itself can't map this click's coordinates to anything."
    const imprecise = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    const precise = view.posAtCoords({ x: event.clientX, y: event.clientY });
    return { precise, imprecise, clientX: event.clientX, clientY: event.clientY };
  } catch (err) {
    return { error: String(err) };
  }
}

function log(clickId: number, phase: string, payload: unknown): void {
  // eslint-disable-next-line no-console
  console.log(`[TABLE-CLICK-DIAG] click#${clickId} ${phase} ${JSON.stringify(payload)}`);
}

function logEventFields(clickId: number, phase: string, event: MouseEvent, view: EditorView, includePosAtCoords: boolean): void {
  log(clickId, phase, {
    target: describeTarget(event.target),
    defaultPrevented: event.defaultPrevented,
    cancelBubble: (event as unknown as { cancelBubble: boolean }).cancelBubble,
    activeElement: describeActiveElement(),
    nativeSelection: describeNativeSelection(),
    ...(includePosAtCoords ? { posAtCoords: describePosAtCoords(view, event) } : {}),
  });
}

/**
 * Attaches the full diagnostic listener set. Returns a cleanup function —
 * call it (from `MarkdownEditor.tsx`'s own unmount cleanup, same as
 * `attachTableOutsideClickHandling`) to remove every listener installed
 * here. Safe to leave attached for an entire manual test session; every
 * listener here only reads state and logs, never dispatches or mutates
 * anything.
 */
export function attachTableSelectionClickDiagnostics(view: EditorView, controller: TableActiveCellController): () => void {
  let clickId = 0;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  const onCaptureMouseDown = (event: MouseEvent): void => {
    clickId += 1;
    log(clickId, 'BEFORE_CLICK', describeEditorState(view, controller));
    logEventFields(clickId, 'CAPTURE_MOUSEDOWN', event, view, true);
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
    }
  };

  const onBubbleMouseDown = (event: MouseEvent): void => {
    logEventFields(clickId, 'BUBBLE_MOUSEDOWN', event, view, true);
  };

  const onMouseUp = (event: MouseEvent): void => {
    logEventFields(clickId, 'MOUSEUP', event, view, false);
  };

  const onClick = (event: MouseEvent): void => {
    logEventFields(clickId, 'CLICK', event, view, false);
    // Scheduled after `click` (the last event in a normal gesture) so any
    // native `selectionchange` this gesture triggers — which can fire
    // asynchronously relative to `click`, that's exactly the ordering
    // this investigation needs to see — has a chance to land first.
    // AFTER_SETTLE itself is a plain snapshot, not tied to any specific
    // event, so its own delay is generous (150ms) rather than a single
    // microtask/rAF tick.
    settleTimer = setTimeout(() => {
      log(clickId, 'AFTER_SETTLE', describeEditorState(view, controller));
      settleTimer = null;
    }, 150);
  };

  const onSelectionChange = (): void => {
    log(clickId, 'SELECTIONCHANGE', {
      activeElement: describeActiveElement(),
      nativeSelection: describeNativeSelection(),
      rootSelection: { from: view.state.selection.main.from, to: view.state.selection.main.to, empty: view.state.selection.main.empty },
    });
  };

  const targetDocument = view.dom.ownerDocument;
  targetDocument.addEventListener('mousedown', onCaptureMouseDown, { capture: true });
  targetDocument.addEventListener('mousedown', onBubbleMouseDown);
  targetDocument.addEventListener('mouseup', onMouseUp);
  targetDocument.addEventListener('click', onClick);
  targetDocument.addEventListener('selectionchange', onSelectionChange);

  // eslint-disable-next-line no-console
  console.log('[TABLE-CLICK-DIAG] attached — every mousedown gesture in this document now logs a full sequence.');

  return () => {
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
    }
    targetDocument.removeEventListener('mousedown', onCaptureMouseDown, { capture: true });
    targetDocument.removeEventListener('mousedown', onBubbleMouseDown);
    targetDocument.removeEventListener('mouseup', onMouseUp);
    targetDocument.removeEventListener('click', onClick);
    targetDocument.removeEventListener('selectionchange', onSelectionChange);
    // eslint-disable-next-line no-console
    console.log('[TABLE-CLICK-DIAG] detached.');
  };
}

// ============================================================
// END TEMP DIAGNOSTIC
// ============================================================
