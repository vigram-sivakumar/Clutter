# Table interaction contract

Revision 0.15, confirmed by the user on 2026-11-14 during the native R07 trial.
This is the authority for the agreed table navigation/addition behaviour. It
supersedes the earlier Q-04/EI-068/EI-069 exploratory defaults. Representation,
editor engine and final handle styling remain implementation choices.

| ID     | Confirmed behaviour                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-C01 | Enter moves to the next cell below in the same column. A destination uses a collapsed caret at its text end, consistent with Tab.                                      |
| TB-C02 | Enter on the bottom row does nothing: no newline, row/column insertion or table exit.                                                                                  |
| TB-C03 | Shift+Enter inserts a hard line break inside the current cell, not another cell or paragraph split.                                                                    |
| TB-C04 | Tab/Shift+Tab move forward/backward through existing cells in row-major order. Arrival places the caret at the destination text end; it does not select all cell text. |
| TB-C05 | Tab in the final cell stays there. It does not change content, caret, focus or dimensions.                                                                             |
| TB-C06 | New rows and columns require explicit row/column handles. No navigation key creates them. Keyboard activation of a focused handle is an explicit handle action.        |
| TB-C08 | Adding either axis preserves the original active cell, caret/selection and editor focus. Row 2, cell 2 remains active when a row or column is added.                   |
| TB-C07 | All operations use the same document authority, update other views and preserve unrelated content. Unsafe undo must not delete another context's work.                 |

This is an editor navigation rule, not a requirement for DOM handles in headless
automation. Explicit API/CLI/MCP table-add operations must share the same operation
semantics rather than implement independent storage writes.

The user supplied Craft/Notion images as handle references, not a requirement to
copy their entire editor. The prototype uses an append-row handle below the table
and append-column handle on its right. Each adds one axis while preserving the
original active cell, caret/selection and editor focus. Fine-grained row/column menus, dragging, resizing, deletion and merged-cell
behaviour are not settled by this navigation decision. Do not invent them as
confirmed product scope.

For keyboard escape, the prototype exposes handles with Escape from a text caret;
Tab can then reach the other handle and surrounding controls. First-cell Shift+Tab
keeps the existing backward native focus escape. These are declared accessibility
adapter choices, not new shortcuts the user personally ratified. Include them in
native accessibility review. Do not trap keyboard users because final-cell Tab is
a deliberate no-op. Node/cell-range selections remain separately scoped.

## Evidence and qualification

- The earlier Mac observation that final Tab created one new row is a successful
  trial of the old proposal, **not** acceptance of that behaviour. It is superseded.
- The reported whole-cell text selection is a UX failure against TB-C04, not an
  intended default to preserve for compatibility.
- [Table test source](experiments/r07-two-view/test/table-browser.mjs) exercises both
  candidates. [Native progress](NATIVE-TEST-PROGRESS.md) separates observed native
  facts from unrun cases. Current Mac NM-01 must be rerun against this contract.
- Original raw controls keep an explicitly archived table profile for reproducibility;
  never treat their row-growth result as the target contract.
- The origin candidate's raw structural undo can erase foreign cell content. The
  normal prototype now conservatively refuses table-handle undo/redo after another
  context changes the document. This may also refuse safe disjoint inverses. It is
  a safety boundary for exploration, not a final semantic undo solution or an
  accepted architecture. Raw failure probes remain recorded separately.

Only the behaviours in the matrix are product requirements. A local test pass
proves the observed fixture/profile, not complete keyboard, IME, durability,
interchange or native accessibility qualification.
