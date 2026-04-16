/**
 * Selection: collapsed caret or range. Read from DOM, restore by walking spans.
 */

import type { EditorState } from '../engine/engine';
import { isHandlingInput } from './input-lock';

export function validateSelection(
  state: EditorState,
  sel: Selection | null
): Selection | null {
  if (!sel) return null;

  if (sel.type === 'collapsed') {
    const node = state.nodes[sel.nodeId];
    if (!node) return null;

    if (sel.inlineIndex < 0 || sel.inlineIndex >= node.inlines.length) {
      return null;
    }

    const inline = node.inlines[sel.inlineIndex];
    if (!inline || inline.type !== 'text') return null;

    const clampedOffset = Math.max(0, Math.min(sel.offset, inline.text.length));

    return {
      ...sel,
      offset: clampedOffset,
    };
  }

  if (sel.type === 'range') {
    const anchor = validateSelection(state, {
      type: 'collapsed',
      nodeId: sel.anchor.nodeId,
      inlineIndex: sel.anchor.inlineIndex,
      offset: sel.anchor.offset,
    });

    const focus = validateSelection(state, {
      type: 'collapsed',
      nodeId: sel.focus.nodeId,
      inlineIndex: sel.focus.inlineIndex,
      offset: sel.focus.offset,
    });

    if (!anchor || !focus) return null;
    if (anchor.type !== 'collapsed' || focus.type !== 'collapsed') return null;

    return {
      type: 'range',
      anchor: {
        nodeId: anchor.nodeId,
        inlineIndex: anchor.inlineIndex,
        offset: anchor.offset,
      },
      focus: {
        nodeId: focus.nodeId,
        inlineIndex: focus.inlineIndex,
        offset: focus.offset,
      },
    };
  }

  if (sel.type === 'block-range') {
    if (!state.nodes[sel.startNodeId]) return null;
    if (!state.nodes[sel.endNodeId]) return null;
    return sel;
  }

  return null;
}

export type CollapsedSelection = {
  type: 'collapsed';
  nodeId: string;
  inlineIndex: number;
  offset: number;
};

export type RangeSelection = {
  type: 'range';
  anchor: {
    nodeId: string;
    inlineIndex: number;
    offset: number;
  };
  focus: {
    nodeId: string;
    inlineIndex: number;
    offset: number;
  };
};

export type BlockRangeSelection = {
  type: 'block-range';
  startNodeId: string;
  endNodeId: string;
};

export type Selection =
  | CollapsedSelection
  | RangeSelection
  | BlockRangeSelection;

/**
 * Read current selection from DOM. Returns null if selection is outside root or invalid.
 */
export function getSelection(rootEl: HTMLElement): Selection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const readPoint = (node: Node, offset: number) => {
    const el: HTMLElement | null =
      node instanceof Text ? node.parentElement : (node as HTMLElement);

    if (!el) return null;

    const nodeWrapper = el.closest('[data-node-id]');
    if (!nodeWrapper || !rootEl.contains(nodeWrapper)) return null;

    const nodeId = nodeWrapper.getAttribute('data-node-id');
    if (!nodeId) return null;

    const content = nodeWrapper.querySelector('.clutter-node__content');
    if (!content || !content.contains(el)) return null;

    // We currently render a single normalized text inline per node.
    // Simplify inline mapping to index 0 for stability.
    const inlineIndex = 0;

    return {
      nodeId,
      inlineIndex,
      offset,
    };
  };

  const anchor = readPoint(sel.anchorNode!, sel.anchorOffset);
  const focus = readPoint(sel.focusNode!, sel.focusOffset);

  if (!anchor || !focus) return null;

  if (
    anchor.nodeId === focus.nodeId &&
    anchor.inlineIndex === focus.inlineIndex &&
    anchor.offset === focus.offset
  ) {
    return {
      type: 'collapsed',
      nodeId: anchor.nodeId,
      inlineIndex: anchor.inlineIndex,
      offset: anchor.offset,
    };
  }

  if (anchor.nodeId !== focus.nodeId) {
    return {
      type: 'block-range',
      startNodeId: anchor.nodeId,
      endNodeId: focus.nodeId,
    };
  }

  return normalizeRange({
    type: 'range',
    anchor,
    focus,
  });
}

