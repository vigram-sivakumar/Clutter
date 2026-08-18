# WikiLink Grammar, Escaping & Serialization

Single-question validation. No code, no files modified. Builds on every prior locked decision — including the outer precedence/continuation-lookahead rule (`before: "Link"` + trailing-continuation check) — without reopening any of them. This document is entirely about what happens *inside* an already-correctly-bounded `[[...]]` capture.

## The one design move that resolves nearly everything: reuse CommonMark's own backslash escaping, don't invent a second one

CommonMark already defines backslash-escaping for all ASCII punctuation (`!"#$%&'()*+,-./:;<=>?@[\]^_\`{|}~`), already implements it as a first-class inline construct (the `Escape` parser, confirmed present by name in the fetched `@lezer/markdown` default parser list), and already defines precisely what an *unrecognized* escape means (`\` followed by a non-punctuation character is a literal backslash plus that character, not an error). Every one of `|`, `]`, `[`, `\` is already CommonMark-escapable punctuation. **WikiLink content should consume this exact, already-standard escape resolution for its interior text, and layer WikiLink-specific *significance* on top of exactly two characters: the first unescaped `|`, and an unescaped `]]`.** This is the single decision that makes §3–§5 below resolve cleanly instead of needing a bespoke grammar, and it directly satisfies "do not accidentally create a second incompatible escaping language inside Markdown" — there isn't a second language; it's the same one.

---

## 1. Character legality — most things need no escaping at all

| Character(s) | Legal in a vault path | Legal in a WikiLink segment as-is | Needs escaping | Rejected at insertion | Tolerated on read |
|---|---|---|---|---|---|
| `\|` | Yes (nothing forbids it structurally) | **No — syntactically significant** | Yes, whenever it appears in the path segment or is meant literally | N/A (escaped automatically by Clutter's writer, §6) | Yes, when escaped |
| `]]` (as a substring) | Yes | **No — syntactically significant** (see §4) | Yes, whenever meant literally | N/A (escaped automatically) | Yes, when escaped |
| `\` | Yes | **No — it's the escape character itself** | Yes, `\\` for a literal backslash | N/A | Yes |
| `]` (single, not forming `]]`) | Yes | Yes, unambiguous | No | — | Yes |
| `[`, `[[` (mid-content) | Yes | Yes — deliberately **not** treated as a nested WikiLink start (see below) | No | — | Yes |
| `/` | Yes (it's the path separator, handled at the `VaultPath` layer, not this grammar) | Yes | No | — | Yes |
| spaces | Yes | Yes | No | — | Yes |
| `#`, `@`, `:`, `(`, `)` | Yes | Yes — none are meaningful once inside an already-matched WikiLink capture; the general inline dispatcher isn't re-invoked character-by-character inside it | No | — | Yes |
| Unicode | Yes (subject to whatever `core/shared/naming` already permits — **`[UNCERTAIN]`**, not independently confirmed this session) | Yes, byte/codepoint-transparent | No | — | Yes |
| leading/trailing whitespace | N/A — a normalization question, not a legality one | — | — | Trimmed by Clutter's writer (§6) | Trimmed for semantic value, buffer left untouched |

**Deliberate simplification worth stating explicitly**: an inner `[[` never starts a nested WikiLink. Once the outer parser has committed to scanning WikiLink content, it is scanning for exactly two things — an unescaped `|` and an unescaped `]]` — and nothing else re-triggers block/inline dispatch inside that scan. WikiLinks don't nest; there's no product reason they should, and ruling it out removes an entire category of ambiguity for free.

**Net result**: only three things are syntactically significant to this grammar at all — `|`, `\`, and `]]` — everything else in the requested character list is safely literal. This is the "smallest grammar that gives reliable round-tripping" the question asks for, not an oversight.

---

## 2. The separator rule, challenged and refined

"First unescaped `|` before the closing `]]`" is close but needs one precision the original phrasing didn't state: **it's the first unescaped `|`, and only the first — any further unescaped `|` characters are not additional separators, they're just alias text.** This single refinement is what makes every one of the given examples resolve without new special-casing:

- `[[Notes | Ideas]]` → first unescaped `|` is the separator → **path = "Notes", alias = "Ideas"** (after trimming, §6). This is the *only* valid reading — a raw, unescaped `|` in this position can never mean "a single path containing a literal pipe." If that's what's meant, it must be escaped.
- `[[Notes \| Ideas]]` → the only `|` present is escaped → not a separator at all → **path = "Notes | Ideas", no alias.**
- `[[Notes | Ideas \| 2026]]` → first *unescaped* `|` (right after "Notes") is the separator; the escaped `\|` later is just literal alias content → **path = "Notes", alias = "Ideas | 2026"** (the escape resolves to a literal pipe *inside* the alias value — escaping something not strictly required, as here, is always safe and never an error).
- `[[A\|B]]` and `[[A|B|C]]` — worked together, since they demonstrate the rule cleanly: `[[A\|B]]` → escaped, no separator → path = "A|B", no alias. `[[A|B|C]]` → first unescaped `|` (after "A") is the separator, everything remaining is alias text verbatim → **path = "A", alias = "B|C"** — the alias legitimately contains an unescaped pipe, and that's fine, because the grammar only ever recognizes one separator position.

**Consequence worth naming plainly**: escaping is only ever *required* for a `|` that appears in the *path* portion. A `|` occurring naturally within the alias never needs escaping, because by the time it's reached, the separator question is already settled. This asymmetry isn't an inconsistency — it falls directly out of "first match wins, nothing after it is re-interpreted."

---

## 3. Escaping mechanism

**Backslash escapes exactly one following character, always — never a multi-character sequence.** `\|`, `\]`, `\\`, `\[` are all valid, and all inherited directly from CommonMark's existing escapable-punctuation set rather than defined freshly for this grammar. No combined "escaped closing pair" token exists — a literal `]]` is written as two separately-escaped brackets, `\]\]` (traced precisely in §4).

**Is `\[` actually needed?** Not for disambiguation — nothing about `[` or `[[` is ambiguous inside a WikiLink capture (§1). But since `\[` is *already* a standard, meaningful CommonMark escape outside any WikiLink context, there's no reason to special-case-reject it inside one — a cautious user who habitually escapes bracket-like characters gets the literal `[` they expect rather than a confusing literal backslash. Inherit the full set; don't carve out a narrower one just because only two characters strictly need it.

**`serialize(parse(x)) == x` and `parse(serialize(v)) == v`**, both directions, hold by construction — not hoped for, provable from two design choices already made: (1) the writer uniformly escapes every literal `\`, `|`, and `]`-forming-bracket in both segments regardless of position (§6), and (2) `serialize()` is a **pure function of the semantic `(path, alias)` value alone — never of whatever raw text it might be "re-serializing."** That second point is what additionally guarantees the *canonical stability* invariant from §8 (re-serializing already-canonical text can't drift, since the output depends only on the decoded value, not on the input's formatting).

---

## 4. Closing delimiter ambiguity — traced precisely

**Rule: `]]` always terminates at the first *unescaped* occurrence (lazy match), full stop.** Rejected the alternative (greedy/longest-match) deliberately: greedy matching would make a WikiLink's boundary depend on whatever text happens to follow it later in the paragraph — unbounded lookahead sensitivity, much worse than lazy matching's simple, local, predictable behavior. Every other bracket-delimited CommonMark construct (code spans, links) already resolves via nearest-match scanning, not greedy — this is consistent with existing precedent, not a new convention invented here.

Traced against the given examples:

- **`[[A]]B]]`** → first unescaped `]]` found immediately after "A" → **path = "A"**, closes there; `B]]` is ordinary trailing text after the construct, not part of it.
- **`[[A\]\]B]]`** → `\]` then `\]` are two separately-escaped literal brackets (not a combined escape — §3), followed by "B", followed by the real, unescaped closer → **path = "A]]B"**. This is the correct way to get a literal `]]` substring inside a path.
- **`[[A]]]]`** → same rule as the first example, no special-casing needed: first unescaped `]]` closes right after "A" → **path = "A"**; the remaining `]]` is trailing literal text. The rule already established generalizes to this case without needing anything extra.
- **`[[foo\]]`** — worth tracing in full because it's genuinely subtle and could surprise someone: after "foo", the characters are `\`, `]`, `]`. `\]` consumes two characters as one escaped literal `]`, leaving a single, un-paired `]` — which is **not** a valid closer (a closer needs two consecutive *unescaped* brackets). Scanning continues, finds nothing further before input ends → **the whole match fails**, falls through to ordinary text (§9). To actually get `path = "foo]"` successfully closed, one more character is needed: `[[foo\]]]`. Flagging this explicitly since `[[foo\]]` looking almost-right is exactly the kind of case worth stating precisely rather than leaving to intuition.

A literal `[` never needs this kind of analysis at all — per §1, it's never ambiguous, so there's nothing to trace.

---

## 5. Backslash semantics — reuse, don't reinvent (see the opening section)

Reusing CommonMark's own escape rules wholesale, rather than defining a WikiLink-specific subset, is the recommendation — for a stronger reason than convenience: it means WikiLink's own "what does a malformed escape do" question doesn't need its own answer, because CommonMark already has one, and it's exactly the behavior needed here too (§8, no-silent-data-loss). Worked examples:

- `[[A\|B]]` → escaped pipe, not a separator → path = "A|B", no alias.
- `[[A\\B]]` → escaped backslash → path = "A\B" (one literal backslash), the following characters are ordinary.
- `[[A\]B]]` → `\]` is one escaped literal `]`, followed by "B", followed by the real closer `]]` → path = "A]B".

---

## 6. Canonical serialization

Given `path = "Projects/Notes | Ideas"`, `alias = "Ideas | 2026"` (both containing meaningful literal pipes), the canonical form Clutter writes is:

```
[[Projects/Notes \| Ideas|Ideas \| 2026]]
```

**The writer escapes every literal `\`, `|`, and `]`-forming bracket in *both* segments, unconditionally — not just where §2 shows it's strictly required.** This is a deliberate simplification, not an oversight: a position-sensitive writer ("escape pipes in the path, but not the alias, since alias-position pipes don't strictly need it") would be *more* special-casing for no benefit, and would be fragile against any future grammar change. One uniform rule, applied identically to both segments, is simpler to get right and easier to keep right.

- **`[[path|]]` (empty alias)**: parses successfully with an empty-string local alias — but recommend the empty string is treated as equivalent to *no local alias* for display-precedence purposes (§ earlier document's precedence chain: target alias, else filename). An empty alias is never useful data on its own; falling back to the normal chain instead of literally rendering nothing is the more sensible interpretation. `[DECISION]`, but a low-risk, well-motivated default.
- **Whitespace around `|`**: no special meaning attaches to whitespace adjacent to the separator itself — it's just leading/trailing whitespace of whichever segment it borders, governed by the next rule.
- **Leading/trailing whitespace in path/alias**: trimmed by Clutter's own writer when producing canonical text, and trimmed when computing the *semantic* value during resolution/display of existing text — but **never** as an active rewrite of already-existing buffer content, per the already-locked "don't rewrite non-canonical existing text just because it was parsed" principle, reapplied here rather than invented fresh.
- **Unicode**: emitted literally, no transformation.
- **`/` always used in paths**: confirmed, unchanged from the earlier path-normalization decision — not re-litigated here.

---

## 7. CommonMark interaction — nothing new introduced

Checked against every construct listed:

- `` `[[literal]]` `` — irrelevant to this grammar entirely; code-span content is never re-offered to WikiLink's parser (already established). The escaping rules inside a range that's never scanned don't come into play.
- `**[[Page]]**` — the escaping grammar operates entirely within WikiLink's own captured range, disjoint from the surrounding `**` markers. No interaction.
- `![[image]]` — the same grammar (separator rule, closing rule, escaping) applies identically, just with a leading `!`. Not a new design, a direct reuse.
- `[[foo]](url)` — governed entirely by the already-locked continuation-lookahead check, which runs *after* this document's rules determine where the real closer is. No interaction between the two — the escaping grammar doesn't change what "the closer" means, only makes sure it's found correctly first.

**Answer: no, the escaping/serialization grammar introduces nothing new here** — it composes cleanly underneath the already-locked precedence rule without touching it.

---

## 8. Round-trip invariants — stated as provable properties, not aspirations

- **Semantic round-trip** (`parse(serialize(path, alias)) == (path, alias)`): holds by construction, given the writer's uniform-escaping rule (§6) and a parser that correctly reverses CommonMark-style escapes.
- **Canonical stability** (repeated serialization doesn't drift): holds because `serialize()` is defined as a pure function of the *decoded* `(path, alias)` value only, never of the original raw text — there's nothing for repeated application to drift against.
- **Read compatibility**: by design, the parser is deliberately lenient (tolerates un-escaped-but-unambiguous text, any valid CommonMark escape, non-canonical-but-valid path forms) while the writer alone is strict/canonical — the same lenient-reader/strict-writer split already used for path normalization, reapplied here.
- **No silent data loss on malformed/unsupported escapes**: there is no "malformed escape" state that loses anything. `\` followed by a non-punctuation character (e.g. `\q`) is, per CommonMark's own rule, simply *not* a recognized escape — both characters are preserved literally, exactly as the rest of the document already handles this same situation everywhere else. Nothing is silently reinterpreted; nothing is dropped.

---

## 9. Invalid WikiLinks

**Governing principle stated first, since it answers every case at once: the WikiLink parser never produces a partial node. It's all-or-nothing — either a complete, validly-closed `[[...]]` structure is found, or nothing is produced at all and the entire span remains ordinary text.** A "partial" node was considered and rejected: it would be an ill-defined state with no clear meaning under the shared interaction mechanism (what would engaging or deleting a "partial" WikiLink even do?) — ruling it out entirely is simpler and more consistent with "the tree is disposable, the buffer is authoritative."

- `[[`, `[[foo`, `[[foo|`, `[[foo|bar` — none have a valid closer before input ends. All fail entirely, regardless of how complete the preceding content looks. Falls through to ordinary literal text.
- `[[foo||bar]]` — resolves via the *existing* general rule with no new case needed: first unescaped `|` (right after "foo") is the separator; the second `|` is just the first character of the alias text → **path = "foo", alias = "|bar"**. Worth stating explicitly that this needed no special-casing — a good sign the §2 rule is actually general, not example-specific.
- `[[foo\]]` — traced in full in §4: fails entirely (one character short of a valid close), falls through to literal text.
- `[[foo\q]]` — `\q` isn't a recognized escape (not punctuation) → literal "\q" preserved → real closer found right after → **succeeds, path = "foo\q"**. Direct, concrete confirmation of the §8 no-data-loss invariant.
- `[[foo]](url)` — unchanged, governed entirely by the already-locked continuation-lookahead rule; not reopened or re-derived here.

---

## Deliverable summary

1. **Grammar**: `[[` + path-content + optional (first unescaped `|` + alias-content) + first unescaped `]]`. Content is scanned using CommonMark's standard backslash-escape rules; nothing else inside the capture is syntactically special.
2. **Escaping**: single-character backslash escapes only, inherited wholesale from CommonMark's escapable-punctuation set. No multi-character escape sequences.
3. **Delimiters**: first unescaped `|` (if any) is the one and only separator; first unescaped `]]` always terminates (lazy match); no nested `[[...]]`.
4. **Canonical serialization**: writer escapes every literal `\`/`|`/`]`-forming-bracket in both segments unconditionally, trims leading/trailing whitespace, emits Unicode literally, uses `/`-separated extensionless normalized paths (per the earlier-locked path rule).
5. **Lenient reading**: tolerates non-canonical-but-valid text (extra whitespace, `.`/`..`, un-needed-but-valid escapes, any standard CommonMark escape) without ever rewriting it just because it was parsed.
6. **Example table**:

| Input | Path | Alias | Canonical form | Valid? |
|---|---|---|---|---|
| `[[Projects/Project A]]` | `Projects/Project A` | — | unchanged | Valid |
| `[[Notes \| Ideas]]` | `Notes \| Ideas` | — | unchanged | Valid |
| `[[Notes | Ideas]]` | `Notes` | `Ideas` | unchanged | Valid |
| `[[A|B|C]]` | `A` | `B|C` | unchanged | Valid |
| `[[A\]\]B]]` | `A]]B` | — | unchanged | Valid |
| `[[foo||bar]]` | `foo` | `|bar` | unchanged | Valid |
| `[[foo\q]]` | `foo\q` | — | unchanged | Valid |
| `[[path|]]` | `path` | `""` (treated as no local alias for display) | `[[path]]` if re-normalized | Valid, edge case |
| `[[` / `[[foo` / `[[foo|` / `[[foo|bar` | — | — | — | Invalid — falls through to literal text |
| `[[foo\]]` | — | — | — | Invalid — one character short of a valid close, falls through |
| `[[foo]](url)` | n/a | n/a | n/a | Not a WikiLink at all — ordinary CommonMark link, per the already-locked continuation rule |

7. **Invariants**: semantic round-trip (both directions), canonical-serialization stability, lenient-read/strict-write asymmetry, no-silent-data-loss on unrecognized escapes — all four stated as provable consequences of the design choices above, not separately-asserted hopes.
8. **Genuinely unresolved**:
   - Whether `[[path|]]`'s empty alias should be display-equivalent to "no alias" (recommended: yes) — a real, if low-stakes, product call.
   - Exact Unicode/case-sensitivity behavior at the vault-path layer — flagged honestly as uncertain, needs confirming against `core/shared/naming`/`VaultPath`'s actual existing behavior rather than assumed here.

Answered this question only. Not opening the next one.
