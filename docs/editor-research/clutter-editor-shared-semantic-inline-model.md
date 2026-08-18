# Shared Semantic-Inline Architecture — Validation

Single-question validation. No code, no files modified. Builds directly on the prior semantic-tokens audit; doesn't reopen anything else.

## Answer: **YES**, with two named flex-points, not exceptions.

All six examples — `[[path|alias]]`, `#tag`, `@mention`, `@Today`, `@due:2028-08-17`, and (partially, see Q6) plain links/images — can share one interaction architecture. None of them requires a separate architecture. Two of them (`@Today`, `@due:2028-08-17`) reveal real friction that the shared contract must be built to absorb from day one, not discovered as an exception later.

---

## The precise three-way distinction (Q7)

These are genuinely different things, and conflating them is the actual risk in "one general mechanism" proposals:

- **Shared interaction infrastructure** — the CM6-facing mechanics: how a range renders collapsed, how it's hidden/replaced, how engagement is triggered and torn down, how selection/deletion behave at rest vs. engaged, how IME and accessibility are wired. **This should be exactly one thing.**
- **Shared semantic model** — a small per-kind *descriptor* (resolve, label, activate, validate, autocomplete source) that the infrastructure calls into generically. **This should be one interface with several small implementers** — "one contract, many objects," not one implementation. Kind ≠ mechanism.
- **Shared parser node** — a pure parsing question: one Lezer node type with a `kind` field, or several distinct node types that each conform to the same descriptor interface. **Orthogonal to both of the above**, and not answered here per your instruction — my lean, stated only as a lean: several distinct node types is probably cleaner (the trigger grammars — `[[`, `#`, `@name`, `@key:value`, `@date-keyword` — are different enough that forcing one node's internal parse logic to cover all of them risks the opposite problem, an over-general parser instead of an over-general widget). This needs its own validation pass, not a decision made here.

A construct can participate fully in layer 1 without needing layer 2 or 3 at all — this is exactly the case for plain links (Q6).

---

## Q1 — Is the shared lifecycle coherent for all six examples?

Mostly yes. Walking each one through recognize → render-at-rest → engage → reveal → edit → resolve:

- **`[[path|alias]]`**: clean fit. Raw form and display form genuinely differ (alias vs. path); resolution is a unique existence lookup; click opens, engage edits raw text.
- **`#tag`**: clean fit, with a small wrinkle — raw form and at-rest display form are usually identical (`#project` renders as `#project`, just styled). Engagement still makes sense (enter edit mode, cursor becomes literal), but there's little or nothing to "reveal" that wasn't already visible. Not a break — just means the reveal transform for this kind is closer to a no-op.
- **`@mention`**: clean fit, with one real nuance — resolution can be *ambiguous* (more than one "Alex"), unlike a path lookup which is unique-or-nothing. The shared contract's `resolve()` must be able to express "multiple candidates," not just found/not-found.
- **`@Today`**: the first genuine friction point. There's no punctuation-heavy raw syntax to hide — the raw text *is* the display text. This construct may not need a hide/reveal transform at all, only "recognized, atomic-ish, resolves to a computed date." The lifecycle still applies; the reveal step for this kind is legitimately a no-op.
- **`@due:2028-08-17`**: the second genuine friction point. This is structurally two-part (a property key and a value), not a flat reference/tag/mention. It raises — but does not need to answer now — whether a property's *value* could itself someday be another semantic construct (e.g. `@assignee:@Alex`). No evidence that's needed for v1. Recommend locking property-value kinds as flat/non-recursive now, revisited only if a concrete recursive need appears — not solved speculatively.

**Neither friction point breaks the model.** Both require one specific flexibility: the reveal transform must be allowed to be identity/no-op per kind, and property-value kinds must be allowed to stay flat without the contract assuming every kind needs alias-style raw/display divergence.

---

## Q2 — What genuinely belongs to shared infrastructure

Rendering (decorated/collapsed range), hidden↔raw representation mechanics (including the no-op case), engagement trigger detection (click, arrow-key entry), the reveal-on-engagement *state machine* (even when a kind's transform does nothing visible), selection (atomic at rest / normal while engaged), Backspace/Delete (atomic single-step at rest / normal while engaged), clipboard (copies literal raw text — already uniform for free, since the buffer is always markdown), undo/redo (engagement transitions are never undo steps; literal edits while engaged use ordinary text-edit grouping), IME (the composition guard applies identically inside every kind's engaged-editing sub-mode), and the accessibility *baseline* (role + a name slot every kind fills in).

## Q3 — What must remain type-specific

Click/activate action (open page vs. open tag view vs. resolve a person vs. compute a date vs. open a URL), resolution logic (unique lookup vs. usage lookup vs. ambiguous match vs. computed transform vs. identity/no-op), autocomplete candidate source, displayed-label computation, validation (well-formed date? valid property key?), insertion/serialization syntax, a **navigable/editable capability flag per kind** (don't assume every future kind wants both), and future kind-specific actions (a date picker, an assignee picker) — these plug in as the kind's "activate" behavior, not as new engagement mechanics.

---

## Q4 — Any construct that breaks the model?

No. All six examples fit, given the two named flex-points above (optional/no-op reveal transform; flat, non-recursive property values). Record both as **locked contract requirements**, not per-construct exceptions — future kinds will hit the same two questions, and the contract should already answer them.

---

## Q6 — Should plain Markdown links and images join the family?

**Split answer, and this is the most useful test case for the Q7 distinction:**

- **Images**: full participation. They already need resolution (async asset lookup), a label (alt text), and a click/engage split — this was already correctly designed in the existing implementation plan (Phase 9) and fits the semantic-model layer as well as any of the six examples.
- **Plain `[text](url)` links**: infrastructure only, **not** the semantic-model layer. A plain link has no Clutter-specific resolution — its "label" is just its literal text, its "click" is a generic open-URL, not a Vault-aware lookup. This also matches what v0.2 already decided: plain links are an ordinary Live-Preview inline mark (reveal on cursor overlap, like bold/italic), not a reveal-on-engagement atomic token like the family above. Forcing plain links through the kind-resolution registry would add machinery (a `resolve()` call, an autocomplete-source slot, a validation step) that serves no purpose for a construct with no Clutter-specific meaning.

This is exactly the proof that infrastructure-sharing and semantic-model-sharing are separable: plain links use layer 1 fully, layer 2 not at all.

---

## Q8 — Smallest abstraction, explicitly not a framework

- One shared rendering/engagement **mechanism** (not a plugin system, not a registry with dynamic discovery, not an event bus) that takes a node range plus a small descriptor and does the mechanical work described in Q2.
- One small **descriptor interface**: `{ kind, resolve(rawValue), label, activate(), validate()?, autocompleteSource()?, navigable: boolean }`.
- A handful of **concrete descriptor objects** — one per kind (reference, tag, mention, date, property) — selected by a plain lookup from the parsed node's kind, not a dynamic plugin loader.

That's the whole abstraction. No generic "semantic engine," no reflection, no capability-negotiation protocol — five small objects and one shared mechanism that calls into whichever one applies.

---

## Risks / exceptions to record now

1. **Reveal transform must be identity-capable per kind** — `@Today`/`#tag` don't always have something to hide. Build this in; don't discover it as a special case.
2. **Property values stay flat/non-recursive in v1** — explicitly locked, explicitly revisit-only-if-needed (e.g. a future `@assignee:@Alex`), not solved now.
3. **`resolve()` must express ambiguity**, not just found/not-found — mentions need this; references and tags don't, but the contract shape has to accommodate the hardest case among the current five kinds.
4. **Plain links/images must not be forced into the kind-resolution registry** unless they genuinely need it — images do, plain links don't. Recording this now so a later contributor doesn't "helpfully" unify them and add pointless resolution overhead to ordinary Markdown links.
5. **Every kind defines both a click/activate action and an engage/edit action**, even when they're easy to confuse (e.g. a tag's "click" opens a tag view; its "engage" edits the tag text) — keep this pair mandatory per kind so it's never ambiguous which one a given interaction should trigger.

---

## The one-sentence principle (for the architecture document)

> **Every Clutter-specific inline semantic construct — whatever its trigger syntax or meaning — is rendered, engaged, selected, deleted, copied, undone, and exposed to accessibility and IME through one shared inline-token interaction mechanism, with only resolution, display label, activation behavior, and validation supplied per construct type; ordinary Markdown links and images reuse the same rendering/engagement mechanism without necessarily participating in that per-type resolution contract.**

Not implementing anything further; not opening the next architecture question.
