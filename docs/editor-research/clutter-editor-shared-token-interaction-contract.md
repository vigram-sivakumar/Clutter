# Shared Semantic-Token Interaction Contract

Single-question validation. No code, no files modified. Builds on every prior locked decision; doesn't reopen any of them. No visual/styling decisions made — see the dedicated section near the end for exactly where a future styling choice could force an architecture change.

## The key move that makes everything else fall out cleanly

**Engagement is not stored state. It is derived, fresh on every render, from one fact: does the current CM6 selection lie strictly within this node's syntax range?** There is no engagement flag anywhere — not on the node, not in a side table. This single choice is why sections 7–9 below all resolve to "already covered, nothing new needed" rather than requiring bespoke logic: anything defined purely in terms of selection automatically inherits CM6's existing, already-correct handling of selection, undo, and focus.

---

## 1. State model

Two states, both derived, never stored: **at-rest** (decoration active — collapsed/rendered form shown) and **engaged** (decoration suppressed for this node — raw markdown shown, ordinary text behavior applies). `at-rest → engaged → at-rest` is sufficient. No third state is needed, and specifically **no separate "selected" state** — selection is represented entirely by CM6's native selection; what differs is how a selection that touches a token is *interpreted*, not a new state to track (see §4).

The precise rule, stated once here because every later section depends on it: **a token is engaged if and only if the current selection (including a zero-width caret) is entirely contained within its syntax range.** Any selection that starts before, ends after, or otherwise extends beyond the token's boundaries treats the token as one indivisible unit within that larger selection — it never partially reveals.

## 2. Engagement mechanics

**Reconciling an apparent tension first**: the brief states both "behaves atomically for cursor movement" and "arrow-key entry... enters the same editing state." These aren't contradictory, but the rule needs to be precise about *which* arrow-key press does which thing:

- **Passing through from a distance** (the caret is not yet adjacent to the token, and a Left/Right press would cross it): atomic — one hop, over the whole token, exactly like moving past a single character. This is what "atomic for cursor movement" means, and it's what prevents a token from disrupting ordinary fast navigation through a paragraph.
- **Already adjacent, pressing again in the same direction**: this is the deliberate entry gesture. A caret sitting exactly at the token's left boundary, on a further Right-press, moves one step *inside* rather than hopping over; symmetric from the right boundary with Left. This reconciles "atomic" (can't accidentally land inside while arrowing through text) with "arrow-key entry enters editing state" (a second, deliberate press at the boundary does exactly that) — they're the same mechanism at two different distances, not two different mechanisms.

Recommended as the concrete default; **flagged for the same felt-experience prototype check already on record from earlier documents** (does "press again at the edge" read as discoverable/intentional, or does it need a different gesture) — this is a UX question, not an architecture one, and the mechanism above is stable regardless of which gesture wins that check.

**Mouse click**: activates (per the already-locked click=activate decision) — does not engage.
**Option/Alt-click**: engages, placing the caret at a defined, deterministic position in the revealed raw text (exact position — nearest to click, or end-of-text — is an implementation detail, not an architecture question).
**Shift-selection touching a token from outside**: per §1's containment rule, this never partially engages — it sweeps the whole token into the selection as one unit (§4).
**Keyboard-only users**: fully covered by the boundary-press-again gesture above (both engagement directions) plus §10's new requirement that *activation* also needs an explicit keyboard path, which click alone doesn't provide.
**No dedicated "exit engagement" command exists or is needed** — engagement ends automatically the instant the selection is no longer contained (any further movement, a click elsewhere, anything). This is a direct, positive consequence of engagement being derived rather than stored: there's nothing to explicitly tear down.

**Is the same mechanism used for every kind?** Yes, without exception, for all six examples and any future inline construct of the same shape (see the closing section on the principle for the one genuine limit to that "any future").

## 3. Cursor movement

