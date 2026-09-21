# Table Range Selection & Clipboard — UX Contract

**Status:** Decided (UX only). Not yet implemented. This document is the source of truth for the behaviors below; do not silently re-derive or reopen them during implementation — if a case isn't covered here, stop and ask rather than inventing behavior.

**Relationship to other docs:** builds on [ADR-034](./adr/034-table-architecture-html-projection-active-cell-editor.md) (Architecture E) and the current shipped implementation audited in `table-architecture-audit.md` (delivered separately, not checked into this repo). Does not reopen either. Assumes `docs/implementation-rules.md`'s process applies once implementation starts (this table subsystem falls under UI/Features governance, not the Vault/Gate rules, per `table-implementation-plan.md`'s pre-implementation scoping).

---

## Range selection

**Anchor.** The cell where a drag starts is the range's anchor. Dragging defines a rectangle from the anchor to the current cell. The anchor stays "the active cell" for the lifetime of the range selection — it is not just the drag's geometric origin, it is the cell all clearing/navigation behaviors below fall back to.

**Click.** Clicking another cell clears the range selection; the clicked cell becomes active. Existing click-to-caret-position behavior is unchanged.

**Arrow keys.** Clear the range selection, then run the existing table arrow-navigation behavior starting from the anchor cell. No new range-aware navigation.

**Tab / Shift+Tab.** Clear the range selection, then run existing Tab/Shift-Tab navigation from the anchor. No "navigate within the selection" behavior.

**Enter.** Clear the range selection, then run existing Enter behavior from the anchor.

**Typing.** Clears the range selection; the anchor becomes active; typed content is **inserted** at the anchor cell's existing caret position (not a replacement). Caret ends up after the inserted text.
Example: anchor cell contains `Vik`, range selected, type `Hello` → cell becomes `VikHello`.

**Backspace / Delete.** Clears the contents of every selected cell. The range selection **stays active** afterward — a second Backspace/Delete on an already-empty selection is a no-op, not a collapse. This is the one operation in this contract that does *not* clear the range selection first.

---

## Clipboard

**Copy.** Preserves the rectangular cell structure (missing/empty cells copy as empty cells, never omitted). Clipboard payload includes both TSV (for Excel/Sheets-style grid destinations) and an HTML/rich representation (for rich-text destinations). Clutter's own Markdown-native copy behavior must not degrade — i.e. whatever plain-text/Markdown representation exists today keeps working alongside the new formats, not instead of it.

**Copy within Clutter.** Pasting a copied range into another Clutter table preserves Markdown content/formatting verbatim — `**Vik**` copied and pasted stays `**Vik**` (renders bold), not literal text or stripped formatting.

**Cut.** Same clipboard representation as Copy, then clears the selected cells' contents (same clearing behavior as Backspace/Delete), then keeps the same range selection active — mirrors Backspace/Delete's "selection survives" rule.

