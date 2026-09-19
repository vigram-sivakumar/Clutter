import type { EditorView } from '@codemirror/view';

import type { TableActiveCellController } from './tableActiveCellController';
import { tableSelectionField } from './tableSelection';

// ============================================================
// TEMP DIAGNOSTIC — "click outside a table doesn't clear Ctrl+A halo"
// investigation. Not a fix, no behavior change: every addition here is
// either a console.log or a listener that only logs. Remove this whole
// file, its CSS-free import, and its single call site in
// MarkdownEditor.tsx once the investigation concludes — do NOT remove it
// before the user has collected both Test A (normal note) and Test B
// (table note) logs.
//
// Logs a full BEFORE_CLICK / CAPTURE_MOUSEDOWN / BUBBLE_MOUSEDOWN /
// MOUSEUP / CLICK / SELECTIONCHANGE / AFTER_SETTLE sequence for every
// physical mousedown gesture anywhere in the document, tagged with a
// monotonic `click#N` id so a flat, copy-pasted console log still reads
// as grouped, ordered sequences. Every line is a single
// `console.log('[TABLE-CLICK-DIAG] ...')` string (not a raw object arg)
// specifically so it survives a plain-text copy/paste out of a real
// WKWebView console without losing structure to `[object Object]`-style
// truncation.
// ============================================================

interface TargetDescription {
  readonly tag: string;
  readonly className: string;
  readonly inEditor: boolean;
  readonly inContent: boolean;
  readonly inTableWidget: boolean;
}

function describeTarget(target: EventTarget | null): TargetDescription {
  if (!(target instanceof Element)) {
    return { tag: String(target), className: '', inEditor: false, inContent: false, inTableWidget: false };
  }
  return {
    tag: target.tagName,
    className: target.className || '(none)',
    inEditor: !!target.closest('.cm-editor'),
    inContent: !!target.closest('.cm-content'),
    inTableWidget: !!target.closest('.cm-table-widget'),
  };
}

function describeActiveElement(): string {
  const el = document.activeElement;
  if (!el) {
    return '(none)';
  }
  return `${el.tagName}.${(el.className || '(none)').toString().replace(/\s+/g, '.')}`;
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
    activeCell: anchor ? { from: anchor.from, to: anchor.to, nestedFocused } : null,
    haloRendered: document.querySelectorAll('.cm-table-wrapper-selected').length > 0,
  };
}

function log(clickId: number, phase: string, payload: unknown): void {
  // eslint-disable-next-line no-console
  console.log(`[TABLE-CLICK-DIAG] click#${clickId} ${phase} ${JSON.stringify(payload)}`);
}

function logEventFields(clickId: number, phase: string, event: Event): void {
  log(clickId, phase, {
    target: describeTarget(event.target),
    defaultPrevented: event.defaultPrevented,
    cancelBubble: (event as unknown as { cancelBubble: boolean }).cancelBubble,
    activeElement: describeActiveElement(),
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
    logEventFields(clickId, 'CAPTURE_MOUSEDOWN', event);
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
    }
  };

  const onBubbleMouseDown = (event: MouseEvent): void => {
    logEventFields(clickId, 'BUBBLE_MOUSEDOWN', event);
  };

  const onMouseUp = (event: MouseEvent): void => {
    logEventFields(clickId, 'MOUSEUP', event);
  };

  const onClick = (event: MouseEvent): void => {
    logEventFields(clickId, 'CLICK', event);
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
    log(clickId, 'SELECTIONCHANGE', { activeElement: describeActiveElement() });
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
