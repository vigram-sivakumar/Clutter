/**
 * Pure text-level bare-domain grammar — no Lezer dependency, matching the
 * scanner/glue split `dateScanner.ts`/`tagScanner.ts` already establish.
 *
 * Recognizes a scheme-less, `www.`-less domain (`example.com`,
 * `example.co.uk/path?q=1`) as eligible for the same `URL` node
 * `@lezer/markdown`'s own `Autolink` extension already produces for
 * `https://`/`www.`-prefixed text — see `bareDomainSyntax.ts` for how the
 * two compose (registered `after: "Autolink"`, so this parser never runs
 * on text Autolink already claimed).
 *
 * **Recognition rule** (approved after dedicated false-positive research —
 * see `docs/editor-architecture-decisions.md`'s bare-domain entry for the
 * full investigation trail, including why a purely structural "dotted
 * alnum" rule was rejected as too permissive for a technical-writing
 * editor): dot-separated DNS-shaped labels, at least two, whose final
 * label is alphabetic, length >= 2, and is either one of a small curated
 * set of common gTLDs or a real, currently-assigned two-letter ISO 3166-1
 * country-code TLD — **except** four explicitly excluded codes
 * (`md`/`sh`/`rs`/`so`) that real, documented usage shows collide with
 * common technical-writing file extensions (Markdown/shell/Rust/shared-
 * object files respectively — `.md` in particular is a near-certain
 * collision for this specific product, a Markdown editor). This is a
 * small, named, four-entry exception set, not a general file-extension
 * blacklist — every other real two-letter ccTLD is still recognized.
 *
 * Deliberately mirrors (does not import, no new dependency) `linkify-it`'s
 * own default curated-gTLD + two-letter-ccTLD split — the established,
 * widely-deployed precedent for this exact problem in the JS Markdown
 * ecosystem (`markdown-it`'s own bare-domain "fuzzy link" feature),
 * confirmed via direct research rather than invented from scratch, and
 * deliberately not a Public Suffix List / `tldts` dependency — the
 * two-letter set is the closed, essentially-static set of real ISO
 * 3166-1 alpha-2 country codes, not a growing gTLD registry.
 */

const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?';
const HOST_RE = new RegExp(`^${LABEL}(?:\\.${LABEL})+`);
const TAIL_RE = /^[/?#][^\s<]*/;

/**
 * Common gTLDs safe enough for scheme-less recognition — mirrors
 * `linkify-it`'s own default list verbatim (`biz|com|edu|gov|net|org|pro|
 * web|xxx|aero|asia|coop|info|museum|name|shop`, read directly from its
 * installed source during the false-positive research), plus `dev`/`tech`
 * — explicit product additions approved after review, not part of
 * `linkify-it`'s own default.
 */
const CURATED_GTLDS: ReadonlySet<string> = new Set([
  'biz',
  'com',
  'edu',
  'gov',
  'net',
  'org',
  'pro',
  'web',
  'xxx',
  'aero',
  'asia',
  'coop',
  'info',
  'museum',
  'name',
  'shop',
  'dev',
  'tech',
]);

/**
 * Real, currently-assigned ISO 3166-1 alpha-2 two-letter ccTLDs — copied
 * verbatim from `linkify-it`'s own generated list (its own source comment:
 * "DON'T try to make PRs with changes"), read directly from the installed
 * package during the false-positive research rather than re-derived by
 * hand (which would risk a stale/inaccurate list).
 */
const TWO_LETTER_CCTLD_RE =
  /^(?:a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw])$/;

/**
 * Real two-letter ccTLDs explicitly excluded because they collide with
 * common technical-writing file extensions in this product specifically —
 * a small, named, four-entry exception set approved after explicit
 * per-entry review, never a general file-extension blacklist. Every other
 * real ccTLD/gTLD is still recognized.
 */
const EXCLUDED_TLDS: ReadonlySet<string> = new Set(['md', 'sh', 'rs', 'so']);

function isRecognizedTld(tld: string): boolean {
  if (EXCLUDED_TLDS.has(tld)) {
    return false;
  }
  return CURATED_GTLDS.has(tld) || TWO_LETTER_CCTLD_RE.test(tld);
}

/**
 * Mirrors `@lezer/markdown`'s own (unexported, so not importable)
 * `autolinkURLEnd` trailing-punctuation trim, applied here for the same
 * reason `Autolink` applies it to its own `https://`-prefixed matches: a
 * domain at the end of a sentence (`Visit google.com.`) must not swallow
 * the closing period, and a domain inside parentheses (`(see google.com)`)
 * must not swallow the closing paren.
 */
function trimTrailingPunctuation(text: string, from: number, endIn: number): number {
  let end = endIn;
  for (;;) {
    const last = text[end - 1];
    if (last === undefined) {
      break;
    }
    if (/[?!.,:*_~]/.test(last)) {
      end--;
    } else if (last === ')' && countChar(text, from, end, ')') > countChar(text, from, end, '(')) {
      end--;
    } else {
      break;
    }
  }
  return end;
}

function countChar(text: string, from: number, to: number, ch: string): number {
  let count = 0;
  for (let i = from; i < to; i++) {
    if (text[i] === ch) {
      count++;
    }
  }
  return count;
}

export interface BareDomainMatch {
  /** The matched text, e.g. `"example.co.uk/path"` — never rewritten. */
  readonly text: string;
  /** Offset within the original `text` argument, one past the last matched character. */
  readonly end: number;
}

/**
 * Scans for a scheme-less bare domain starting exactly at `offset` in
 * `text`. Returns `null` if no dot-separated DNS-shaped host is found at
 * that exact position, or if its final label isn't a recognized TLD
 * (`isRecognizedTld`). Does not itself check word-boundary/preceding
 * context or the starting character's alphanumeric-ness — that's
 * `bareDomainSyntax.ts`'s responsibility, mirroring the same scanner/
 * syntax split `dateScanner.ts`/`tagScanner.ts` already use.
 */
export function scanBareDomain(text: string, offset: number): BareDomainMatch | null {
  const hostMatch = HOST_RE.exec(text.slice(offset));
  if (!hostMatch) {
    return null;
  }

  const host = hostMatch[0];
  const labels = host.split('.');
  const tld = (labels[labels.length - 1] ?? '').toLowerCase();
  if (!/^[a-z]+$/.test(tld) || tld.length < 2 || !isRecognizedTld(tld)) {
    return null;
  }

  let end = offset + host.length;

  const tailMatch = TAIL_RE.exec(text.slice(end));
  if (tailMatch) {
    end += tailMatch[0].length;
  }

  end = trimTrailingPunctuation(text, offset, end);

  return { text: text.slice(offset, end), end };
}
