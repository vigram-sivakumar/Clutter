# Parser Precedence Validation

Single-question validation. No code, no files modified. Builds on the locked parser-architecture decision (distinct Lezer node types via `@lezer/markdown`'s `MarkdownConfig` mechanism); doesn't reopen it.

## Verdict on the proposed rule: **correct as a principle, incomplete as stated — needs one explicit addition.**

> "Existing valid CommonMark/GFM meaning always wins. A Clutter extension may only claim text that would otherwise remain ordinary/literal text..."

This is the right principle and should be locked. But **"before/after ordering" alone does not fully guarantee it** for one specific class of case: constructs whose trigger sequence is a prefix of a built-in construct's trigger (`[[` starts with `[`, the `Link` trigger; `![[` starts with `![`, the `Image` trigger). For these, a Clutter parser that simply runs first and claims `[[Project A]]` can still be *wrong* if what follows is actually `[[Project A]](url)` — a rare but genuine case where real CommonMark link syntax happens to have literal-looking doubled brackets as its link text. Ordering alone doesn't protect against this; it needs a second, explicit requirement. Full reasoning under case 8 below; stated as the amendment at the end.

The `@`-family cases (mention/date/property vs. GFM autolink) do **not** have this problem, for a structural reason worth naming precisely: an email autolink's match logically begins at the *local part* (`foo`), before the `@`, while a mention's match begins *at* the `@`. They aren't racing to claim the same starting character the way `[` and `[[` are, so ordering alone is sufficient there. This distinction — same-trigger-character races vs. shared-prefix races — is the key thing the proposed rule needs to say explicitly, because the correct mitigation differs between the two.

---

## Case-by-case

**1. `# Heading` → heading.** Claimed by the built-in `ATXHeading` block parser. Guaranteed by CommonMark (space required after `#`) *and* by the architecture's own block/inline phase separation — ATX heading recognition happens at block-level line-start dispatch, before any inline parser (including a future Tag parser) ever runs. No ordering needed; these two parsers never compete for the same dispatch point at all. High confidence.

**2. `#project` → Clutter tag.** ATXHeading's own block-level check declines (no space), so the line falls through to ordinary paragraph block parsing; Tag's inline parser then claims `#project` as inline content. No explicit `before`/`after` needed relative to any built-in — nothing in CommonMark/GFM has meaning for a bare inline `#`, so Tag isn't competing with anything, only needs to be registered at all. Enabling it can't break existing meaning, since there was no prior meaning to break. Clean match for the proposed rule, no caveats.

**3. `` `#project` `` → code span, never a tag.** Claimed by the built-in `InlineCode` parser. Guaranteed by the shared-tree architecture: once `InlineCode` consumes a span, that range is never re-offered to a later-running parser. No ordering needed beyond not misconfiguring Tag with an inappropriate `before: "InlineCode"`. **Generalizable rule worth locking**: Clutter extensions must never be ordered `before` `Escape`, `Entity`, `InlineCode`, or `HTMLTag` without a specific, documented reason — those four are the constructs everything else needs to stay *inside*, not compete with.

**4. `**#project**` → bold text containing a tag; representable cleanly.** Emphasis/strong resolution runs as a delimiter-stack pass over the already-tokenized inline stream (the same mechanism GFM's own Strikethrough composes through), so it wraps whatever sits between the `**` delimiters — including an already-produced `Tag` node — into `StrongEmphasis`, with `Tag` as a child. This works *because* Tag is a first-class node in the same tree, not an artifact of a second pass — the direct payoff of the locked parser-architecture decision. The shared interaction mechanism represents this correctly with no special-casing: the emphasis markers and the tag's own range are disjoint character spans, so both decorate independently and simultaneously (styled bold text, with a tag chip inside it). Reasonably high confidence on composition working; exact resulting tree shape is the same "worth a quick prototype confirmation" item already flagged in the prior answer, not a new concern.

**5. `foo@bar.com` → email/autolink, never mention.** Claimed by GFM's `Autolink` parser — *conditional on GFM's autolink extension being enabled at all*; if it isn't, this text has no built-in meaning and is fair game for Mention (worth naming explicitly, since the answer depends on which extensions are actually active). With GFM enabled: content shape alone mostly disambiguates (autolink email requires a dot-domain suffix; `foo@bar.com` has one), but **explicit ordering is still recommended** (`after: "Autolink"` — exact registered name to confirm against the installed GFM config at implementation time) as defense-in-depth rather than relying on shape alone, matching the "boring and predictable" goal. Cannot break existing meaning if ordered this way — Autolink always gets first refusal.

**6. `@Alex` → Clutter mention.** Same mechanism as case 5: Autolink declines (no dot-domain shape), the `@`-family parser (see case 7) claims it as a mention.

**7. `@due:2028-08-17` → semantic property/date construct.** Same *external* ordering as cases 5/6 relative to Autolink. The `due:` vs. plain-mention vs. `Today`-style-date distinction is **not** a Lezer `before`/`after` question at all — it's ordinary internal branching inside the one registered `@`-family parser function (per the prior decision): does a valid property-key pattern immediately follow the `@` and end in `:`? Emit `PropertyToken`. Otherwise, does the text match a known date keyword? Emit `DateToken`. Otherwise, emit `Mention`. Worth being precise about this distinction, since the user's question is framed around parser *ordering*, and this particular case is actually resolved by parser *content logic*, not registration order — conflating the two would be imprecise.

**8. `[[Project A]]` → WikiLink.** This is where the proposed rule needs its amendment. Two things are required, not one:
- **Ordering**: register WikiLink `before: "Link"` (confirmed available mechanism) so it gets first refusal at any `[[`-starting position, rather than leaving it to interact with however `Link`'s own bracket/delimiter matching handles a doubled bracket internally (I can't fully verify that interaction from documentation alone, and `before: "Link"` sidesteps needing to — the conservative, correct-by-construction choice).
- **A continuation-lookahead check inside WikiLink's own matcher**: before committing to a WikiLink match, confirm that what follows the closing `]]` is *not* the start of a valid link continuation (`(` for an inline destination, `[` for a reference). Without this, `[[Project A]](url)` — a real, if rare, case where genuine CommonMark link text happens to be a doubled bracket — would be silently misinterpreted as a WikiLink instead of the link its author wrote, a direct violation of "existing valid CommonMark meaning must never be broken." Ordering alone does not prevent this; only the extension's own matcher checking for a valid continuation does.

This is the concrete, substantive gap in the proposed rule as literally worded — not guaranteed by CommonMark, Lezer, or ordering alone; requires an explicit implementation obligation.

**9. `[Project A](url)` → normal Markdown link.** Single bracket — WikiLink only ever triggers on the doubled-bracket `[[` prefix, so there's no interaction at all here. Clean, unambiguous, no ordering concern; included to show the boundary between "WikiLink territory" and "ordinary link territory" is crisp at the character level.

**10. `[[Project A|2026]]` → WikiLink with alias.** Same precedence answer as case 8 in full — the `|alias` segment is internal to WikiLink's own matching logic once it has already committed via the `[[` trigger and the continuation check. No new precedence question.

**11. `![image](image.png)` → normal Markdown image.** Single-bracket form, claimed by the built-in `Image` parser. A future Embed construct (case 12) would only ever trigger on the doubled-bracket `![[` form, so this is unaffected — same clean boundary as case 9, for images.

**12. `![[image.png]]` → parser-compatible with the same pattern as case 8, not a new precedence category.** A future Embed extension registers `before: "Image"`, triggers on the `![[` prefix (disjoint from `Image`'s single-bracket form), and needs the **same continuation-lookahead safeguard** for the same reason: `![[image.png]](url)` is a rare but real case of genuine CommonMark image syntax with doubled-bracket alt text. Since the question asked specifically about parser compatibility rather than whether to ship this now: yes, fully compatible, no new mechanism required — it reuses case 8's pattern exactly, doubled for the `!`-prefixed form.

**13. `#project`/similar inside code, link destinations, URLs, etc. → stays part of the enclosing construct.** This is the general form case 3 is a specific instance of: **link/image destinations (the `(...)` part) are consumed by `Link`/`Image`'s own destination-matching logic directly, not tokenized as ordinary inline content at all** — so a URL like `http://example.com/#project-page` sitting inside a link destination is never at risk of Tag or Mention misfiring on it, for the same structural reason code-span content is protected: it's a different kind of content, handled by a different part of the matcher, within the same single tree. No case-specific ordering needed; this is the shared-tree architecture's general guarantee, not a special rule for `#` specifically.

---

## The amended rule (recommended for locking)

> Existing valid CommonMark/GFM meaning always wins. A Clutter extension may only claim text that would otherwise remain ordinary/literal text.
>
> **Where a Clutter trigger sequence is a strict prefix of a built-in trigger** (`[[` vs. `[`, `![[` vs. `![`), registering the extension with `before` ordering relative to the built-in parser is necessary but not sufficient — **the extension's own matcher must additionally verify that no valid built-in continuation follows its closing delimiter** before committing to a match, so that a rare but genuine case of the built-in construct (e.g. a real link whose text happens to be a doubled bracket) is never silently reinterpreted.
>
> **Where a Clutter trigger shares a starting character with a built-in construct but the two don't share a starting *position*** (e.g. `@mention` vs. an email autolink, whose match effectively begins before the `@`), ordering alone (`after` the built-in) is sufficient, and should still be applied explicitly rather than relied upon via content-shape coincidence.

This is the precise distinction the original one-sentence rule was missing: it's not one mechanism ("ordering") that covers every case — it's ordering for same-*character*-different-*start-position* races, and ordering **plus** an explicit continuation check for same-*prefix* races. Both are cheap and local to the extension's own parser; neither requires reopening anything already locked in the parser-architecture decision.

Not opening the next architecture question.