At-rest: one stop (§2). Engaged: ordinary grapheme-cluster movement through the raw text — this is not new behavior, it's the base editor's already-locked movement rules operating on now-visible text, unchanged. Moving the caret past the token's far boundary while engaged (one more character-level step) ends engagement automatically and the token re-collapses on the next decoration pass — **the caret's actual buffer position does not move because of the collapse**, only the visual form around it changes, which is the same "no cursor jump on decoration change" guarantee already locked for Live Preview generally, applied here without modification. **No trap state is possible or should ever be introduced**: leaving is just continuing to move the cursor or clicking elsewhere, never a special required action.

## 4. Selection

- **Selection drawn across a token from outside** (drag, Shift+End, etc.): the token stays collapsed and is included as one atomic unit in the larger selection — never partially revealed mid-gesture. This is what prevents a drag across a token-dense line from exploding every token into raw text at once.
- **A gesture that would otherwise end partway inside a not-yet-engaged token**: the endpoint snaps outward to the nearest token boundary rather than landing inside an unrevealed range — the selection mechanism refuses to produce a boundary inside an atomic range, the same category of behavior CM6's own atomic-range handling already provides elsewhere in the design.
- **Shift+Arrow extending into a token from outside**: extends to include the whole token in one step, consistent with §3's one-stop-at-rest rule.
- **"Should a partial selection at rest expand to the whole token?"** — reframed slightly by the containment rule: there's no such thing as a partial selection of an at-rest token in the first place; a gesture either fully includes it (from outside) or is operating on its raw text because it's already engaged (from inside). Same answer, more precise mechanism.
- **Once engaged**: ordinary character-level selection, no special-casing — this is exactly why it's worth stating: the shared mechanism does nothing extra here, it just gets out of the way once selection is contained.

## 5. Backspace / Delete

At-rest: one Backspace/Delete adjacent to the token removes the whole matched range in one transaction (already locked). Engaged: ordinary grapheme-level deletion through the raw text, unchanged from the base editor.

- **Partially destroying a token while engaged** (e.g. deleting one `[` of `[[`): no special handling needed. The syntax tree is disposable and always re-derived from the buffer (already-locked principle) — the moment the remaining text no longer matches the construct's grammar, it simply stops being that node type on the next reparse and becomes whatever it actually parses as (ordinary text, most likely). This is graceful degradation for free, not a new mechanism.
- **Adjacent tokens** (`[[A]]@Alex` with no space): Backspace after the second token removes only that one atomic range; the first token's range is disjoint and untouched — no adjacency-specific logic needed, since atomicity is purely a property of each node's own `[from, to)` range. Whether adjacent trigger characters can even *parse* as two distinct tokens vs. merging into one ambiguous match is a grammar/precedence question, already covered in spirit by the locked precedence document — out of scope here.
- **Paragraph boundaries**: no special case. Which rule fires (block-merge vs. token-atomic-delete) is determined entirely by where the caret sits, and those two conditions are mutually exclusive by position — a token sitting at a paragraph's edge behaves exactly as it would anywhere else.
- **Does deletion ever bleed into surrounding formatting?** No — a token's delete range is exactly its own node's range, never a sibling's or parent's, for the same disjoint-character-ranges reason already established when validating `**#project**` in the precedence document. Deleting a tag nested inside bold text removes only the tag; the `**` markers are untouched.

## 6. Click vs. edit — validated across kinds, one real refinement needed

The click(activate)/engage(edit) distinction works mechanically the same for every kind — but **not every kind has something meaningful for activate to do.** `@Today` and `@due:2028-08-17` have no obvious current activation target; tag/mention "open a view" may not exist as a feature yet either. Rather than force every kind to supply an activate handler, **`activate` should be an optional per-kind capability, absent or no-op by default**, not an assumed universal behavior. This is a small, real refinement to the mechanism (not a redesign): the shared click-handling code must tolerate "this kind defines no activation" gracefully — falling back to ordinary caret placement, not erroring or requiring special-casing per caller. `editable`/`navigable` flags, by contrast, aren't needed for any of the current six — all are, in principle, always-editable plain markdown underneath — but the capability slot is worth naming now (§ closing principle) as a forward-compatible seat, without inventing a construct that needs it yet.