function normalizeRange(sel: RangeSelection): RangeSelection {
  const anchorKey = `${sel.anchor.nodeId}-${sel.anchor.inlineIndex}-${sel.anchor.offset}`;
  const focusKey = `${sel.focus.nodeId}-${sel.focus.inlineIndex}-${sel.focus.offset}`;

  if (anchorKey <= focusKey) return sel;

  return {
    type: 'range',
    anchor: sel.focus,
    focus: sel.anchor,
  };
}

export function syncDomSelectionToState(
  rootEl: HTMLElement,
  sel: Selection | null
): void {
  if (!sel) return;
  if (isHandlingInput) return;

  const nativeSel = window.getSelection();
  if (!nativeSel) return;

  if (sel.type === 'range') {
    // Highlight the selected text in the DOM.
    const makePoint = (point: {
      nodeId: string;
      inlineIndex: number;
      offset: number;
    }) => {
      const wrapper = rootEl.querySelector(`[data-node-id="${point.nodeId}"]`);
      if (!wrapper) return null;
      const span = wrapper.querySelector('.clutter-node__content span');
      if (!span) return null;
      const textNode = span.firstChild ?? span;
      const len = textNode.textContent?.length ?? 0;
      return { node: textNode, offset: Math.min(point.offset, len) };
    };

    const anchor = makePoint(sel.anchor);
    const focus = makePoint(sel.focus);
    if (!anchor || !focus) return;

    const range = document.createRange();
    range.setStart(anchor.node, anchor.offset);
    range.setEnd(focus.node, focus.offset);

    nativeSel.removeAllRanges();
    nativeSel.addRange(range);
    return;
  }

  if (sel.type === 'block-range') {
    // Focus a contenteditable child so that beforeinput events fire when the user
    // types or presses Enter. The block-range visual is CSS-driven; we just need
    // an editable target so the browser generates input events.
    const content = rootEl.querySelector(
      `[data-node-id="${sel.startNodeId}"] .clutter-node__content`
    ) as HTMLElement | null;
    (content ?? rootEl).focus({ preventScroll: true });
    // Do NOT call removeAllRanges here — the contenteditable needs a cursor
    // position for beforeinput to fire. caret-color: transparent hides it visually.
    return;
  }

  if (sel.type !== 'collapsed') return;

  const wrapper = rootEl.querySelector(`[data-node-id="${sel.nodeId}"]`);

  if (!wrapper) return;

  const span = wrapper.querySelector('.clutter-node__content span');
  if (!span) return;

  const textNode = span.firstChild ?? span;

  if (
    nativeSel.anchorNode === textNode &&
    nativeSel.anchorOffset === sel.offset &&
    nativeSel.isCollapsed
  ) {
    return;
  }

  const range = document.createRange();
  const len = textNode.textContent?.length ?? 0;
  const clamped = Math.min(sel.offset, len);

  range.setStart(textNode, clamped);
  range.collapse(true);

  nativeSel.removeAllRanges();
  nativeSel.addRange(range);
}

/**
 * Set selection in DOM by finding node and inline span, then setting Range.
 */
export function setSelection(rootEl: HTMLElement, sel: Selection): void {
  if (sel.type === 'block-range') {
    const nativeSel = window.getSelection();
    if (nativeSel) nativeSel.removeAllRanges();
    return;
  }

  const nativeSel = window.getSelection();
  if (!nativeSel) return;

  nativeSel.removeAllRanges();

  const makePoint = (point: {
    nodeId: string;
    inlineIndex: number;
    offset: number;
  }) => {
    const wrapper = rootEl.querySelector(`[data-node-id="${point.nodeId}"]`);
    if (!wrapper) return null;

    const content = wrapper.querySelector('.clutter-node__content');
    if (!content) return null;

    // We render a single text span per node.
    // Ignore inlineIndex for now.
    const targetSpan = content.querySelector('span');
    if (!targetSpan) return null;

    const textNode = targetSpan.firstChild ?? targetSpan;
    const len = textNode.textContent?.length ?? 0;
    const clamped = Math.min(point.offset, len);

    return { node: textNode, offset: clamped };
  };

  const range = document.createRange();

  if (sel.type === 'collapsed') {
    const point = makePoint(sel);
    if (!point) return;

    range.setStart(point.node, point.offset);
    range.collapse(true);
  }

  if (sel.type === 'range') {
    const anchor = makePoint(sel.anchor);
    const focus = makePoint(sel.focus);
    if (!anchor || !focus) return;

    range.setStart(anchor.node, anchor.offset);
    range.setEnd(focus.node, focus.offset);
  }

  nativeSel.addRange(range);
}
