# Clutter Editor — Semantic-Inline-Tokens Architecture Audit

Research/audit only. No code, no file changes. Builds directly on the four existing documents (interaction spec v0.2, architecture decisions, architecture proposal, implementation plan) plus `ARCHITECTURE_RULES.md`/`durability-model.md` already read in this session — not re-derived here. Confidence is stated per claim; CommonMark/GFM spec claims are core, stable spec knowledge (high confidence); CM6/Lezer extension-mechanism claims are stated with their basis rather than a live citation, since no new fetch was performed for this pass.

---

## 1. Executive assessment

**The direction is fundamentally sound, with one real structural gap.** Markdown-buffer + decoration-presentation via CM6 remains the right call — nothing in this new context (paths-not-IDs, alias display labels, `#tags`/`@mentions`/`@dates`) changes that. The gap: **the existing docs designed the reveal-on-engagement mechanism for exactly one token type (`[[links]]`) and explicitly deferred generalizing it "until repetition exists" (implementation plan, Phase 6).** That sequencing was correct for *implementation order*, but you're now asking for `#tags`, `@mentions`, `@Today`, `@due:2028-08-17` up front — which means the **architecture** (not the build order) needs to support a family of similar-but-distinct inline constructs from the start, or Phase 6→7 will force a redesign exactly where the plan currently assumes a "small, mechanical addition." This is the central finding of this audit, and everything below elaborates on it.

Second-order finding: the current docs never addressed **syntax precedence** between Clutter's custom triggers and CommonMark/GFM's own grammar. This wasn't wrong to skip earlier (no custom triggers were specified yet); it's now a real gap given `#`, `@`, and `[[` all sit close to existing Markdown/GFM meaning.

---

## 2. Critical gaps

**A. No owning facade for cross-document reference maintenance.** "If a user changes an alias, Clutter may update references that use it" and "if the watcher confidently detects a move, references may be updated" are both **bulk rewrites of *other* pages' bodies**, not something the currently-open editor instance can do or should attempt. This is new capability surface with no existing owner — `PageOperations` today owns one page's lifecycle, not cross-vault find-and-replace. Per `ARCHITECTURE_RULES.md` Rule 1 (one owning facade) and Rule 2 (one write path through the Persistence Gate), this needs an explicit owner decided *before* implementation touches it — it's the single biggest gap in this audit, bigger than anything editor-internal.

**B. `#tag` vs. ATX headings — resolves cleanly, but should be stated as a locked rule, not assumed.** CommonMark requires an ATX heading's `#` sequence to be followed by whitespace or end-of-line; `#tag` (no space) is never a valid heading under the spec. High confidence, core spec behavior — no collision, but write this down as a locked precedence rule rather than leaving it implicit, since the next person touching tag-parsing code shouldn't have to re-derive it.

**C. `@mention`/`@date` vs. GFM extended autolinks.** GFM's autolink extension recognizes bare email-like text (`user@domain.tld`) and linkifies it without requiring `<>`. An `@mention` trigger implemented as a naive "`@` followed by word characters" regex will collide with ordinary email addresses appearing in prose. This needs an explicit precedence rule (see §3) — not previously identified anywhere in the existing docs.

**D. Nesting of a reference inside inline formatting** (`**[[Page]]**`, `` `#tag` `` inside code — though the latter should just not trigger at all, see §3) — is architecturally fine *if* Clutter's custom constructs are parsed as real nodes in the same Lezer syntax tree (decorations key on disjoint character ranges, and CM6/Lezer's tree walk already handles nested nodes), but is a real correctness risk if implemented as a second, bolted-on regex pass running independently of the tree. This is worth a hard architectural decision now (§3), not an implementation detail to discover later.

**E. Unresolved-reference display state.** A reference pointing at a path that doesn't currently exist needs its own at-rest visual treatment (distinct from a resolved one) — not called out anywhere yet, small but easy to miss since it only shows up once real vault content is involved.

