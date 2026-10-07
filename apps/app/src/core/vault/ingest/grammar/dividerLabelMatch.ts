/**
 * Shared label-extraction logic for Clutter's own divider variants
 * (`WavyHorizontalRule`/`DoubleHorizontalRule`/`DottedHorizontalRule`, plus
 * the new label-only `LabeledHorizontalRule` for the native `---` rule) —
 * used by both the block parsers (`*HorizontalRuleSyntax.ts`, to decide
 * whether a line matches at all) and `horizontalRuleDecoration.ts` (to
 * re-derive the label text at render time from the same node range,
 * rather than threading it through a second Lezer child node).
 *
 * Grammar stays unchanged for the bare, unlabeled forms (`~---~`/`=---=`/
 * `.---.`): those remain a single exact-match case per
 * `matchWrappedDivider`, checked first. The labeled form is a second,
 * additive case on the *same* node type — `char + '---' + label + '---' +
 * char` — never a variant tag, so the existing unlabeled at-rest decoration
 * path (`hrLineAtRest` in `horizontalRuleDecoration.ts`) is completely
 * unaffected by this addition.
 */
export interface WrappedDividerMatch {
  readonly label: string | null;
}

export function matchWrappedDivider(text: string, char: string): WrappedDividerMatch | null {
  const trimmed = text.trim();
  const bare = `${char}---${char}`;
  if (trimmed === bare) {
    return { label: null };
  }

  const prefix = `${char}---`;
  const suffix = `---${char}`;
  if (trimmed.length <= prefix.length + suffix.length) {
    return null;
  }
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(suffix)) {
    return null;
  }

  const label = trimmed.slice(prefix.length, trimmed.length - suffix.length).trim();
  return label.length > 0 ? { label } : null;
}

/**
 * The straight-rule labeled form (`---Text---`, `--- Chapter 1 ---`) has no
 * wrapping character to key off of — plain `---` stays native CommonMark
 * `HorizontalRule`, so this only ever matches the *labeled* case, gated by
 * requiring at least one non-`-`/whitespace character in the line (a bare
 * run of dashes, of any length or internal spacing, is always a thematic
 * break — e.g. `------` or `- - -` — never a label, so it's left for the
 * native parser rather than misclassified here).
 */
export function matchStraightLabeledDivider(text: string): string | null {
  const trimmed = text.trim();
  const prefix = '---';
  const suffix = '---';
  if (trimmed.length <= prefix.length + suffix.length) {
    return null;
  }
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(suffix)) {
    return null;
  }
  if (/^[-\s]*$/.test(trimmed)) {
    return null;
  }

  const label = trimmed.slice(prefix.length, trimmed.length - suffix.length).trim();
  return label.length > 0 ? label : null;
}
