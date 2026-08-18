# Semantic Resolution, Display Labels & Serialization

Single-question validation. No code, no files modified. Builds on every prior locked decision without reopening any of them.

## Six concepts, kept distinct throughout (per the explicit instruction not to collapse them)

- **Stored Markdown** — the literal buffer text, e.g. `[[Projects/Project A|2026 project]]`. Changes only via direct user editing while engaged. Never anything else.
- **Parsed syntax** — the Lezer node and its raw captured fields (e.g. `rawPath="Projects/Project A"`, `localAlias="2026 project"`). A pure, disposable read of the buffer.
- **Semantic resolution** — what the parsed reference currently *means* against live vault state (resolved / unresolved / ambiguous, and to what). Computed fresh, never stored, never written back.
- **Display label** — what's shown at rest. A pure function of parsed syntax plus resolution, recomputed every render.
- **User activation** — the side effect of clicking/keyboard-activating. A function of resolution, never of display label.
- **Serialization** — the one-shot, insertion-time operation that turns a chosen candidate (e.g. an autocomplete selection) into literal text to insert. Not an ongoing sync operation, and never runs on already-existing tokens as a "re-save" step.

The single rule that keeps these from collapsing into each other: **data flows stored → parsed → resolved → displayed, one direction only. There is no arrow from displayed back to stored.** Serialization is the one exception, and it only ever fires at creation time, never as a re-derivation of existing text.

---

## 1. Bare WikiLink — `[[Projects/Project A]]`

At the no-metadata baseline: display derives from the last path segment with the extension stripped — pure string math, no vault lookup required to produce *some* answer. Whether the full algorithm goes further than this baseline is answered in §3–§4, not here.

- **Folder targets**: if the path resolves to a `Folder`, not a `Page`, recommend treating this as unresolved for reference purposes — Clutter's domain model doesn't have "folder pages," and inventing folder-reference semantics nobody asked for would be exactly the kind of speculative complexity to avoid. `[DECISION]`, but a clean, low-risk default.
- **Missing target**: unresolved — full treatment in §8.
- **Filenames containing special characters**: this is a real, non-hypothetical risk, not just an edge case to wave at. A page literally named `Notes | Ideas.md` collides with the `|` alias-separator character. The parser must treat the *first unescaped* `|` before the closing `]]` as the separator (standard, deterministic — matches how existing wikilink implementations already do this), which means serialization must escape a literal `|` (or a literal `]]`) inside a path or alias segment whenever it appears, using a backslash-escape convention the parser also recognizes. **This needs an explicit escaping rule locked before implementation** — it's not automatically safe just because most filenames won't hit it.

## 2. WikiLink with local alias — confirmed, precisely

`Projects/Project A` (resolution target), `2026 project` (local display label), and the target page's own frontmatter aliases are three genuinely separate pieces of data, never conflated. They *compose* — `getDisplayLabel` may need `resolve`'s output when there's no local alias (§10) — but composing two functions is not the same as confusing what each one owns. Confirmed as stated.

## 3. Target page aliases — challenged, not assumed

**None of A, B, C as pure options is right. The correct answer is closest to C, stated precisely: for a bare reference (no local alias), the display label is the target's current primary frontmatter alias if one exists, else its filename — recomputed live on every render, never written to any buffer.**

Why not A (aliases only for search): throws away real value. A page could never present a friendlier name anywhere unless every single reference to it is hand-edited — defeating much of the point of having page-level aliases at all.

Why not pure B (aliases as *the* default, unconditionally): assumes there's always exactly one alias with no fallback story, and doesn't address what happens with zero aliases.

**Why the chosen answer doesn't secretly violate the already-locked "editing frontmatter aliases does not rewrite references" rule**: that rule is about the *stored Markdown* never changing. This is a *display-label* rule, which is a pure, read-only, always-re-derived render — exactly the same "derived data is disposable" pattern already governing every decoration in this whole design (and the same pattern `ARCHITECTURE_RULES.md` Rule 8 already applies to Vault projections generally). The two guarantees — buffer never rewritten, display always current — are fully compatible, not in tension. Worth stating explicitly since they can look contradictory at first glance.

**Multiple aliases**: needs a deterministic tie-break. Recommend the first-listed alias in frontmatter as "primary" — simple, predictable, matches ordinary list-order-as-priority convention. `[DECISION]`, reasonable default.

