# Relative Date Semantics — `@Today`

Single-question validation. No code, no files modified. This finding **reverses a working assumption carried through earlier documents** (which treated `@Today` as a persistent token exactly like `[[link]]`/`#tag`/`@mention`) — flagged explicitly where it happens, not glossed over.

## 1. Recommended semantic meaning

**`@Today`, `@Tomorrow`, and any relative-date keyword are not persistent buffer syntax.** When accepted, they resolve immediately, at insertion time, to the corresponding concrete literal date — the same date a user would get by typing it out directly. Nothing named `@Today` remains in the buffer after acceptance. No node type parses a persistent `@Today`/`@Tomorrow` construct as ongoing semantic syntax.

This is **not** a version of Option A as originally framed, and not Option B either — it's the outcome of taking Option A's premise seriously enough that it stops being a "snapshot semantics for a persistent token" proposal at all. See §2.

## 2. Why the alternatives are weaker — both, examined rigorously

### Option A, aggressively challenged, collapses under its own premise

For "the semantic value becomes frozen" to mean anything while `@Today` stays literally `@Today` in the buffer, *something* has to record which calendar day this particular occurrence was created on. Where could that live?

- Not the Markdown text — that's the premise being tested.
- Not file mtime/git history/anything filesystem-adjacent — a note can contain many `@Today` occurrences typed on different days; a single file-level timestamp can't disambiguate them, and mtime is destroyed by any re-save, copy, or sync operation regardless.
- Anything else is, by definition, an ID, a database, hidden metadata, or sidecar state — **explicitly forbidden by this task's own constraint.**

So Option A, taken at face value, is **architecturally disqualified**, not just weaker. The question's own final sub-bullet under Option A already spots the way out: *"if instead insertion immediately serializes it to `@due:2026-08-18`, is `@Today` really a persistent syntax at all?"* — no. Once forced to respect the no-hidden-state constraint, "snapshot semantics" stops being a competing answer to *"what does the persistent token `@Today` mean"* and becomes a different claim entirely: **there is no persistent token — `Today` is purely an insertion-time convenience that expands to a concrete date and is never stored as itself.** That's the recommendation in §1, arrived at by taking Option A seriously rather than dismissing it.

### Option B, tested against the two given scenarios, fails the common case

Working through the two scenarios as instructed, rather than reasoning abstractly:

- **Daily Note** (`Review today's tasks: @Today`, written Aug 18, reopened Aug 19): a daily note is itself already a dated artifact — its filename/identity fixes it to August 18. If `@Today` is dynamic, reopening it on Aug 19 makes the note *internally contradict its own date* ("today" now silently means a day the note isn't about). This is actively wrong, in exactly the first scenario chosen.
- **Project note** (`Launch date: @Today`, written Aug 18): if dynamic, this becomes "Launch date: August 19" the next day, "August 20" the day after — a recorded fact drifting forward forever. Nobody writing down a launch date wants it to silently change every day it isn't updated.

**Both worked scenarios argue against dynamic semantics**, and they argue against it precisely because natural-language use of "today" in a sentence — "review today's tasks," "launched today" — is almost always a person **recording a fact at the moment of writing**, not authoring a live template. This directly overturns the lean taken in the earlier semantic-resolution document (which favored dynamic semantics on the strength of a *reusable-template* argument alone). That template use case is real, but it's a **different, more deliberate authoring intent** than what either given scenario actually shows — see §6.

## 3. The exact locked rule

> `@Today`, `@Tomorrow`, and equivalent relative-date keywords are recognized only as insertion-time shorthand. On acceptance, the literal keyword is replaced by the concrete date it represents at that moment; the keyword itself is never committed to the buffer and no parser node represents it as ongoing syntax.
>
> If a user hand-types the literal text `@Today` directly into the buffer (bypassing any insertion/acceptance flow) rather than accepting it as shorthand, it is **not** recognized as a semantic construct at all. It falls through to whatever the existing `@`-family grammar already does with an unrecognized `@word` — ordinarily, an unresolved Mention — with no special-casing added for it.

**A genuine simplification, worth naming**: the earlier parser-architecture document proposed one shared `@`-triggered inline-parser function disambiguating between Mention, DateToken, and PropertyToken. Under this finding, **`DateToken` as a persistent node kind for relative keywords doesn't exist** — the disambiguation collapses to two branches (Mention, PropertyToken), not three. Less parser complexity than previously planned, not more — a direct, positive consequence of this finding, not a cost of it.

## 4. How this differs from `@due:2026-08-18`

`@due:YYYY-MM-DD` remains exactly what it already was — a literal, permanently fixed, non-relative stored value, and the correct shape for recording a fact, which is what both worked scenarios actually wanted. Under this recommendation, accepting "Today" as shorthand and directly typing `2026-08-18` **converge to the identical stored result** — the only difference `@Today`-the-shorthand ever provides is *input ergonomics* (faster to type/select than a full date), never a difference in ongoing meaning. There is no runtime distinction between a date that arrived via the shorthand and one typed by hand; both are just dates.

## 5. `@due:@Today` — does it need recursion?

**No, and it shouldn't get any.** Under this model, `@Today` never persists as nestable semantic text, so `@due:@Today` typed by hand simply doesn't have a nested construct to recurse into — it's malformed input, handled exactly like any other malformed property value (per the already-locked distinction: it parses as a `PropertyToken` with `value="@Today"` if the grammar is lenient about capturing whatever follows `due:`, and `validate()` reports it invalid because it isn't a recognized date shape — or it simply doesn't match the value grammar at all and falls through. Either is defensible; which one is an implementation detail, not a further product question, since the product answer — no recursive/relative values in v1 — is already fully settled by the existing flat/non-recursive lock plus this document's finding.)

