// Half-open model ranges. A boundary insertion is outside; an interior one touches.
// Shared by both experimental guards; ranges are derived metadata, never content.
export function touches(range, from, to) {
  return from === to
    ? from > range.from && from < range.to
    : from < range.to && to > range.from;
}
export function mapRange(range, mapping) {
  const from = mapping.map(range.from, 1),
    to = mapping.map(range.to, -1);
  return { ...range, from: Math.min(from, to), to: Math.max(from, to) };
}

export function validRange(range) {
  return (
    !!range &&
    Number.isSafeInteger(range.from) &&
    Number.isSafeInteger(range.to) &&
    range.from >= 0 &&
    range.to > range.from
  );
}

// Derived model-coordinate journal entry, shared by local and durable projections.
export function documentChange(before, after, origin, version) {
  const start = before.content.findDiffStart(after.content) ?? 0,
    end = before.content.findDiffEnd(after.content);
  let to = end?.a ?? before.content.size,
    newTo = end?.b ?? after.content.size;
  const overlap = Math.max(0, start - Math.min(to, newTo));
  to += overlap;
  newTo += overlap;
  return { version, origin, from: start, to, newTo };
}