## 7. Undo/redo — all four claims confirmed, cleanly

- **Engagement transitions are never undo steps** — true by construction, since engagement isn't stored state at all; there's nothing to undo. Selection changes were already never undo-tracked in the base editor design.
- **Atomic at-rest deletion is one undo step** — true, same treatment the base editor already gives any single dispatched deletion, just over a longer range.
- **Ordinary editing while engaged follows normal CM6 history** — true, unmodified, since engaged text is just ordinary text at that point.
- **Visual-only changes never touch history** — true, since decoration recomputation is a pure read of `(tree, selection)`, never a document mutation, and can't produce a transaction by construction.

Worth noting explicitly: this section came out this clean *because* of the §1 state-model choice. A stored engagement flag would have risked at least one of these four leaking into the undo stack by accident; a derived one structurally cannot.

## 8. Clipboard — all six claims confirmed, cleanly

Copy always operates on the literal buffer range of the current selection, never on rendered/decorated text — this was already the base editor's design, and the §4 rule that "selecting a token" always means selecting its exact raw range makes every one of the six stated claims (`[[path|alias]]` not `alias`; `#tag`; `@Alex`; ordinary behavior for an engaged partial selection; no custom clipboard format) a **free consequence**, not something requiring per-kind clipboard code. Nothing to add here.

## 9. External updates while a token is engaged

**No new rule is needed.** Engagement can only exist while the editor has focus and an active, contained selection — which is already a strict subset of "the editor is focused," the exact condition the already-locked whole-document external-update gate keys off. Since that gate already forbids applying an external update while focused at all, an engaged token is automatically protected as a special case of a rule that already exists, not a reason to invent a new one. This directly satisfies the goal stated in the question: one consistent rule, no separate external-sync architecture for tokens.

## 10. Accessibility — shared baseline, with one new explicit requirement

- **Accessible name**: computed from the resolved *label*, never the raw markdown — "link, 2026 project," not "double bracket Projects slash Project A pipe 2026 project double bracket." Consistent with not exposing implementation syntax to assistive technology any more than to sighted rendering.
- **Role**: legitimately supplied per kind (a reference is link-like; a tag may be closer to a toggle/filter control; a date may have no interactive role at all if it has no activation) — this isn't an exception to "accessibility is shared," it's exactly the "type supplies the value, mechanism supplies the wiring" split the closing principle already describes.
- **Keyboard-only activation — a new, explicit requirement, not previously stated anywhere**: the boundary-press-again gesture from §2 gets a keyboard user *into* editing, but it does **not** invoke `activate()`. Click does both distinguishing jobs for a mouse user (click = activate, Option-click = engage) with no keyboard equivalent yet defined for activation specifically. A defined key (e.g. Enter, while the caret sits adjacent to an at-rest token) must invoke the same `activate()` a click would. Without this, keyboard-only users can edit every token but never open one — a real gap this document is the right place to name.
- **Hidden markdown's accessible-tree exposure**: still the open `[TEST]` item carried from earlier documents — not resolved here, not newly reopened either.
- **Engaged state**: reverts entirely to ordinary editable-text accessibility semantics, no special ARIA needed — another free consequence of the state model, same pattern as §7/§8.

## 11. Images and ordinary Markdown links — validated, not assumed

**Plain `[text](url)` links: confirmed as ordinary Live-Preview inline marks, not the atomic token family** — and here is the actual argument, not just a restatement of the earlier lean: link display text in ordinary prose is exactly the kind of content users routinely want to edit *at the character level* (fixing a typo in the visible text, rewording it) without touching the destination. Atomic-at-rest treatment would make every single inline hyperlink in a reference-heavy document behave like a one-hop obstacle to arrow past, which actively works against normal prose editing at exactly the frequency link syntax appears. The token family's atomicity is justified for constructs where partial, character-level editing of the collapsed form is rarely wanted (a path reference, a tag name) — that asymmetry, not precedent, is why links stay in the other category. Validated.