**Paste inside a table.** Starts at the current/anchor cell (or the range selection's anchor, if a range is active). Pasted cells **replace** existing content — no shifting of surrounding cells right/down. If the pasted rectangle is larger than the table, the table auto-expands (rows and/or columns added) so the full paste fits. If the pasted rectangle is smaller than an active selection, only the corresponding top-left area is replaced; the rest of the selection's cells are left unchanged. After paste, the selection is kept (not collapsed to the pasted area, not cleared).

**Paste outside a table.** Tabular clipboard data (TSV-shaped or similar) creates a new Markdown table rather than being dropped in as unrelated plain text.

**External spreadsheet paste.** Ragged/incomplete external data (e.g. copied from Excel/Sheets with some rows shorter than others) is normalized into a structurally complete Markdown table — missing trailing cells become empty cells, not omitted or misaligned.
Example:
```
Name    Role    City
Vik     UI
Sam     UX      Pune
```
becomes:
```
| Name | Role | City |
|------|------|------|
| Vik  | UI   |      |
| Sam  | UX   | Pune |
```

---

## Critical invariant — non-negotiable

**A Clutter table must never be structurally broken or expose missing cells to the user.** Every logical row has every required column, always. Any operation encountering a missing cell (malformed Markdown, ragged paste, partial external data) must treat/create it as an empty cell and continue operating on a complete rectangular model. No operation may leave the table in a state with a missing cell exposed to the user.

This applies to: rendering, activation, navigation, selection, range selection, clear contents, copy/cut, paste, row insertion, column insertion, row deletion, column deletion, undo/redo, Markdown normalization, and external spreadsheet paste.

**This supersedes, at the UX layer, the existing internal "ragged row" tolerance.** The current implementation's ragged-row *handling code* (`getRowCellBounds`, `resolveLogicalCell`, etc. — see Impact Mapping below) exists to let internal logic cope with ragged Markdown gracefully; it is not permission for ragged state to ever be user-visible. Going forward, ragged-row-tolerant code should be read as "defensive handling of malformed input on the way to normalizing it," not as a feature the UX exposes.

---

## Impact mapping — existing pieces likely affected

Based on the current shipped architecture (Architecture E: root `EditorView` + one reusable nested `EditorView`, `tableWidgetField`, `tableActiveCellController`, three sibling `StateField`s for selection state) audited immediately before this contract was written. This is a *scoping note for future implementation*, not a design — nothing here is decided beyond "this file will need to change."

**Range-selection lifecycle**
- `tableSelection.ts` — `tableSelectionField`'s `range` kind needs an explicit anchor concept threaded through its whole lifetime (currently anchor/head exist for drag geometry, but nothing keeps "anchor is the fallback active cell" as a durable property once the drag ends). Also the currently-known bug (`remapTableSelection` unconditionally nulling `range` selections on structural edits, found in the prior audit) sits directly in this file and is squarely in scope once range selection is touched at all.
- `tableCellRangeSelection.ts` — drag mechanics; the anchor-tracking here would become the same anchor referenced by clear/navigate/type behaviors, not just drag geometry.
- `tableActiveCellController.ts` — currently `deactivate()` is called whenever a range selection starts (no active cell during a range selection). The new contract requires "the anchor is virtually active" for clearing/navigation/typing purposes without literally reactivating the nested editor mid-selection — this is a real design question for implementation time, not settled here.

**Clear-then-navigate behaviors (Arrow/Tab/Enter)**
- `tableCellNavigation.ts` and `tableBoundaryNavigation.ts` — both currently assume either "no selection, ordinary caret navigation" or are entirely bypassed while a range selection is active (no active cell exists to hold nested-editor focus). Need a "clear range selection, then re-enter navigation from the anchor" pre-step wired into whichever keymap layer currently handles Arrow/Tab/Enter while a `TableSelection` is active.

**Typing while a range is selected**
- No current path handles this — today, typing requires an active cell (nested editor focused); a range selection has no active cell. Needs new wiring: on first keystroke with a range selected, activate the anchor cell (preserving its existing content/caret position) *before* the keystroke is applied, then let the existing forward-to-root path take over.

**Backspace/Delete keeping the selection alive**
- `tableSelectionClear.ts` — already implements content-blanking for a `TableSelection` (this part is very close to the target behavior already). Needs verification that the selection state itself is untouched after clearing (i.e. it doesn't get nulled as a side effect of the same transaction) — worth an explicit check against current behavior before assuming it already satisfies "selection stays active."

**Clipboard (copy/cut/paste) — no existing implementation found in the prior audit**
- This is new surface area, not a modification of an existing module. Likely needs a new module (e.g. `tableClipboard.ts`) handling: `copy`/`cut` event interception while a `TableSelection` is active, TSV + HTML clipboard payload construction, `paste` event interception both inside and outside a table, external-spreadsheet-shaped-text detection and conversion, and table auto-expansion (which overlaps with `tableRowInsertion.ts`/`tableColumnInsertion.ts`'s existing row/column-adding logic, but paste's "replace, don't shift" semantics differ from those modules' current insert-and-shift semantics enough that reuse should be checked case-by-case rather than assumed).
- `renderInlineMarkdown.ts` and `tableGeometry.ts`'s cell-bounds/padding functions are the likely reuse points for building the HTML/TSV serialization and for placing pasted content back into Markdown source ranges.

**The rectangular invariant**
- `tableActivationNormalization.ts` already seeds a blank data row and canonicalizes the delimiter row on table creation — this is the closest existing precedent for "auto-fill to keep the table well-formed," and is the natural place to extend from, though it currently runs only at activation-time, not on every subsequent structural operation.
- `tableGeometry.ts`'s ragged-row-tolerant functions (`getRowCellBounds`, `resolveLogicalCell`, `padCellContent`) currently treat raggedness as an input condition to handle gracefully, not a state to eliminate. Under this contract, every structural operation (insertion, deletion, paste, clear) needs to guarantee it leaves the table rectangular afterward — likely a shared "normalize to rectangular" step invoked at the end of every structural operation, rather than relying on read-time tolerance alone.
- `tableRowInsertion.ts`, `tableColumnInsertion.ts`, `tableSelectionDeletion.ts` — each currently operates correctly on the existing shape; each would need to be checked against "does this operation's output stay rectangular given a ragged input," not assumed safe by default.
- Undo/redo of any of the above — `tableSelectionDeletionHistory`'s `invertedEffects` pattern is the existing precedent for keeping selection state consistent through undo/redo; the same discipline would need to extend to clipboard operations and to whatever new rectangular-normalization step is added.

---

**No code has been changed. No commit made.** This document records the UX contract only. Per the user's explicit instruction, further UX questions are paused and no implementation should begin until asked for separately.
