# Corrections to `clutter-editor-wikilink-grammar.md`

Addendum, not a rewrite — the original document's substantive design (grammar, delimiter rules, worked examples) is unchanged. These are two precision fixes plus one requested validation. No other decision reopened.

## Correction 1 — the round-trip invariant was stated too strongly

The original claimed `parse(serialize(v)) == v` without qualification. That's wrong for any `v` (path or alias) that isn't already in normalized form, precisely *because* the writer trims leading/trailing whitespace (§6 of the original). If `v = " Project A "`, `serialize(v)` produces the trimmed canonical text, and parsing it back recovers `"Project A"`, not the original `" Project A "` — the round trip does not reproduce arbitrary input, it reproduces the *normalized* form of that input.

**Corrected statement**: `parse(serialize(v)) == normalize(v)`, where `normalize` is trim (plus whatever path-segment normalization the earlier-locked path rules already define). `parse(serialize(v)) == v` holds **only** as the special case where `v` was already normalized to begin with — it is not a general guarantee for arbitrary unnormalized input, and should not have been stated as one.

The other two invariants from the original document are unaffected by this correction and don't need restating: canonical-serialization stability still holds (normalize is idempotent, so re-serializing an already-normalized value can't drift further), and the no-silent-data-loss guarantee for unrecognized escapes was never about whitespace at all.

## Correction 2 — "reuse CommonMark escaping" is a semantic-rule reuse, not a parser-delegation

The original phrasing ("consume this exact, already-standard escape resolution for its interior text") risked being read as: the WikiLink parser can lean on the built-in `Escape` inline parser to decode its interior automatically, requiring no escape-handling logic of its own. **That's not correct, and isn't what was meant.**

Once the WikiLink parser has matched `[[` and begun its own dedicated scan for the first unescaped `|` and the first unescaped `]]`, it is consuming those characters itself, directly — it is not deferring to the general inline-parser dispatch loop for its own interior, and the generic `Escape` node never gets an independent opportunity to fire inside that range. **The WikiLink parser's own implementation must explicitly recognize `\` followed by punctuation as an escape while it scans**, character by character, in order to correctly decide whether a given `|` or `]` is significant or literal.

What "reuse CommonMark escaping" correctly means: the WikiLink parser's own escape-recognition logic should follow the **same semantic rules** CommonMark's `Escape` parser already uses elsewhere in the document (the same escapable-punctuation set, the same "backslash before non-punctuation is a literal backslash, not an error" fallback) — for consistency, and so a user never has to learn a second, incompatible escaping convention. It does not mean the interior is parsed for free by machinery that already exists elsewhere. This is an implementation obligation on the WikiLink parser, not something it gets automatically.

## Validation — escape every literal `]`, not only `]]`-forming pairs

Checked both candidates against the actual boundary case, since "smallest deterministic rule" needs to survive more than the examples already in the original document.

**The naive minimal rule — "only escape a `]` when it's adjacent to another `]` within the data" — is unsafe**, not just non-minimal. Counter-example: path = `"A]"` (a single trailing bracket, no adjacent `]` anywhere in the data itself). Serialized without escaping the trailing bracket: `[[A]]]`. Scanning for the first unescaped `]]`: the closer is found immediately after "A" (positions 1–2), leaving `path = "A"` — the intended trailing `]` was silently swallowed into the closer, and one `]` is left dangling. The data-only adjacency check misses this because the false `]]` is formed **across the boundary** between the data and the closer that gets appended after it, not from anything visible by scanning the data in isolation. The same problem applies to a `]` ending the path segment when there's no alias — it sits directly against the closer with nothing in between.

Making the conditional rule correct would require it to also check segment-boundary adjacency (is this `]` the last character before a separator or the closer?) — a position-dependent, context-sensitive rule, which is *more* complexity to specify and implement correctly than the alternative.

**Escaping every literal `]` character unconditionally, everywhere it appears in the data, is both simpler and safe.** It's a pure, context-free, per-character rule — no boundary reasoning required — and it trivially handles the counter-example above (`path = "A]"` → `[[A\]]]`, escaped trailing bracket plus the real two-bracket closer, parses back correctly). This is the smallest rule that is actually *reliable*, not merely the smallest rule that looks sufficient against the original document's examples. `\|` and `\\` don't have this issue — `|` is a single-character delimiter with no adjacent-character combination risk, so the "escape every occurrence, unconditionally" treatment for `\` and `|` in the original document was already correct as stated; only the `]` case needed this closer look, since `]]` is the one *two*-character delimiter in the grammar.

**Corrected §6 rule, precisely**: the writer escapes every literal `\`, every literal `|`, and **every individual literal `]` character** (not merely `]]`-forming pairs) in both segments, unconditionally. This replaces the original document's slightly ambiguous "`]`-forming bracket" phrasing with the unambiguous, verified-safe version.

Not reopening any other part of the design. Not moving to the next architecture question.
