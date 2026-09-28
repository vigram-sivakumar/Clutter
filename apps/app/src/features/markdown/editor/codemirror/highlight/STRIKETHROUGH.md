# Strikethrough Rendering Contract

## 1. Purpose

This document defines the rendering contract for Markdown strikethrough in
the Clutter CodeMirror editor.

It exists to prevent regressions where strikethrough is accidentally
rendered by multiple overlapping DOM elements, producing double lines,
incorrect colors, or nested `tok-strike` elements — the exact class of bug
found (and fixed) on 2026-09-28 for `InlineCode`, and confirmed to have
existed, invisibly, for `Tag`/`Date`/`Emphasis`/`StrongEmphasis`/`Highlight`
too.

The contract applies specifically to the editor's live-preview rendering
layer (`inlineLivePreviewParticipants.ts`, this same directory).

**It does not define the compact Markdown renderer's implementation**
(`features/markdown/render/`). That surface uses real nested React DOM and
a plain `<s>` element — a different mechanism, with its own fix tracked
separately — so this document's *implementation* details (§6's table of
renderer names, §7's protected-range mechanism, `STRIKETHROUGH_PROTECTED_NODE_NAMES`)
are editor-specific and do not apply there. The one exception is §14
(underline/strikethrough independence): that invariant was found and fixed
in the compact renderer first, but the underlying CSS behavior it documents
is platform-level, not specific to either rendering surface, so it is
recorded here as a general rule both surfaces must follow.

**Editor and compact Markdown are different implementations of the same
rendering contract.** Their DOM shape and rendering mechanisms may differ —
range-based decorations with a protected-range gap mechanism for the
editor, real nested DOM with per-construct sibling elements for compact —
but the *semantic* behavior and ownership rules this document defines (§2's
fundamental invariant, §6's ownership model, §14's styling-independence
rule) must hold equivalently in both: exactly one strike owner per
character, that owner's own color driving the strike, and an owned
underline never leaking its styling onto that same element's strike.
Neither surface needs to reproduce the other's DOM or mechanism to satisfy
the contract — only the same observable outcome.

**Read and comply with this contract before modifying strikethrough
behavior, or before adding any new inline Markdown construct that might be
struck.**

---

## 2. The fundamental invariant

**A `tok-strike` element must never contain another `tok-strike` element.**

Valid:

```html
<span class="tok-strike">plain text</span>
<span class="tok-tag tok-strike">#tag</span>
<span class="tok-code tok-strike">Code</span>
<span class="tok-link tok-strike">
  <span class="tok-link-title">Google</span>
</span>
```

Invalid:

```html
<span class="tok-strike">
  plain text
  <span class="tok-tag tok-strike">#tag</span>
  more text
</span>
```

Also invalid:

```html
<span class="tok-strike">
  <span class="tok-code tok-strike">Code</span>
</span>
```

The second form causes two independent line-through decorations to be
painted.

---

## 3. Why this matters

CodeMirror does not create a semantic nested DOM tree for overlapping
decorations. Strikethrough is implemented using ranges and decorations. A
generic strikethrough decoration can therefore accidentally overlap a
semantic inline renderer that independently adds `tok-strike`.

For example:

```md
~~plain #tag text~~
```

If the generic strikethrough range covers the entire expression while the
Tag renderer also adds `tok-strike`, the resulting DOM can become:

```html
<span class="tok-strike">
  plain
  <span class="tok-tag tok-strike">#tag</span>
  text
</span>
```

The tag now has two strikethrough painters:

1. the ancestor's `tok-strike`
2. the tag's own `tok-strike`

Because the tag may have a different foreground color, the two lines can
also have different colors.

This is the source of bugs such as:

- double strikethrough lines
- white line over red inline code
- incorrect line color over tags
- WebKit/Tauri rendering differences
- apparently inconsistent behavior between semantic inline constructs

---

## 4. Two categories of strikethrough content

