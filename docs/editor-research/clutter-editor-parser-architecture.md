# Parser Architecture for Clutter Extensions — Validation

Single-question validation. No code, no files modified. Builds on the locked shared-semantic-inline-interaction decision; doesn't reopen it. One fact-check performed against `@lezer/markdown`'s own documentation (via WebFetch) to ground the claims below — noted inline where a claim rests on that source vs. is a recommendation.

## Recommendation: **A**, with one specific refinement — not B, not C, D not needed.

**Distinct Lezer node types per semantic kind** (`WikiLink`, `Tag`, `Mention`, `DateToken`, `PropertyToken`), all registered through `@lezer/markdown`'s public `MarkdownConfig` extension mechanism, all tagged with a shared node prop/group so the decoration layer can query "is this any semantic-inline node" generically without needing one generic node type. Refinement: since `@mention`, `@Today`, and `@due:2028-08-17` all share the trigger character `@`, they should be recognized by **one inline-parser function** registered once for `@`, which internally disambiguates and emits the correct distinct node type — a code-organization efficiency, not a grammar compromise, and not a step toward option B.

---

## Why (confirmed vs. recommended, stated explicitly)

**Confirmed, via `@lezer/markdown`'s own documentation** (fetched this session, not assumed from memory): the parser is configured via `.configure()` accepting `MarkdownConfig` objects (or nested arrays of them, specifically so related extensions can be grouped — the docs' own example of this grouping is GFM itself). Each config can supply `parseBlock`/`parseInline` (arrays of custom parsers — inline parsers are "called for every character" of inline content, ordered via `before`/`after` relative to named default parsers, e.g. `Link`, `Emphasis`, `Image`, `Escape`), `defineNodes` (new node types), `wrap` (for `parseMixed`-style embedded-language mounting), and `props` (custom node properties). **GFM itself — Table, TaskList, Strikethrough, Autolink — is implemented entirely through this same public mechanism, not a separate parser.** This is the single most important confirmed fact for this decision: Clutter's custom syntax would sit at exactly the same architectural layer GFM's own extensions already occupy, not below or beside it.

This directly answers the core requirement — **one coherent syntax interpretation path** — because "coherent" here has a precise technical meaning: Clutter's extensions become part of the *same* incremental Lezer parse as CommonMark/GFM, sharing the same tree, the same incremental-reparse machinery, and the same code-span/link-nesting rules automatically, rather than needing to reimplement or approximate any of that.

**Recommendation, not confirmed by the fetch**: the exact API name/shape for a shared node-group tag (I'm confident Lezer supports grouping node types via a custom `NodeProp`, since this is a standard Lezer grammar-composition pattern used elsewhere in the ecosystem, but the fetch above didn't surface the precise API surface for it) — this is flagged explicitly in §7 as needing confirmation during implementation, not asserted as verified.

---

## Why not B (one generalized `SemanticInline(kind=...)` node)

B doesn't save any parsing work — each kind still needs its own recognition logic (`[[`...`]]` bracket-matching for WikiLink; `#`+word-chars for Tag; `@`+lookahead-disambiguation for the mention/date/property family) regardless of what the resulting node is named. Since Lezer node types are cheap to declare (`defineNodes` entries), collapsing them into one generic type buys nothing at the grammar level and costs real things: worse tree-inspection/debugging ("SemanticInline" everywhere vs. a name that says what it is), no clean path to giving one kind internal sub-structure later (e.g. a future dedicated alias sub-range for WikiLink) without it looking like a special case bolted onto a type meant to be generic, and no benefit CM6's own node-name-keyed tooling (styling, `NodeType`-based queries) gets for free with named types. The "family" grouping B is reaching for is available via a shared node prop/group on N distinct types — you get both distinctness and shared queryability, which is exactly what B was trying to achieve by collapsing into one type, at no real cost.

## Why not C (a second, independent scanner/regex pass)

