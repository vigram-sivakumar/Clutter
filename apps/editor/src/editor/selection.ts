/**
 * Selection: nodeId + inlineIndex + offset. Read from DOM, restore by walking spans.
 */

export type Selection = {
  nodeId: string;
  inlineIndex: number;
  offset: number;
};

/**
 * Read current selection from DOM. Returns null if selection is outside root or invalid.
 */
export function getSelection(rootEl: HTMLElement): Selection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return null;

  let el: HTMLElement | null =
    sel.anchorNode instanceof Text
      ? sel.anchorNode.parentElement
      : (sel.anchorNode as HTMLElement);
  if (!el) return null;

  const nodeWrapper = el.closest('[data-node-id]');
  if (!nodeWrapper || !rootEl.contains(nodeWrapper)) return null;

  const nodeId = nodeWrapper.getAttribute('data-node-id');
  if (!nodeId) return null;

  const content = nodeWrapper.querySelector('.clutter-node__content');
  if (!content || !content.contains(el)) return null;

  const span = el.tagName === 'SPAN' ? el : el.closest('span');
  const children = Array.from(content.children);
  const inlineIndex = span ? children.indexOf(span as Element) : 0;
  if (inlineIndex < 0) return null;

  const textNode =
    sel.anchorNode instanceof Text
      ? sel.anchorNode
      : span?.firstChild;
  const offset = textNode && sel.anchorNode === textNode ? sel.anchorOffset : 0;

  return { nodeId, inlineIndex, offset };
}

/**
 * Set selection in DOM by finding node and inline span, then setting Range.
 */
export function setSelection(rootEl: HTMLElement, sel: Selection): void {
  const wrapper = rootEl.querySelector(`[data-node-id="${sel.nodeId}"]`);
  if (!wrapper) return;

  const content = wrapper.querySelector('.clutter-node__content');
  if (!content) return;

  const spans = content.querySelectorAll('span');
  const targetSpan = spans[sel.inlineIndex];
  if (!targetSpan) {
    const textNode = content.firstChild;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      range.setStart(textNode, Math.min(sel.offset, textNode.textContent?.length ?? 0));
      range.collapse(true);
      const wSel = window.getSelection();
      if (wSel) {
        wSel.removeAllRanges();
        wSel.addRange(range);
      }
    }
    return;
  }

  const textNode = targetSpan.firstChild ?? targetSpan;
  const len = textNode.textContent?.length ?? 0;
  const clamped = Math.min(sel.offset, len);
  const range = document.createRange();
  range.setStart(textNode, clamped);
  range.collapse(true);

  const wSel = window.getSelection();
  if (wSel) {
    wSel.removeAllRanges();
    wSel.addRange(range);
  }
}