## 4. Precedence — corrected, not just validated

The proposed ordering (local alias > target filename > target frontmatter aliases) is **wrong given the §3 answer, and should be corrected**:

> **local reference alias > target's primary frontmatter alias (if resolved and present) > target filename**

Putting filename above frontmatter aliases would mean giving a page a friendly alias never actually changes how it's displayed anywhere unless every reference is hand-edited — exactly option A from §3, already rejected with reasons. The corrected order is what makes page-level aliases actually useful for display, not just for search.

## 5. Renaming an alias locally — confirmed, no wrinkles

Editing `|2026 project` to `|2027 project` is an ordinary character-level edit to the buffer while engaged — nothing new, no mutation anywhere else. Exactly as stated in the question.

## 6. Renaming an alias in target frontmatter — separated by concept, as requested

- **Resolution**: unaffected. Path-based references resolve by path, never by alias content.
- **Autocomplete / search**: should reflect the new alias going forward immediately — this is a live index concern, not a Markdown-rewrite concern.
- **Default display** (bare references only): changes, live, per §3 — the intended and correct consequence, zero buffer writes.
- **References with a local alias** (`|My project`): completely unaffected, forever, unless a user manually edits them — this is exactly what "we previously decided NO for local labels" already guarantees, and this analysis confirms it holds under the fuller model rather than being contradicted by it.
- **Backlinks**: the *set* of backlinks is computed from resolved target identity (path), never from alias text — stable across alias renames. Only a friendly label shown *next to* a backlink entry (if the UI shows one) would update, same rule as default display.

## 7. Alias-based resolution — `[[Alpha]]` where "Alpha" is only a frontmatter alias

**Yes, Clutter should attempt this as a fallback**, for the same reason it's worth supporting at all: a user typing what they think of a page as should generally work. The critical constraint, extending a principle already established elsewhere in this document: **resolution never causes a write.** `[[Alpha]]` stays stored as exactly `[[Alpha]]` forever, resolved live on every render (literal path lookup first, alias-index fallback second), never auto-rewritten to the canonical path. A future *explicit*, user-triggered "normalize this reference" command is a defensible idea, but is a distinct, deliberate edit action — not something resolution itself should ever do silently.

**Two pages sharing the same alias**: this needs a real, deterministic rule, and I recommend the conservative one — **ambiguous alias matches must never be silently resolved to either candidate.** `resolve()` needs a third outcome beyond resolved/unresolved: **ambiguous**, carrying the candidate list. Silently picking "the first match" risks a user unknowingly opening or editing the wrong page's content, which is a substantially worse failure mode than an honest "ambiguous, please disambiguate" state. This directly reinforces (not duplicates) the mention-ambiguity finding from the earlier shared-interaction-contract document — the same shape of problem shows up again here, which is good evidence the `resolve()` contract genuinely needs a 3-way (or richer) result across kinds, not a 2-way one.

## 8. Unresolved references — fully defined