This is the case the user correctly suspected was risky, and the fetched facts confirm exactly why, concretely rather than abstractly: CommonMark code spans are resolved as part of the same inline pass, and content inside an already-claimed code span is never re-offered to subsequent inline parsers. **A parser registered via `parseInline` inherits this for free** — it is simply never invoked on text already consumed by `InlineCode`. A second, independent regex pass scanning the raw buffer has no way to know a given `#tag`-looking substring sits inside `` `#tag` `` unless it reimplements CommonMark's own code-span/link/emphasis nesting rules itself — which is exactly the "second parser" the requirement explicitly forbids, whether or not it's called one. This is a real, demonstrable failure mode (an inline-code-span false-positive), not a hypothetical purity concern.

## Why not D

No better mechanism was found. `wrap`/`parseMixed` — the one Lezer facility not yet discussed — is real and confirmed, but it exists for mounting a **different language's** parser into a sub-range (this is how fenced code blocks get real language-specific syntax highlighting). It's the wrong tool here: `[[page]]`/`#tag`/`@mention` are same-language, inline Markdown constructs, not embedded foreign syntax — `parseInline`/`parseBlock` extension is the correct, and confirmed-available, mechanism, and nothing else in the Lezer/CM6 toolkit is a better fit for this specific problem.

---

## How CommonMark/GFM and Clutter syntax coexist conceptually

They don't coexist as two systems reconciled against each other — **they're literally the same system**, composed at configuration time. Clutter's extensions are `MarkdownConfig` objects supplied alongside GFM's own (which is itself just an array of `MarkdownConfig` objects) when the language extension is built. There is one parser, one tree, one incremental-reparse lifecycle. "Coexistence" is really just "composition," which is the point.

**Precedence, worked through the user's specific examples** (confidence noted per case):