**If Clutter ever wants a genuinely relative *due date* specifically** (distinct from the general question this document answers), the correct **non-recursive** shape for it is: let `PropertyToken`'s own value grammar, for date-flavored keys, accept a small fixed set of relative keywords (`today`, `tomorrow`) as literal alternatives alongside an absolute ISO date — resolved and made time-dependent entirely within `PropertyToken`'s own `resolve()`, never by nesting another semantic-inline node inside the value. This is not recursion — there is no nested node — and it doesn't reintroduce a persistent `@Today` anywhere else in the grammar. **Not recommended for building now** — named only because the question explicitly asks whether a non-recursive path exists, and it does.

## 6. Remaining ambiguity that genuinely needs a product decision

1. **Is a deliberately-relative, template-authoring construct wanted at all**, as a distinct feature from ordinary date-insertion shorthand — e.g. for recurring template text meant to be evaluated fresh each time it's used? This is real and was the strongest argument for Option B in the earlier document, but it's a **narrower, more deliberate authoring intent** than plain "@Today," and — per the no-hidden-state constraint already established — if built, it should almost certainly use **distinct syntax** from the ordinary insertion shorthand recommended here, so a reader (and Clutter's own parser) is never left guessing which behavior a given piece of text has. Not designed here; flagged as a genuinely separate feature question.
2. **Whether `@due:today`/`@due:tomorrow` relative keywords (§5) are wanted for the due-property specifically** — the correct non-recursive shape is defined above; whether to build it is undecided.
3. **Exact autocomplete-acceptance output** (does accepting "Today" insert a bare date, or `@due:<date>`, and does that depend on surrounding context) is an insertion-flow/UI question, explicitly out of scope here per the "no autocomplete UI" constraint — flagged so it isn't silently assumed when that work happens.

---

## 5. (deliverable) Minimum invalidation mechanism — needed *if and when*, not needed by the recommendation itself

Since the recommendation in §1 means ordinary "@Today" typing never produces a persistent relative construct, **the base recommendation needs no time-based invalidation mechanism at all.** This section answers the conditional the question poses, because the one plausible near-future case that *would* need it — the optional `@due:today` relative-keyword mechanism from §5 — is exactly the kind of thing worth being ready for rather than redesigning later.

- **Not a generic "external semantic context changed" system.** That would be over-engineering for a need that currently has exactly one concrete trigger (calendar-day rollover). Build the specific thing; generalize only if a second, genuinely different external trigger materializes later — nothing else in this entire design is anything but buffer/selection-driven, so that's speculative, not evidenced.
- **A single scheduled timer for the next local midnight is sufficient.** Recompute-every-minute is pure waste — a date-level relative value only ever changes at day boundaries, so anything finer-grained produces no different answer. Schedule one wake-up for the next local midnight, recompute, reschedule for the following midnight. That's the whole mechanism.
- **Local time, not UTC** — "today" and "midnight" are inherently the reader's local wall-clock concepts. Worth stating explicitly since a naive UTC-based implementation would produce a wrong "today" for large parts of the day for most users, and this applies to any date-shaped resolution in Clutter, not just this specific case.
- **Lives outside CM6**, as a small, standalone scheduler — not because it's forbidden inside the editor, but because the same relative-date resolution logic needs to be usable by any future non-editor consumer (search, a due-date view, anything reading the raw file) evaluated against *its own* "now" at read time — burying it inside a CM6-specific extension would make that reuse harder later for no benefit now. When it fires, it simply asks the editor to refresh decorations for open documents that contain relative-date-flavored content — the exact CM6-level trigger is an implementation detail, not decided here.
- **Reusable by construction, not by design effort**: because the scheduler's job is generically "wake up at the next date boundary, let interested consumers recompute," any future relative-date construct can subscribe to the same single tick rather than inventing its own timer — one shared, narrow mechanism serving multiple possible consumers of the *same* trigger, which is a bounded, evidenced generalization (one trigger type, several consumers), not a speculative framework.

Answered this question only. Not opening the next one.