**Images: confirmed as token family, for a distinct and firmer reason than links.** An image's at-rest form isn't styled text with hidden markers — it's an actually-rendered image, a different kind of visual object entirely, which is structurally a `Decoration.replace` + non-text widget concern (the token family's native shape) rather than a "hide/reveal text markers" concern (the Live-Preview-mark family's shape). Alt-text also isn't something users typically want to character-edit inline as often as link display text, further weakening the case for treating it as a plain mark. Validated, with a clearer rationale than the earlier documents stated.

`[[...]]`, `#tag`, `@mention`, `@date`, `@property` — token family, unchanged, reaffirmed by the same reasoning that separates them from links: none of them benefit from partial character-level editing while collapsed, and none render as anything other than styled text-or-widget that should hide its punctuation-heavy raw form.

---

## Where a future styling choice could force an architecture change (no visual decisions made here)

1. **Internal DOM structure inside a widget is free to change** (adding an icon, multiple child elements) **as long as the whole thing remains one `Decoration.replace` widget from CM6's perspective.** Not a risk — flagged only to say this explicitly so it isn't second-guessed later.
2. **A future multi-affordance chip design** (e.g. a separate icon-click for a preview, distinct from the main click-to-activate) **would require the click-handling mechanism to become zone-aware within the widget**, rather than "the whole widget is one activate target," which is what's assumed for v1. Not needed now — flagged so the team asks the question deliberately before adding such an affordance, rather than discovering the mechanism doesn't support it.
3. **The widget must remain a genuinely inline-flowing element**, not an inline-block with fixed dimensions that breaks normal text wrap — hard-coded sizing or borders that interrupt flow would affect coordinate-to-buffer-position mapping at the token's edges (click/cursor hit-testing), which is an architecture-adjacent concern, not pure styling. Worth recording as a constraint on future visual design now, before it's designed.
4. **Resolved vs. unresolved reference state must be a style-hook difference only** (a class/attribute), never a different DOM/widget structure — an unresolved reference should remain exactly as atomic, engageable, and deletable as a resolved one; only its *activation* behavior differs (open vs. offer-to-create, per the already-locked path-based-reference decision), which is a semantic-descriptor difference, not a structural one.

---

## The principle — stress-tested, holds, with one honest, real limit named

> Every Clutter semantic inline construct shares exactly one interaction mechanism. Its type supplies only its semantic behavior: how it resolves, what label it displays, what activation does, how it validates, and how it serializes. Cursor movement, engagement, selection, deletion, clipboard, undo/redo, IME, and accessibility remain shared.

Tested against several real candidate exceptions before accepting it:

- Accessibility *role* varying per kind — not an exception; role is a value the type supplies, exactly as the principle already anticipates, not a different mechanism for wiring it.
- `@Today`/`@due:...` having no meaningful activation — not an exception; an absent/no-op `activate` is still "supplied per type," just supplied as nothing (§6).
- Images needing real (async) resolution unlike a tag's flat lookup — not an exception; resolution *complexity* differing per kind is exactly what "type supplies how it resolves" already covers.

**One genuine, honest limit found, not manufactured**: the principle holds for **inline** semantic constructs — every one of the six given examples, and any future construct of the same shape (a single line of collapsible raw text with a resolved display form). It should **not** be assumed to extend to a future **block-shaped** construct — the "future embeds/transclusions" possibility named in earlier documents, if that ever means rendering an entire referenced document's content inline rather than a single collapsible line, is not naturally an "engage to reveal raw text" interaction at all, and would need its own design rather than being forced into this mechanism. Recommend the principle be recorded with this scope explicit: **"...for inline semantic constructs"** — not because any of today's six examples violate it, but because the current wording could otherwise be read as a blank check for something structurally different that hasn't been designed yet.

Answered this question only. Not opening the next one.
