# ADR-060: "Show references automatically" — an app-wide setting that restores automatic References visibility

**Status:** Accepted (product decision, Vigram, 2026-10-21 — stated in the task that implemented it)

Amends [ADR-053](./052-references-display-preferences.md#amendment-adr-053-product-decision-vigram-2026-10-13-hidden-by-default) (the "hidden by default" amendment to [ADR-052](./052-references-display-preferences.md)).

## Context

ADR-053 removed the automatic mode: a note with no saved References choice had its section hidden, even when it had references; only an explicit "Show references" displayed it. Product now wants automatic visibility back, as a choice: **Settings → Editor → Layout → Show references automatically**, on by default.

## Decision

An app-wide preference (`clutter-show-references-automatically`, raw localStorage like the week start and the assets-in-folders choice; a missing or unrecognised value is **on**) feeds the existing visibility decision, `isReferencesDisplayed(savedHidden, { enabled, count })`:

| Saved choice (`ReferencesDisplayStore`) | Shown? |
|---|---|
| `hidden: false` (explicit Show) | yes, even with no references |
| `hidden: true` (explicit Hide) | no |
| none | only if the setting is on **and** the page has at least one reference |

Unchanged: `ReferencesDisplayStore` and its stored shape (a saved choice is never rewritten by the setting, and an explicit Hide is kept as `hidden: true`, so an automatically shown section the user hides stays hidden as references change); the top-bar `toggle-references` action (it flips the saved choice; its label names what a click does, derived from the same decision); the expansion preference; reference detection and counting (`countPageReferences`, computed once per page and reused). Regular notes and daily notes share the one rule — it is evaluated in the two places that already consult the saved choice (`PageHost` for the menu label, `PageReferences` for the section).

With the setting off, behavior is exactly ADR-053's.

## Alternatives Considered

- **Persist the automatic result as an explicit `hidden: false`.** Rejected: it would write per-page state the user never chose, make turning the setting off leave sections shown, and make the stored value a lie about intent.
- **A per-page automatic flag in the store.** Rejected: the tri-state the store already keeps (absent / `true` / `false`) is exactly the information needed.

## Consequences

- Existing users, who have no stored value, get the setting **on**: notes with references and no saved choice now show the section, where ADR-053 hid it. Saved per-note choices are untouched.
- Turning the setting off restores ADR-053's hidden-by-default for every note with no saved choice, without changing any saved choice.