Every piece of struck content belongs to one of two categories.

### A. Ordinary text

Ordinary text has no semantic inline renderer. It receives the generic
`tok-strike`:

```html
<span class="tok-strike">hello world</span>
```

The generic strikethrough renderer (`strikethroughRenderer`) owns this
content.

### B. Semantic inline constructs

Some Markdown constructs have their own renderer and therefore own their
visual presentation. Currently: links, autolinks, bare URLs, WikiLinks,
inline code, tags, dates, emphasis, strong emphasis, highlight — any
construct whose renderer explicitly composes `tok-strike` onto its own
element.

For these constructs, the semantic renderer owns the `tok-strike` class:

```html
<span class="tok-code tok-strike">Code</span>
```

Not:

```html
<span class="tok-strike">
  <span class="tok-code tok-strike">Code</span>
</span>
```

---

## 5. Generic strikethrough must split around semantic constructs

The generic strikethrough renderer is responsible only for the portions
that are not already owned by a semantic renderer.

Conceptually:

```text
~~plain [semantic] plain~~
```

must render as:

```text
[generic strike] [semantic strike] [generic strike]
```

DOM:

```html
<span class="tok-strike">plain </span>
<span class="tok-tag tok-strike">#tag</span>
<span class="tok-strike"> plain</span>
```

Not:

```text
[generic strike
    [semantic strike]
generic strike]
```

This is the central implementation rule.

---

## 6. Ownership model

There must be exactly one owner of the strikethrough decoration for each
rendered character.

| Content | `tok-strike` owner |
|---|---|
| Plain text | Generic strikethrough renderer (`strikethroughRenderer`) |
| Inline code | Inline-code renderer (`delimitedInlineRenderer('CodeMark', 'tok-code', ...)`) |
| Tag | Tag renderer (`widgetReplaceRenderer` + `renderTag`) |
| Date | Date renderer (`widgetReplaceRenderer` + `renderDate`) |
| Link | Link renderer (`linkRenderer`) |
| Autolink | Autolink renderer (`autolinkRenderer`) |
| URL | URL renderer (`urlRenderer`) |
| WikiLink | WikiLink renderer (`wikiLinkLivePreview.ts`, its own standalone mechanism) |
| Emphasis | Emphasis renderer (`delimitedInlineRenderer('EmphasisMark', 'tok-emphasis', ...)`) |
| Strong emphasis | Strong-emphasis renderer (`delimitedInlineRenderer('EmphasisMark', 'tok-strong', ...)`) |
| Highlight | Highlight renderer (`delimitedInlineRenderer('HighlightMark', 'tok-highlight', ...)`) |

The exact list is maintained alongside the renderer implementation, in
`STRIKETHROUGH_PROTECTED_NODE_NAMES` (`inlineLivePreviewParticipants.ts`).
**If a new inline construct starts composing `tok-strike`, it must also be
added to that set** — see §18.

---

## 7. Protected ranges

The generic strikethrough renderer therefore maintains a set of protected
ranges.

Conceptually:

```text
genericStrikeRange
        ↓
┌─────────────────────────────────────────┐
│ plain │ semantic │ plain │ semantic     │
└─────────────────────────────────────────┘
          ↑
       protected
```

The generic renderer must exclude semantic ranges that independently
render `tok-strike`.

This is why the editor has:

- `STRIKETHROUGH_PROTECTED_NODE_NAMES` — the set of node names to exclude
- `collectProtectedRanges(root)` — walks a `Strikethrough` node's subtree
  and collects every descendant range whose node name is in that set
- `computeStrikethroughGaps(from, to, protectedRanges)` — turns the
  protected ranges into the complement gaps the generic renderer actually
  decorates

The important thing is not the implementation mechanism itself. The
contract is:

**If another renderer owns `tok-strike` for a range, the generic
strikethrough renderer must not paint that range.**

---

## 8. Example: plain text

Markdown:

```md
~~hello world~~
```