- **`# Heading` vs. `#tag`** — resolves automatically, no custom precedence rule needed. ATX headings require the `#` sequence to be followed by whitespace or end-of-line (core CommonMark spec, high confidence); `#tag` has no space, so it never reaches heading recognition at the block level in the first place and falls straight through to ordinary paragraph text, where a Tag inline parser can then claim it. Block-level and inline-level parsing are already separate phases in this grammar — Tag never has to "know about" headings at all.
- **`foo@bar.com` vs. `@Alex`** — mostly resolves by content shape, not precedence ordering: GFM's extended autolink email pattern requires a domain-like suffix (something with a `.`); a bare `@Alex` has no dot and wouldn't match that shape at all, regardless of which parser runs first. The genuinely uncertain edge (a mention format containing a dot, appearing directly after non-whitespace text) is flagged explicitly in §7 as needing a prototype check, not asserted as solved by reasoning alone.
- **`[text](url)` vs. `[[page]]`** — needs an explicit precedence rule: register the WikiLink inline parser with `before: "Link"` (a documented, supported ordering mechanism per the fetched API). Without this, the standard `Link` parser would attempt `[[page]]` first — CommonMark explicitly permits a matched, balanced bracket pair *inside* link text, so it would try treating the outer `[` as a link open with `[page]` as nested-bracket link text, then fail to find a following `](url)`/`][ref]`, and only then fall back to literal text. Ordering WikiLink first avoids that wasted, failure-prone attempt and claims the construct directly. High confidence — this is a well-established pattern in real CM6 wikilink implementations, not a novel technique.
- **`` `#tag` ``, `` `@Alex` ``, `` `[[page]]` `` (inside code spans)** — resolves for free, by construction, as described above: code-span content is never re-offered to later inline parsers under the shared-tree model. High confidence, and this is the strongest concrete argument the audit surfaced against option C.
- **`**[[page]]**`** — CommonMark/GFM emphasis resolution operates as a delimiter-stack pass over the already-tokenized inline content stream, composing with whatever nodes already sit inside the delimiters (this is exactly how GFM's own Strikethrough extension already has to compose correctly with Emphasis in the shipped grammar — a working precedent for the same kind of composition). Reasonably high confidence on the general composition working correctly; the exact resulting tree shape (is WikiLink a direct child of StrongEmphasis) is flagged in §7 as a detail worth a quick prototype confirmation rather than assumed with full certainty.

---

## Feature flags and parser configuration

Two distinct mechanisms, for two distinct situations:

- **Build/session-level enablement** (which capabilities exist in this app tier at all): simply include or omit the relevant `MarkdownConfig` object(s) when composing the language extension. This is confirmed as the intended use of the configuration API, not a workaround.
- **Live, in-session toggling** (e.g. a tier change without restarting the editor): CM6's `Compartment` mechanism (from `@codemirror/state`) is the standard, documented pattern for swapping a portion of an editor's extension list at runtime via a dispatched reconfiguration effect, without tearing down the whole `EditorView`. This is a general CM6 pattern, not markdown-specific, and is the correct answer to "how do we flip a flag mid-session" — flagged as a recommendation grounded in general, well-known CM6 usage rather than something the fetch above specifically confirmed for the markdown-parser case in particular.

**What happens when a feature is disabled but the buffer still contains that syntax**: nothing destructive, by construction. If the WikiLink `MarkdownConfig` isn't included, `[[Projects/Project A|2026]]` is simply never matched by any inline parser as a WikiLink — it falls through exactly the same way an ordinary unresolved `[[...]]` already does under plain CommonMark (attempted as nested-bracket link text, fails to find a destination, resolves to literal text). No decoration, no widget, no atomic behavior — plain rendered text. **The underlying buffer is never touched either way**, since decorations are strictly a read of the tree, never a write to the document — this was already a locked property of the overall architecture and nothing here weakens it.

---

## Connection to the shared semantic-inline interaction mechanism

The shared mechanism (locked in the prior decision) needs to answer one query generically: "is this range a semantic-inline construct, and if so, what kind?" — this is exactly what a shared node prop/group across the N distinct node types provides. The decoration-building `ViewPlugin` walks the tree once, and for any node carrying that shared tag, dispatches to the kind-specific descriptor (resolve/label/activate/validate) established in the prior decision. **The parser layer and the interaction layer meet at exactly one point**: a node's `kind` (derived from its distinct type, or read from a prop), handed to the shared mechanism's descriptor lookup. Nothing about the interaction mechanism needs to know how a `WikiLink` node's grammar differs from a `Tag` node's — it only needs the kind and the node's range.

---

## Parser limitations that could force a design change (§6)

None found that require changing the current design. The two soft-limitation-shaped items are really validation needs, not design flaws: (1) the exact GFM-Autolink-vs-Mention interaction at ambiguous content shapes (§ above), and (2) confirming the precise node-prop/group API name for family-tagging N node types (a naming detail, not an architectural one — worst case, an equivalent effect is achievable by having the decoration walker simply check membership in a fixed list of the N type names, which works today with zero risk, just slightly less elegant than a first-class group tag).

## Cases requiring a prototype rather than reasoning (§7)

1. `@`-family disambiguation against GFM's extended autolink at genuinely ambiguous content shapes (a mention containing a dot, directly abutting non-whitespace text).
2. Exact resulting tree shape for a semantic-inline node nested inside `Emphasis`/`StrongEmphasis` (`**[[page]]**`) — composition is expected to work; the precise shape is worth a quick empirical check before the decoration layer is written against an assumed shape.
3. The exact node-prop/group mechanism's API surface for family-tagging — a five-minute implementation-time check, not a design question, but worth doing before writing the decoration walker's "is this a semantic-inline node" check.

None of these three are architecture risks — they're the kind of narrow, cheap-to-resolve validation the earlier semantic-tokens audit already anticipated needing before implementation, not new open design questions.

---

## The one-sentence rule (for the architecture document)

> **Clutter-specific Markdown syntax is added exclusively through `@lezer/markdown`'s public `MarkdownConfig` extension mechanism — the same mechanism GFM's own extensions use — producing distinct, named node types per semantic kind that share a common tag for the interaction layer to query generically; no independent parser, scanner, or regex pass over the document is ever introduced, and disabling an extension always degrades its syntax to literal, unmodified Markdown text.**

Not implementing anything further; not opening the next architecture question.

---

Sources: [lezer-parser/markdown (GitHub)](https://github.com/lezer-parser/markdown) — fetched this session for the `MarkdownConfig`/`parseInline`/`parseBlock`/`defineNodes`/`wrap`/`before`/`after` API shape and confirmation that GFM is built on this same public mechanism. CommonMark ATX-heading whitespace requirement and code-span/link-nesting behavior are core, stable CommonMark spec knowledge, not independently re-fetched this session.
