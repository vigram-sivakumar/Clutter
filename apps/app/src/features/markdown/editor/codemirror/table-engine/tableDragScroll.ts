/** Speed in CSS px per animation frame. No scroll until the pointer
 * enters the edge zone; cap the velocity even when outside the viewport. */
export function edgeScroll(position: number, start: number, end: number, zone = 32, max = 22): number {
  if (end <= start) return 0;
  const edge = Math.min(zone, (end - start) / 2);
  if (position < start + edge) return -max * Math.min(1, (start + edge - position) / edge);
  if (position > end - edge) return max * Math.min(1, (position - end + edge) / edge);
  return 0;
}

/** Use the visible client area, not the overflowing table's width or its
 * border/scrollbar box. Hit testing must stay out of the scrollbar. */
export function visibleScrollBounds(rect: { left: number; top: number }, clientWidth: number, clientHeight: number,
  viewportWidth: number, viewportHeight: number) {
  const left = Math.max(0, rect.left);
  const right = Math.min(viewportWidth, rect.left + clientWidth);
  const top = Math.max(0, rect.top);
  const bottom = Math.min(viewportHeight, rect.top + clientHeight);
  return right - left > 2 && bottom - top > 2 ? { left, right, top, bottom } : null;
}
export function dragScrollTarget(x: number, y: number, bounds: NonNullable<ReturnType<typeof visibleScrollBounds>>) {
  return { x: Math.max(bounds.left + 1, Math.min(bounds.right - 1, x)),
    y: Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, y)) };
}