Expected:

```html
<span class="tok-strike">hello world</span>
```

There is one strike painter.

---

## 9. Example: inline code

Markdown:

```md
~~hello `Code` world~~
```

Expected conceptual DOM:

```html
<span class="tok-strike">hello </span>
<span class="tok-code tok-strike">Code</span>
<span class="tok-strike"> world</span>
```

Not:

```html
<span class="tok-strike">
  hello
  <span class="tok-code tok-strike">Code</span>
  world
</span>
```

The inline-code renderer owns the strike for `Code`. This is particularly
important because inline code has its own foreground color. If both
decorations paint (ambient/white strike) + (red code strike), the result
can visibly become a double line — this was the exact reported bug.

---

## 10. Example: tag

Markdown:

```md
~~hello #urgent world~~
```

Expected:

```html
<span class="tok-strike">hello </span>
<span class="tok-tag tok-strike">#urgent</span>
<span class="tok-strike"> world</span>
```

The tag owns its own strike decoration because it owns the tag's
foreground styling.

---

## 11. Example: link

Markdown:

```md
~~hello [Google](https://google.com) world~~
```

Expected:

```html
<span class="tok-strike">hello </span>
<span class="tok-link tok-strike">
  <span class="tok-link-title">Google</span>
</span>
<span class="tok-strike"> world</span>
```

The link itself is protected from generic strikethrough. The link
renderer owns `tok-strike`.

---

## 12. Example: WikiLink

Markdown:

```md
~~hello [[Architecture]] world~~
```

Expected:

```html
<span class="tok-strike">hello </span>
<span class="tok-wikilink tok-strike">Architecture</span>
<span class="tok-strike"> world</span>
```

Again, the semantic renderer owns the strike.

---

## 13. Color inheritance is part of the contract

`tok-strike` is not a color class. Its primary responsibility is:

```css
text-decoration-line: line-through;
```

The line's color (`text-decoration-color`, defaulting to `currentColor`)
belongs to **whichever element declares `text-decoration-line`** — not to
whatever content the line visually crosses. This is why ownership must be
exact, not approximate: a propagated ancestor line cannot "pick up" a
descendant's color as it crosses different children — that is specified
CSS behavior, not a compositing bug to work around.

Therefore:

```html
<span class="tok-strike">plain</span>
```

uses the normal text color, while:

```html
<span class="tok-code tok-strike">Code</span>
```

uses the inline-code color, and:

```html
<span class="tok-tag tok-strike">#urgent</span>
```

uses the tag color — each because the strike-owning element **is** the
colored element, not an ancestor of it.

This is another reason overlapping generic and semantic strike decorations
are incorrect: the ancestor's line cannot inherit the descendant's color,
so a mismatched pair of colors is the *expected*, structurally guaranteed
result of getting ownership wrong — not a rare edge case.

---

## 14. Underline and strikethrough styling must remain independent

This is a **separate concern from ownership** (§2–§13). Ownership answers
*which element* paints the strike. This section answers a different
question: even when ownership is entirely correct, does that element's
strike end up styled correctly?

Some semantic constructs — particularly Link and WikiLink — carry their own
underline in addition to potentially being struck. `text-decoration-color`
and `text-decoration-thickness` apply to *every* decoration line an element
paints, not to one line at a time. If an element declares an underline with
its own explicit color/thickness (typically tuned for a deliberately subtle
look) and also composes `line-through` onto itself, the strike inherits
that same subtle color/thickness — producing a visibly fainter/thinner
strike than every other construct's, even though the ownership rule (§2) is
fully satisfied.

This was found (and fixed) in the compact Markdown renderer for Link and
WikiLink on 2026-09-28: both elements owned their strike correctly, with no
nesting violation, yet their struck line-through rendered at ~50%-alpha and
a thin fixed thickness instead of an opaque, default-thickness line —
because both properties were shared with the element's own underline
styling.

### Desired behavior

