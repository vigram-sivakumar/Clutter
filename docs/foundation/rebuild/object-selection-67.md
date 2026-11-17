# Selected objects67

17 November2026. User approved selected-separator insertion/continuation, click
selection, Backspace/Delete deletion and nearby body caret fallback. Supersedes63;
not a reinstatement of62's eager continuation/cursor jump. Text controls66 unchanged.

| Input | Result |
| --- | --- |
| /separator in empty text | Convert same block/ID to separator, select it; no spare blank paragraph |
| /separator in filled text | Preserve complete remaining text/type; separator after explicit descendant group; select it |
| Click separator | Select/highlight it, hide text caret |
| Enter on selection | Normal paragraph immediately below; reuse existing empty paragraph with same indent/parent, else insert; caret at start |
| Backspace/Delete on selection | Remove object; previous BODY text end preferred, otherwise next BODY text start; otherwise adjacent object selected |
| Only body object removed | Empty paragraph with caret; never title |

Unselected children retain their indent/content; direct children inherit deleted
object's former parent. Existing nonempty paragraphs/headings below are not converted
or consumed by Enter. Continuation retains object's indent/parent, but normal text
type/marks, independent of original heading/list source. Insertion, continuation and
deletion have separate ordinary context-history boundaries; selection-only clicks
are not content mutations. Modified/IME/read-only guards apply to object commands.
No automatic paragraph mutation on load/remote read. Tables keep cell-specific rules.

## Shared implementation and review

block-definitions supports focus:selected for selectable atomic blocks; empty convert
is safe only on empty source, nonempty object conversion is rejected. Existing
createInsertionTransaction consumes slash range and performs policy action. One
object-interactions module owns click/Enter/delete; no separator-ID keyboard switch.
bodySelectionNear is shared by deletion and remote-removal fallback. Node selection
is actual PM state and the highlight is CSS, never a saved document property.

The new tests exposed y-prosemirror restoring NodeSelection at an erased doc-end
position on Undo. node-selection-bridge registers public Y transaction events before
view bindings, synchronously shields node selections with AllSelection, restores
surviving canonical IDs or body-only fallback. No dependency patch/private binding
field/second history. Bridge selection-only transactions must not mark addToHistory
false: binding flags can otherwise suppress the pending content transaction.
Observers are disposed with the replica. No normal loading/focus/render cycle added.

Mandatory review: old separator retained-caret assertions superseded; text policy,
indent transform, graph selectors, accepted Core/SQLite and per-context history retain
one owner. No native/OS feature code, schema/contracts/dependencies/locks/runtime source
changed. CLI/MCP remain real peer clients on the existing accepted path.

## Evidence

191 full Linux tests PASS. Final16 focused editor tests PASS includes two subsequently
added ordered/unordered parent/child cases. Strict Core/runtime TS and51-source
boundaries PASS. Covers H1–H6, empty replacement, adjacent paragraph reuse, normal
continuation before existing heading, click handler, delete caret cases/lone object,
unselected children, Undo/Redo, read-only/composition/modifier guards, saved accepted
root and reopen. Real CLI/MCP read UI insertion/continuation/deletion; real MCP removal
of a selected last object safely reaches body text. Production React/PM/Core/SQLite
checks actual menu selection class/focus, Enter paragraph and accepted order.
No native pointer hit-testing, pixels, Windows/IME or shipping qualification claimed.

## Next scoped Mac check

Apply67 over66. Run `npm run desktop -- --new` for changed source; prior synthetic
sessions keep their old bundles. No dependency install.

1. In filled paragraph or list use /separator. Source text stays; divider highlighted,
   no text caret. Enter starts normal paragraph below; type immediately.
2. Click divider: highlight returns. Backspace deletes; caret at preceding body-text
   end. Undo restores divider. Click it and Delete: same deletion/caret rule.
3. Empty paragraph /separator replaces that block. Enter produces one paragraph below;
   reuse an empty paragraph if already there. Deleting sole separator leaves empty
   body paragraph with caret, never title.

Record scoped result before moving to dedicated real Mac CLI/MCP read/write/conflict/
save/reopen acceptance, then formatting. Ctrl+A/body block selection remains3C.