**F. External update arriving while a token is mid-engagement.** The implementation plan's external-change handling only considered whole-editor focused/unfocused; it never considered "a token *inside* the document is in its engaged/raw-edit sub-state." Narrow edge case, but genuinely new — not a restatement of anything already covered.

---

## 3. Recommended Markdown capability layers

| Layer | Contents | Flagging |
|---|---|---|
| **0 — CommonMark core** | Paragraphs, headings, emphasis/strong, code spans, links, images, blockquotes, lists, code blocks, thematic breaks, line breaks | Always on, never flagged |
| **1 — GFM, selectively** | Task list checkboxes, strikethrough, autolinks; tables available as a capability even though the implementation plan defers turning it on for v1 | Flaggable, but off-by-default items still parse harmlessly if a document already contains them (GFM constructs degrade to plain text if unregistered, same safety property as Layer 2) |
| **2 — Clutter knowledge-management extensions** | `[[path]]` / `[[path\|alias]]`, `#tag`, `@mention`, `@date` shorthand, `@key:value` semantic refs — one shared node family (§5), each independently flaggable | This is the layer this audit is mostly about |
| **3 — Optional/future, not designed now** | Footnotes, callouts, embeds/transclusion, `==highlight==`, definition lists, math | Deliberately out of scope; the layering exists so adding these later is additive if (and only if) they're built through the same Layer-2 mechanism |

**Locked precedence order, top to bottom**: CommonMark > GFM > Clutter Layer 2. A Layer 2 construct must never change the meaning of anything valid at Layers 0–1 (confirmed clean for `#tag`; needs an explicit disambiguation rule for `@mention` vs. autolink email, recommended: an autolink-shaped match wins over a mention match when both could apply — i.e. `foo@bar.com` stays a plain email link, `@alice` (no dot-domain shape) is a mention).

**Missed construct worth naming**: CommonMark's **reference-style links** (`[text][ref]`, shortcut `[foo]` resolved via a separate `[foo]: url` definition elsewhere in the document) — not a collision with `[[..]]` (double brackets don't match single-bracket reference syntax), but worth confirming explicitly rather than assuming, since it's the one CommonMark link form the existing docs never mention alongside inline links.

---

## 4. Extension / feature-flag architecture

**Where flags should live**: at the **syntax-extension registration point** — which Lezer parser extensions are included when the markdown language config is built. Disabling a feature means simply not registering its parser extension. This is the whole mechanism, and it has a load-bearing safety property worth stating explicitly: **an unregistered construct's raw text just sits in the buffer as inert, undecorated plain text** — nothing breaks, nothing is lost, and re-enabling later requires zero data migration, because the buffer never stopped being plain markdown. This is a direct, concrete payoff of the markdown-buffer architecture already chosen, specific to the feature-flag requirement — worth stating in the executive summary of whatever this becomes.

**Bundle per capability, don't scatter conditionals**: each Layer-2 construct should be a single "capability descriptor" — `{ syntaxExtension, decorationBuilder, commands?, autocompleteSource? }` — assembled conditionally when the full extension list is composed. The anti-pattern to avoid explicitly: `if (tagsEnabled) { ... }` checks sprinkled through a shared decoration builder or command file. One file per capability (matches the implementation plan's existing `codemirror/` file-per-concern structure), composed at startup, not branched at runtime inside shared code.

**What should NOT be feature-flagged**: the reveal-on-engagement mechanism itself, grapheme-safe editing, undo/redo, IME safety — these are infrastructure every capability sits on, not a capability in their own right.

---

## 5. Unified semantic-inline model

All of `[[path]]`, `[[path|alias]]`, `#tag`, `@mention`, `@Today`, `@due:2028-08-17` should share:

- **One Lezer node family** ("inline reference," discriminated by a `kind` field), registered via the same inline-parser-extension mechanism GFM's own Strikethrough/Autolink/Table extensions use in `@codemirror/lang-markdown` — this is the concrete architectural decision that makes §2-D's nesting concern a non-issue and avoids ever building a second, parallel detection pass.
- **One decoration/engagement implementation**, parameterized by kind — same at-rest/engaged state machine, same atomic-range behavior, same click-vs-arrow-key engagement trigger already designed for `[[links]]` in the implementation plan's Phase 6, now explicitly generalized rather than assumed-to-generalize-later.
- **One resolver contract, split by sync/async need** — this is a real, previously-unstated distinction: reference/tag/mention **label resolution must be synchronous** (backed by an in-memory, already-current index the app layer maintains — e.g. something `EffectivePageState`-shaped), while **asset resolution is properly async** (already correctly designed that way in Phase 9). Don't force one contract shape onto both.
- **One autocomplete trigger-dispatch** (`[[`, `@`, `#`, later `/`) sharing popup UI and keyboard nav, differing only in candidate source per trigger — matches Phase 7's already-recommended single generic provider, now explicitly extended to also cover at-rest label resolution, not just insertion-time candidates.

**Two things that genuinely differ by kind and should not be forced into one shape**: (a) what "engage" *means* — for `[[links]]` and `@mentions`, engaging reveals raw text for editing; for `@due:2028-08-17`, a future date-picker affordance might replace "reveal raw text" entirely — the shared mechanism should carry a per-kind "activate" behavior, not assume all kinds want the same interaction once engaged. (b) what "click" (not engage) does — `[[links]]` open the page; `@mentions` might open a person/profile view later; `#tags` might filter a tag view — again, per-kind dispatch under one shared click/engage-vs-activate distinction, not five separate click handlers wired independently.