**Link**
- text color: link foreground
- underline: the existing subtle link-underline styling, unchanged
- strikethrough: link foreground / `currentColor`, at normal/default strike
  thickness — never the underline's own thickness or alpha color

**WikiLink**
- text color: whatever foreground the WikiLink implementation owns
- underline: the existing WikiLink underline styling, unchanged
- strikethrough: WikiLink foreground / `currentColor`, at normal/default
  strike thickness

**Do not read "text color: whatever foreground the WikiLink implementation
owns" as a requirement that WikiLinks have a unique foreground color.** A
WikiLink's foreground is whatever that construct's own rendering already
uses — in the compact renderer this is currently the ambient/body
foreground, by design, since a WikiLink's primary semantic distinction is
its underline, not a mandated distinct text color. The rule is general, not
construct-specific: **the strikethrough always uses the foreground color of
whichever element owns the semantic construct**, whatever that color
happens to be — the same color-inheritance rule as §13, restated for the
case where that same element also owns an underline.

### The additional invariant

Combined with §2's ownership invariant:

> Every struck character has exactly one strike owner.
> A strike-owning element must never contain another strike-owning element.
>
> Correct strike ownership does not guarantee correct strike styling. If an
> element also owns another text decoration, underline-specific
> color/thickness must not leak onto its line-through decoration.

### What this must NOT be solved by

- adding a duplicate/second strike decoration
- globally overriding strike styling (e.g. forcing
  `text-decoration-color: currentColor` on every construct), which would
  also destroy the intentionally subtle underline
- a CSS trick that fakes the strike (background-image, box-shadow, a
  pseudo-element positioned over the text, etc.)

Instead, underline and strikethrough styling must be structurally separated
— e.g. giving the underline its own dedicated inner element so the
strike-owning element's `text-decoration-line` is left unclaimed by any
other decoration's color/thickness. The compact renderer's
`.compact-markdown-link`/`.compact-markdown-link-title` split (and the
editor's own pre-existing `.tok-link`/`.tok-link-title` split, which already
used this same shape) are both established examples — see
`CompactMarkdown.css`/`MarkdownEditor.css`.

---

## 15. What the generic renderer must NOT do

The generic strikethrough renderer must not:

**Wrap the entire strikethrough expression.** Bad:

```html
<span class="tok-strike">
  ...
</span>
```

when the content contains semantic struck elements.

**Apply `tok-strike` over protected semantic ranges.** Bad:

```text
generic strike range
───────────────
       semantic strike
       ─────────────
```

**Depend on CSS to hide duplicate lines.** Do not solve the problem with
`text-decoration-color`, `z-index`, `background`, or pseudo-elements. The
DOM/range ownership is wrong if two renderers paint the same characters —
fix the ownership, not the paint.

**Remove `tok-strike` from semantic elements.** Also wrong:

```html
<span class="tok-code">Code</span>
```

when `Code` is inside `~~...~~`. The semantic element still needs to
communicate that it is struck.

**Fix a thinner/fainter strike on an underlined construct by patching its
paint instead of separating its decorations.** If a correctly-owned strike
still renders visibly fainter or thinner than other constructs' (a Link or
WikiLink underline problem, not an ownership problem — see §14), do not fix
it by adding a duplicate strike, globally overriding
`text-decoration-color`/`-thickness`, or a `z-index`/pseudo-element trick.
Separate the underline onto its own element instead, per §14.

---

## 16. The invariant we should test

Every strikethrough test should be able to answer: **who owns the strike
for each character?**

A useful structural assertion:

**No element with `.tok-strike` may contain a descendant with
`.tok-strike`.**

In other words:

```css
/* Conceptual invariant, not production CSS */
.tok-strike .tok-strike
```

must never match the rendered Markdown DOM. `strikethroughLinkComposition.test.ts`'s
`hasBareStrikeAncestor()` helper is this exact check, already implemented —
reuse it rather than writing a second one. That is a much stronger
regression test than simply checking that a screenshot "looks right."

