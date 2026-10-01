// Walks up from a row to find the nearest actually-scrolling ancestor
// (e.g. Sidebar.View.css's `.view--content`) without hardcoding that
// class name — a caller doesn't own that container, so it shouldn't
// assume its selector.
function getScrollParent(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;

  while (node) {
    const overflowY = getComputedStyle(node).overflowY;

    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
}

function isFullyVisibleWithin(element: HTMLElement, container: HTMLElement): boolean {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  return elementRect.top >= containerRect.top && elementRect.bottom <= containerRect.bottom;
}

/**
 * Scrolls `node` into view within its nearest scrolling ancestor — only
 * moving the scroll position when it isn't already fully visible
 * (`scrollIntoView` itself has no "only if needed" mode, it always
 * re-centers), and respecting `prefers-reduced-motion` (falls back to an
 * instant jump instead of a smooth scroll). Extracted from
 * DailyNotesList.tsx's identical original implementation — the one
 * "scroll a sidebar row into view" primitive, reused by any sidebar list
 * that needs this (Daily Notes' calendar-driven reveal, the Tags
 * sidebar's "Reveal in Clutter" note action), rather than each
 * reimplementing the same reduced-motion/already-visible checks.
 */
export function scrollRowIntoView(node: HTMLElement): void {
  const scrollParent = getScrollParent(node);

  if (scrollParent && isFullyVisibleWithin(node, scrollParent)) {
    return;
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  node.scrollIntoView({
    block: 'center',
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });
}