**Display-label clarification** (the spec's wording slightly conflates two things worth separating): (1) what's *literally written* in the buffer (`[[path]]` vs. `[[path|alias]]` — a serialization choice made when a reference is created/normalized, e.g. by autocomplete acceptance preferring the alias form per your stated decision), vs. (2) what's *rendered at rest* (always resolved live from the current index, regardless of whether the buffer happens to already have an explicit `|alias` segment, since even a bare `[[path]]` needs a human-readable label rendered). These are different mechanisms — (1) is a one-time write-time choice, (2) is a live, every-render lookup — and conflating them risks building only one and assuming it covers both.

---

## 6. Live Preview risks

- **Dense-reference lines** ("Meeting with @Alice about #project-x due @due:2028-08-17") are the main new stress case: multiple adjacent atomic ranges, correctness risk at their boundaries, and felt-UX risk (rapid engage/disengage flicker as the cursor crosses several short tokens in sequence) — this extends, rather than replaces, the reveal-transition prototype gate already planned in the implementation plan's Phase 5; it should explicitly include a dense multi-token fixture, not just isolated single-token cases.
- **Boundary interaction between two different decoration types stacked adjacently** (a token immediately after a bold-close marker) needs explicit test coverage — not something each type's isolated tests will catch on their own.
- **Selection-only changes (engaging/disengaging a token) must never produce an undo-history entry** — true of CM6 by default, but worth locking in as an explicit, tested requirement rather than an assumption, since token-engagement is a new kind of view-state transition the existing undo design didn't previously have to consider.
- **IME inside an engaged token** (renaming a page reference in a CJK input method) is a genuinely distinct code path from ordinary paragraph editing and needs the same composition guard applied there too — easy to miss if the guard is wired per-command rather than centrally, which is exactly why the implementation plan's "one central guard" design (Phase 6's dependency on Phase 2/4's guard) matters here specifically.
- **Accessibility**: an at-rest widget rendering a resolved label (e.g. "Project A") needs an explicit ARIA role/accessible name (role≈link, name including the resolution target) — not automatic, needs deliberate design as part of the shared mechanism in §5, not per-type later.
- **Performance**: label resolution must be cheap/synchronous per §5 — if the app-layer provider is index-backed this is fine; if it's ever a linear scan per token per decoration pass, that's a real trap. This is a contract the *provider* (outside the editor boundary) must honor, but worth naming since the editor's own perceived performance depends on it.

---

## 7. Command / undo/redo risks

- One coherent command architecture remains achievable **if** markdown-specific commands stay thin wrappers over pure functions (already the plan's approach), the IME guard stays centralized (already the plan's approach), and autocomplete/`/`-command interception is layered as "route to the open popup first" rather than duplicated per trigger type.
- **`/`-commands are a different result shape than inline-token triggers** — a `/`-command typically inserts/transforms a *block* (a heading, a table), not an inline token. Recommend the popup-acceptance contract carry "here is the transaction to apply" generically, rather than assuming "insert this token text," even though `/` isn't being built yet — cheap to get right now, expensive to retrofit once `[[`/`@`/`#` acceptance handlers are already written against a narrower assumption.
- The existing `DocumentSession`-vs-CM6-local-history separation remains sound and needs no changes for this expanded scope.
- **New edge case**: an external file update arriving while a token is mid-engagement. Recommend treating "actively engaging a token" as equivalent to "actively editing" for the purposes of the existing focused/unfocused external-update gate (i.e., never apply an external update while any part of the document is in an actively-engaged edit state) — not previously named anywhere.

---

## 8. Path-based references — architectural verdict

**Sound, not a problem in itself.** The risk isn't storing paths instead of IDs (many mature tools do this successfully) — it's **scope creep in what "confidently detected" is allowed to mean**. Recommend bounding it explicitly and narrowly: a single atomic rename/move event reported directly by the watcher for one file, and nothing beyond that — no fuzzy matching, no reconstructing a move from a separate delete+create pair unless the platform/watcher can correlate them with actual confidence (uncertain whether Clutter's current watcher can do this at all — flagged as uncertain, not assumed). Anything short of that bound should leave references untouched, exactly as already decided — this just makes the bound testable instead of a vague adjective.

Clicking an unresolved reference to create the file: no new facade needed, this is `PageOperations.create` used as-is. The genuinely new facade requirement is the bulk cross-document reference-rewrite capability from §2-A — that's the actual architectural gap here, not the path-vs-ID choice itself, which is correctly decided already and shouldn't be revisited.

---

## 9. Images/assets

No new concerns beyond what's already designed in the implementation plan's Phase 9 (async injected resolver, no filesystem access in the editor, reuses the token mechanism rather than duplicating it). The one thing worth reconfirming under this broader scope: images should share the **same** unified inline-token family from §5 (alongside references/tags/mentions), not be treated as a fully separate case that happens to look similar — the implementation plan already frames it this way ("extends Phase 6's mechanism, does not duplicate it"); this audit just confirms that framing still holds once the family is broadened.

---

## 10. Accessibility / IME — decide before implementation

- ARIA contract for inline-reference widgets (role, accessible name construction) — decide once, as part of §5's shared mechanism, not per-type later.
- Whether hidden/replaced markers stay in the accessible text tree in some form — already flagged `[TEST]` in the interaction spec; now applies to a broader construct set, not just links.
- IME composition guard verified specifically inside the engaged-token sub-mode (§6/§7), not assumed to be covered by ordinary-paragraph testing alone.
- Keyboard-only reachability of Option/Alt-click's "enter edit mode" gesture: confirm arrow-key entry (already the implementation plan's Phase 6 default) and Option/Alt-click both land in the exact same engaged state, so keyboard-only users are never blocked from a capability only described here as mouse-modifier-triggered.

---

## 11. Performance

Nothing new beyond §6's dense-reference-line case and the sync/async resolver split from §5. Viewport-scoped decoration, incremental parse, no full-document walk — already correctly designed in the existing architecture proposal and implementation plan; this audit found no additional performance concern beyond those two items.

---

## 12. Architecture completeness — classified findings

**A. Must resolve before implementation**
1. Owning facade for cross-document alias/path reference propagation (§2-A) — the single biggest gap in this audit.
2. Locked precedence order (CommonMark > GFM > Layer 2) plus the two concrete disambiguation rules (`#tag` vs. heading — already clean by spec; `@mention` vs. autolink email — needs the explicit tie-break stated in §3).
3. Decision that Clutter's Layer 2 constructs are implemented as genuine Lezer inline-parser extensions sharing one syntax tree — not a second regex pass. Close to a one-way architectural fork if decided the other way.
4. Sync-vs-async split for the resolver contract (reference/tag/mention labels: sync; assets: async) — affects the shape of Phases 6/7/9 together.

**B. Should resolve during architecture, not necessarily blocking this document**
5. The capability-descriptor bundling shape for feature flags (§4).
6. ARIA contract for inline-reference widgets (§6/§10).
7. External-update-vs-actively-engaged-token interaction rule (§7).
8. Generalized `/`-command popup-acceptance contract ("apply this transaction," not "insert this token") — cheap now, expensive later.

**C. Can safely defer to implementation**
9. Exact resolver function signatures.
10. Exact visual treatment of an unresolved reference.
11. Exact ARIA wording.
12. Layer 3 constructs (footnotes/callouts/embeds/highlight) — not designed now, by design.

**D. Prototype/UX validation required**
13. Dense-reference-line reveal/engagement feel (extends the existing Phase 5/6 prototype gates rather than adding a new phase).
14. IME composition inside an engaged token, with a real CJK input method, not synthetic events.
15. Screen-reader reading of a resolved-label widget vs. its literal markdown.

**E. Not worth building / explicitly reject**
16. An ID-based reference system — already correctly rejected; endorsed here.
17. A second, regex-based custom-syntax detection layer running alongside the Lezer tree — nobody proposed this, but it's the natural wrong shortcut an implementer could reach for under time pressure; worth rejecting explicitly in writing.
18. Auto-appending aliases to frontmatter from local reference usage — already correctly rejected; endorsed here.
19. Fuzzy/heuristic move-reconstruction from separate filesystem events — implicit in your existing wording; made explicit here as something to actively avoid, not just something you happened not to ask for.

---

## Prioritized next questions (resolve one at a time)

1. Confirm: Layer 2 constructs are implemented as Lezer inline-parser extensions in one shared tree (item A-3) — this shapes everything else.
2. Decide the owning facade for cross-document reference/alias propagation (item A-1) — the biggest structural gap; touches `ARCHITECTURE_RULES.md` Rules 1 and 2 directly.
3. Lock the precedence/disambiguation rules (item A-2).
4. Confirm the sync/async resolver split (item A-4).
5. Define the shared inline-reference decoration/engagement/ARIA contract (items B-5, B-6) — generalizes what the implementation plan's Phase 6 built for one type into the actual family it now needs to serve.
6. Bound "confidently detected move/rename" precisely (§8).
7. External-update-vs-engaged-token rule (B-7).
8. `/`-command contract generalization (B-8) — not urgent, cheap to decide now, expensive later.

---

## Proposed research/prototype phase before implementation

Narrow and bounded, folded into the *existing* implementation plan's Phase 5/6 gates rather than proposed as new standalone phases:

1. **Two-kind proof, not one.** Build the Lezer inline-parser extension for `[[path|alias]]` (already planned, unchanged) *and* `#tag` (the simplest second case) side by side, specifically to test the §5 shared-mechanism claim before committing five construct types to it. If two kinds share one decoration/engagement code path cleanly, the unified model is validated; if not, better to learn that with two kinds than after building five.
2. **Dense-reference-line fixture**, added to the existing Phase 5/6 prototype checkpoints (§6/§11) — not a new phase.
3. **Real-CJK-IME test inside an engaged token specifically**, folded into the implementation plan's existing Phase 10, with this one addition named explicitly rather than assumed covered by its general IME testing.

No broader "spike everything" phase is proposed — the existing 12-phase plan's structure and gates remain correct; this audit's findings are inputs to decide *before* that plan starts, not a reason to reopen its shape.