---

## 17. Required regression cases

At minimum, the editor test suite (`strikethroughLinkComposition.test.ts`)
must cover:

```md
~~plain text~~
~~plain `code` text~~
~~plain #tag text~~
~~plain @date text~~
~~plain [link](url) text~~
~~plain [[WikiLink]] text~~
~~plain *emphasis* text~~
~~plain **strong** text~~
~~plain ==highlight== text~~
```

And combinations:

```md
~~plain `code` #tag [link](url) text~~
```

The important assertions are:

1. semantic construct retains its own `tok-strike`
2. generic strike does not overlap it
3. no `.tok-strike` contains another `.tok-strike`
4. each character receives exactly one strike painter
5. semantic foreground color remains intact

---

## 18. Adding a new inline construct

When adding a new inline Markdown renderer, if the construct participates
in strikethrough, it must:

1. render its own semantic class
2. compose `tok-strike` onto that class (via `collectActiveStrikeClass` or
   `collectActiveInlineClasses`, whichever its own renderer family already
   uses)
3. be added to `STRIKETHROUGH_PROTECTED_NODE_NAMES`, so
   `collectProtectedRanges` excludes its range from the generic renderer's
   gap
4. have a regression test asserting no nested `.tok-strike` for it,
   alongside the existing cases in `strikethroughLinkComposition.test.ts`

```text
NewConstruct
    ↓
tok-new-construct
    +
tok-strike

generic strike
      ↓
must skip NewConstruct's range
```

Skipping step 3 while doing step 2 is exactly the bug this contract exists
to prevent — the construct will self-compose correctly but end up nested
inside the generic renderer's own ancestor mark.

---

## 19. Debugging checklist

When a strikethrough bug appears, inspect the DOM first.

**Step 1 — Search for nested strike.** Look for `.tok-strike .tok-strike`
in the rendered DOM (`view.dom.querySelector('.tok-strike .tok-strike')`
in a test, or a live `document.querySelectorAll` check). If it exists, the
ownership contract has been violated.

**Step 2 — Identify the two owners.** Ask: which renderer created the
outer `tok-strike`? Which renderer created the inner one? Read the actual
registered participant in `createInlineLivePreviewParticipants` for each —
don't assume from a prior investigation; verify against current source.

**Step 3 — Inspect the generic protected ranges.** Determine whether the
semantic construct's node name is missing from
`STRIKETHROUGH_PROTECTED_NODE_NAMES`.

**Step 4 — Do not fix with CSS.** If two elements paint the same strike,
fix range ownership (§15).

**Step 5 — Verify in Tauri/WKWebView.** Chrome and WebKit can expose
different visual symptoms for the same underlying DOM defect (WebKit does
not reliably composite two overlapping decorating boxes into one visible
line). The structural invariant (§16) must hold regardless of which
renderer happens to make the symptom visible in a given browser — checking
computed styles/DOM structure catches it even where the visual symptom
doesn't reproduce.

**Step 6 — If ownership is already correct but the strike still looks
wrong (fainter, thinner, wrong opacity), this is not a nesting bug.** Check
whether the same element also declares its own underline (§14) — inspect
`text-decoration-color`/`text-decoration-thickness` on the strike-owning
element and compare against the construct's other, correctly-styled strike
cases (e.g. plain text or inline code) rather than assuming the ownership
model is at fault.

---

## 20. Short version

If someone only remembers the rules, they should remember these:

1. Every struck character has exactly one strike owner.
2. Plain text is owned by the generic strikethrough renderer.
3. Semantic inline constructs own their own `tok-strike`.
4. The generic renderer must split around/protect semantic ranges.
5. `.tok-strike` must never contain another `.tok-strike`.
6. Correct ownership does not guarantee correct styling — an underline's
   own color/thickness must never leak onto that same element's strike
   (§14).

That is the non-negotiable contract.