- **At rest**: rendered through the identical mechanism as a resolved reference — no structural DOM/widget difference, only a different resolve-outcome feeding a different presentation (per the already-locked "resolution state is a style hook, never a DOM-shape difference" rule).
- **Display label**: no metadata to consult, so the fallback chain bottoms out at the raw path's last segment, taken literally from the buffer (§1's structural baseline, with nothing further to layer on top).
- **Atomic / editable**: identical to a resolved reference in every respect — resolution state never affects interaction mechanics, only what `activate()` and the display label resolve to.
- **Click**: `activate()` branches on resolve outcome for this kind specifically — resolved → open; unresolved → offer/create (per the already-locked page-lifecycle decision, via the existing `PageOperations.create` facade); ambiguous → prompt disambiguation. Worth stating explicitly: **`activate` isn't one fixed behavior per kind, it can and for WikiLink must branch on the resolve result** — a refinement to how the descriptor is used, not a new field.
- **Option/Alt-click**: identical to any token — engages for raw editing, completely independent of resolve state. You can always fix a broken reference's text regardless of whether it currently resolves.
- **Autocomplete/search**: an unresolved reference's raw text isn't indexed as a real page (there's nothing to index). Surfacing "N unresolved references to this path" as its own feature is a plausible future capability, explicitly out of scope here — a vault-wide projection, not an editor concern.
- **When the file is later created**: resolve flips from unresolved → resolved on the very next decoration recompute, since resolve is always a fresh, live read — the stored Markdown never changes; only the rendered presentation updates. This is the same live-recompute pattern used everywhere else in this document, reapplied, not a special case.

## 9. Path normalization

- **Vault-relative, always** — not really a new decision so much as what Vault's own existing path-based identity model already forces, and what makes the vault portable if moved/copied.
- **`/` separators, always** — required for the file to remain valid if opened by another tool on a different OS, directly serving the stated interoperability goal (a Windows-style backslash separator would not be portable).
- **`.`/`..` in typed text**: the parser should tolerate reading them (a user or another tool might write them), but **Clutter's own writer should never produce them** — always fully normalized on insertion. Parse leniently, write canonically, never silently rewrite existing non-canonical-but-valid text just because it was read once — the same principle already applied to path/alias content generally.
- **Case sensitivity**: recommend the reference-resolution layer match whatever case-handling Vault's own path indexing already uses, rather than inventing a second, possibly-inconsistent case rule at the reference layer. **Flagged honestly as uncertain** — this document doesn't have direct knowledge of `VaultPath`'s existing case-sensitivity behavior, and it should be confirmed against that, not assumed.
- **File extensions**: omitted from the canonical stored form (matches the display-label convention in §1, and matches nearly universal wikilink-tool convention) — the parser tolerates a typed `.md` without erroring, but Clutter never writes one.
- **Exact persisted representation**: vault-relative, `/`-separated, no `.`/`..` segments, no leading `./`, no extension — for anything Clutter itself writes. The parser remains tolerant of reading variations without ever being forced to rewrite them.

## 10. `resolveDisplayLabel(reference)` — the semantic rules

1. Local alias present → return it. Always wins, unconditionally.
2. Else, resolve the path (literal match, then alias fallback, then ambiguity check):
   - Resolved, target has ≥1 alias → primary alias.
   - Resolved, target has none → filename (extension stripped).
   - Resolves to a folder → treated as unresolved (§1), falls to the next branch.
   - Unresolved → raw path's last segment, literally.
   - Ambiguous → the raw matched text, presented distinctly from unresolved at the styling level (not a new display algorithm — resolve needs the extra branch, display doesn't).

"Renamed/moved target" and "target with aliases" aren't separate cases in this table — they're the same live-recompute behavior applied at different moments, which is exactly the point: there's one function, evaluated fresh, not six special cases.

## 11. `resolve()` / `getDisplayLabel()` / `activate()` — validated as the right split, with two precise refinements

Yes, this belongs in the shared descriptor — and having now worked out WikiLink's full complexity (aliasing, ambiguity, folder edge cases, unresolved states), the three-function shape held without needing a fourth concept. That's a meaningful validation result, not a formality.

Two refinements worth locking as implementation guidance:
- `getDisplayLabel` and `activate` should each take `resolve`'s **already-computed result** as an input, rather than calling `resolve()` themselves — avoids redundant resolution work and keeps the three genuinely independently testable, directly serving the "don't collapse these concepts" instruction at a concrete, checkable level.
- `activate` may legitimately branch internally on what `resolve` returned (resolved vs. unresolved vs. ambiguous) — it's still one function supplied by the type, just not a single fixed action.

## 12. Serialization — the one-way rule, stated precisely

Confirmed exactly as posed: display is never serialized back into Markdown. There is no "display → stored" data path anywhere in this design — only "stored → parsed → resolved → displayed" (§ intro) and, separately, "chosen candidate → inserted text" at creation time only. `Project A` rendering for `[[Projects/Project A]]` can never become `[[Project A]]`, because nothing in this design ever writes based on what's currently displayed — writing only ever happens from direct user text edits or from a one-shot insertion event, never from a render.

## 13. Tags — deliberately NOT forced into the WikiLink model

- **Stored vs. semantic value**: the raw Markdown is `#project` (the `#` is part of the literal syntax, exactly parallel to `[[` for WikiLinks); the semantic value compared against a tag index is the bare `project`. Worth being precise about this distinction since it's a direct instance of "stored Markdown" vs. "parsed syntax" from the glossary.
- **Display label**: just the tag text — no alias concept, no local-override syntax exists or is proposed for tags.
- **Aliases**: recommend tags do **not** get an alias mechanism at all. Nothing in the locked decisions suggests tags have anything like frontmatter, and giving them one would add complexity mirroring WikiLinks for no evidenced benefit — a good concrete instance of "not every kind needs every capability."
- **Resolution shape is structurally different, not just simpler**: a tag doesn't resolve to a target entity — its `resolve()` is closer to an *existence check* ("does this tag currently appear anywhere in the vault") than an entity lookup. `[UNCERTAIN]` — this document doesn't have direct visibility into whatever tag-related application logic already exists (a `core/application/tags` module appears to exist in the codebase per earlier exploration in this session, but its exact model wasn't inspected here) — flagged rather than assumed.
- **A tag with zero usages is not "broken"** the way an unresolved WikiLink is. A brand-new tag being typed for the first time is completely unremarkable; an unresolved WikiLink carries an implicit "this might need fixing or creating" connotation. Worth naming as a genuine semantic difference between the two kinds' "not found" states, not just a styling difference.
- **Click**: recommend *filtering* (open a tag-scoped view), not *opening a page* — a different kind of activation than WikiLink's, exactly as the shared descriptor's "type supplies activation" principle anticipates.
- **Does it need a resolver at all?** Yes, but a dramatically simpler one — same three-function *contract*, far shallower *implementation* for two of the three slots. Good direct evidence for §17.

## 14. `@mention`

- **Stored vs. semantic**: `@Alex` stored; `Alex` the semantic value.
- **Display label**: recommend the resolved entity's canonical name when resolved (e.g. "Alexandra Smith" for a person typed as `@Alex`), falling back to the literal typed text when unresolved. Reasoning: since no local-alias syntax exists for mentions (no `@Alex|Alexandra Smith` form was proposed anywhere), a bare mention is *always* the "no local override" case — meaning the WikiLink pattern of "prefer the target's own current best name over what was typed" is the consistent extension here, not a new rule invented for mentions specifically.
- **Resolution shape, structurally different again**: no path-based primary key exists for people the way it does for pages — mentions likely resolve entirely by name/alias matching against a directory, never by any structural identifier. A third distinct resolution shape (path-then-alias for WikiLink, existence-check for Tag, name-matching-only for Mention) — useful evidence that `resolve()`'s *return shape* is shared while its *internal logic* is expected to vary substantially, which is the point.
- **Ambiguity**: identical treatment to WikiLink's alias-ambiguity — `resolve()` returns `ambiguous` with candidates, never silently picks one. Same contract, reused, not reinvented.
- **Activation**: opens the entity's own view — what that view actually is isn't designed here, per the instruction; the editor's contract need is only that `activate()` exists as an injected function, nothing more.
- **Unresolved click behavior** (offer to create a new person/entity, mirroring WikiLink's create-on-click): genuinely undecided and **flagged as a product question this document shouldn't answer**, since it depends on whether a person/entity system exists as a first-class concept at all, which is explicitly out of scope here.
- **Autocomplete**: sourced from an injected provider, nothing new architecturally.

## 15. `@Today` / `@today` / `@Tomorrow` — the genuinely new finding

This is a real product decision hiding inside what looks like a syntax question, and it has a concrete architectural consequence either way — worth stating both readings rather than picking one silently:

- **Reading A — snapshot at typing time**: `@Today` means "the date this was written," effectively frozen. Under this reading, the *correct* architecture is for typing/accepting `@Today` to immediately convert it into a concrete literal date (e.g., insert `@due:2028-08-18`-shaped text, or a dedicated frozen-date kind) — `@Today` as a *persistent* token that keeps re-resolving forever would be the wrong model here.
- **Reading B — always relative, forever**: `@Today` stays literally "Today" in the buffer permanently and re-resolves against the *current* date on every render, like every other live-resolved construct in this document.

**Recommend Reading B** — it's meaningfully more useful for a knowledge-management tool (a reusable template line like "Review tasks due @Today" is far more valuable evaluated fresh each time than frozen at first creation) — but this is stated as a recommendation on a genuine product question, not something to assume the answer to.

**If Reading B is adopted, the concrete architectural consequence the question is fishing for is real and should be named plainly**: yes, the same stored token resolves differently after local midnight, with two consequences nothing else in this design has needed so far:

1. **A new invalidation trigger.** Every other decoration in this whole architecture recomputes in response to buffer or selection changes — purely event-driven from user action. A relative-date token additionally needs to recompute in response to **wall-clock time passing**, specifically at the next local-midnight boundary. This is a genuinely new kind of trigger the shared infrastructure doesn't currently have a mechanism for, and it should be named as a real, non-free requirement rather than assumed to fall out of the existing design. A document left open overnight needs *something* to schedule that refresh — a lightweight, low-frequency timer, not a redesign, but a real addition.
2. **A cross-cutting resolution concern, not just an editor one.** Any future consumer of this Markdown outside the live editor (search, a task/due-date aggregation view, anything reading the raw file) needs the *same* relative-date resolution logic, evaluated against *its own* "now" at read time — not just the editor's. This argues for the relative-date resolution function living as a small, standalone, editor-independent utility from the start, reusable by both the editor's decoration layer and any future non-editor reader — worth flagging now, cheap to keep in mind, expensive to retrofit if the logic gets buried inside a CM6-specific file.

## 16. `@due:2028-08-17`

Flat/non-recursive confirmed, per the already-locked decision — not re-litigated.

- **Stored**: always the raw string `2028-08-17`, never transformed.
- **Parse vs. validate, kept distinct**: whether the value even *looks* date-shaped (matches something like ISO `YYYY-MM-DD`) determines whether the parser emits a `PropertyToken` with a date-flavored sub-kind at all — that's a parsing-time structural question. Whether the value is a *genuinely valid* date (not, say, `2028-13-45`) is a separate, later `validate()` concern. **These should not be conflated**: `@due:not-a-date` should still parse as a `PropertyToken` (key=`due`, value=`not-a-date`) — it *is* structurally a key:value construct — with `validate()` reporting it invalid, rather than falling all the way through to plain literal text as if it weren't a property construct at all. Falling through to plain text would make "malformed" indistinguishable from "not a property," which loses real information.
- **Semantic date value**: only ever a lazy, ephemeral computation inside `resolve()`/`validate()`'s own implementation (for validation, and later for date-picker-style features) — never stored, never persisted, same derived-data pattern as everything else in this document.

## 17. The shared descriptor — stress-tested, holds, with two precise refinements plus one real, new infrastructure gap

`{ kind, resolve, displayLabel, activate, validate, serialize }`, checked against five genuinely different kinds (WikiLink's rich aliasing+ambiguity, Tag's near-trivial existence check, Mention's name-only ambiguous matching, Today's time-dependence, Due's validation-not-resolution shape):

- **Holds.** No kind needed a seventh field, and the shape absorbed real, meaningfully different complexity (entity-lookup vs. existence-check vs. name-matching vs. time-computation vs. value-validation) without needing to grow. That's a genuine positive result, not just an absence of objections.
- **Refinement 1**: `resolve` and `activate` were already known-optional; **`validate` should be treated the same way, and more precisely, `resolve` and `validate` should be understood as two different flavors of "is this construct okay," each kind supplying whichever is actually meaningful for it.** WikiLink/Tag/Mention lean on `resolve`; `Due` leans on `validate`; neither is a mandatory pair every kind fills in.
- **Refinement 2**: `serialize` should be understood precisely as a **one-shot, insertion-time** function (chosen candidate → literal text), never an ongoing or continuous operation re-run against existing tokens — worth stating explicitly given how central §12's one-way rule is; the name alone invites the wrong reading.
- **The one genuinely new finding, at the infrastructure level, not the descriptor level**: `@Today` doesn't need a new descriptor field — `resolve()` can express "compute the current value given external context" generally enough to cover both vault-state-dependence (WikiLink) and wall-clock-dependence (Today). What's actually missing is a **recompute trigger source** the shared mechanism doesn't have yet: everything today recomputes on buffer/selection change; nothing recomputes on time passing. This is a mechanism-level gap worth carrying into the architecture document precisely as that — infrastructure, not descriptor shape.

Not too generic, not over-abstracted — the descriptor is validated as right-sized specifically because it survived a genuinely novel stress case (time-dependence) without needing new fields, only needing an infrastructure addition elsewhere.

Answered this question only. Not opening the next one.
