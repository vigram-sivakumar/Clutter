/**
 * The smallest single `{from, to, insert}` change that turns `current` into
 * `next` — a common-prefix/common-suffix diff, not a general (multi-hunk)
 * diff algorithm. That's deliberate, not a simplification taken for
 * expedience: `syncMarkdownIntoView`'s callers (task-checkbox toggles from
 * a different UI surface, any other single-`PageOperations.mutateBody()`-
 * style external mutation) each make one small, localized edit to an
 * otherwise-unchanged document, which a prefix/suffix diff finds exactly
 * and cheaply (no dependency, no O(n²)/Myers-diff cost). Its job here is
 * narrower than "compute a good diff" — it's "touch as little of the
 * document's position-space as possible," so that CM6's history mapping
 * (see `syncMarkdownIntoView`'s own doc comment) has the best chance of
 * keeping an *unrelated* prior user edit's undo entry intact. A full
 * `{from: 0, to: current.length, insert: next}` replace (the previous
 * behavior) touches the *entire* document's position-space on every sync,
 * regardless of how small the actual external change was — proven to be
 * more damage than the mapping can reliably recover from (see
 * `syncMarkdownIntoView`'s doc comment).
 *
 * Lives in core (not next to the editor) because `mergeConcurrentEdit` needs the same diff, and core
 * must not import from features; the editor imports it from here.
 */
export function minimalReplaceChange(
  current: string,
  next: string
): { from: number; to: number; insert: string } {
  const maxCommon = Math.min(current.length, next.length);
  let prefix = 0;
  while (prefix < maxCommon && current[prefix] === next[prefix]) {
    prefix++;
  }
  let suffix = 0;
  const maxSuffix = maxCommon - prefix;
  while (
    suffix < maxSuffix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {
    from: prefix,
    to: current.length - suffix,
    insert: next.slice(prefix, next.length - suffix),
  };
}
