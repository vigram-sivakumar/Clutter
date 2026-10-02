/**
 * The string-value rules for free-text frontmatter list items (`aliases`),
 * shared by FrontmatterParser and FrontmatterSerializer so a value always
 * reads back exactly as it was written.
 *
 * Writing quotes only when a plain value would be misread — by this parser
 * or by any YAML reader (Obsidian, static-site generators) — so ordinary
 * aliases stay unquoted, as hand-written frontmatter usually has them.
 */

/**
 * Plain-scalar hazards: a YAML indicator character first, `: ` or ` #`
 * inside, a trailing `:`, or a value YAML would read as a non-string
 * (boolean, null, number).
 */
const NEEDS_QUOTES =
  /^[-?:,[\]{}#&*!|>'"%@`]|: | #|:$|^(?:true|false|null|yes|no|on|off|~)$|^[-+]?(?:\d|\.\d)/i;

/** A frontmatter-safe rendering of `value`: plain when safe, else double-quoted with `\` and `"` escaped. */
export function quoteFrontmatterString(value: string): string {
  if (!NEEDS_QUOTES.test(value)) {
    return value;
  }

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The string a raw frontmatter value denotes: a double-quoted value with
 * its `\\`/`\"` escapes undone, a single-quoted value with `''` undone, or
 * the plain value trimmed.
 */
export function unquoteFrontmatterString(raw: string): string {
  const value = raw.trim();

  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }

  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  return value;
}

/**
 * The raw items of a one-line YAML flow sequence (`[a, "b, c", 'd']`) —
 * commas inside quotes don't split — each trimmed but still quoted.
 * Returns null when `raw` isn't a bracketed sequence; `[]` gives [''].
 */
export function splitFlowSequence(raw: string): string[] | null {
  const value = raw.trim();

  if (!value.startsWith('[') || !value.endsWith(']')) {
    return null;
  }

  const items: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  const inner = value.slice(1, -1);

  for (let index = 0; index < inner.length; index++) {
    const char = inner[index]!;

    if (quote) {
      current += char;
      if (char === '\\' && quote === '"' && index + 1 < inner.length) {
        current += inner[++index];
      } else if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ',') {
      items.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  items.push(current.trim());

  return items;
}

/**
 * The items of a one-line YAML flow sequence, each unquoted — see
 * splitFlowSequence. Returns null when `raw` isn't a bracketed sequence.
 */
export function parseFlowSequence(raw: string): string[] | null {
  return splitFlowSequence(raw)?.map(unquoteFrontmatterString) ?? null;
}
