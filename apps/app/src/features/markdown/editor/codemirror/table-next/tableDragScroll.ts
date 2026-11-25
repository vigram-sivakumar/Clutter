/** Speed in CSS px per animation frame. No scroll until the pointer
 * enters the edge zone; cap the velocity even when outside the viewport. */
export function edgeScroll(position: number, start: number, end: number, zone = 32, max = 22): number {
  if (end <= start) return 0;
  const edge = Math.min(zone, (end - start) / 2);
  if (position < start + edge) return -max * Math.min(1, (start + edge - position) / edge);
  if (position > end - edge) return max * Math.min(1, (position - end + edge) / edge);
  return 0;
}
