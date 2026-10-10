/**
 * How many template entries fit in `available` px, given each entry's width and the width of the
 * overflow entry. When every template fits there is no overflow entry, so the whole row is
 * checked against `available` on its own; otherwise the visible ones plus the overflow entry
 * (labelled with the hidden count) must fit. At least the overflow entry is always shown.
 *
 * `overflowWidth(hidden)` is the overflow entry's width for that many hidden templates.
 */
export function computeVisibleTemplateCount(
  entryWidths: readonly number[],
  overflowWidth: (hidden: number) => number,
  available: number,
  gap: number
): number {
  const total = entryWidths.length;
  const rowWidth = (count: number, withOverflow: boolean): number => {
    const parts = entryWidths.slice(0, count);
    const widths = withOverflow ? [...parts, overflowWidth(total - count)] : parts;

    return widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(widths.length - 1, 0);
  };

  if (rowWidth(total, false) <= available) {
    return total;
  }

  for (let count = total - 1; count > 0; count -= 1) {
    if (rowWidth(count, true) <= available) {
      return count;
    }
  }

  return 0;
}
