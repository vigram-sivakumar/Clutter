# Body-block selection71

17 November2026. First3C capability after completed Mac formatting70/client68
milestones. One keyboard capability complete in source; scoped Mac check pending.

| Input/state | Behavior |
| --- | --- |
| First Cmd+A / Ctrl+A in body text | Select current block text only, including empty block stage |
| Second consecutive select-all | Explicit BODY block selection, title excluded |
| Select-all in title | Title text only, repeatedly; no expansion into body |
| Escape from selection | Clear highlight/range and leave no text caret |
| Ordinary typing/Enter in block mode | No replacement or new content |
| Normal text click | Resume normal caret at clicked position |
| Delete/Backspace in block mode | Delete only selected IDs, preserve title and unselected descendants/indent |

One empty paragraph remains after deleting all body. Bulk deletion stays in empty
no-caret mode; click text to type. This destination is specific to bulk selection;
single selected separator67 keeps its previously agreed nearby-body-text caret rule.
Copy content contains only explicit selected IDs in document order, never title or
unselected rows. Cut/paste/drop replacement is inhibited while in block mode (no new
paste/move semantics introduced here). Regular text-mode editing/paste is unchanged.

## Single selection and deletion ownership

body-selection.mjs defines BodyBlockSelection, a PM selection with stable explicit
IDs, ranges, copy slice and no-caret visibility. IDs are view-local, not content attrs,
not a React body mirror or saved Core state. Empty mode has no selected blocks/caret.
One staged keyboard adapter records only the first select-all press for a current
block; document/selection changes reset that stage. Body mode membership itself is
owned exclusively by PM selection. Selection-only operations do not save a new root.

Context history bookmarks and existing public Y before/after selection guard preserve
custom selection by IDs across Undo and peer mutations. Missing IDs drop cleanly;
title is never eligible. Existing binding safety shield is internal/synchronous,
not the actual select-all behavior. No dependency fork/private binding patch or new
history manager. Newly mounted/reopened contexts do not restore block selection as
saved document formatting. Formatting toolbar handles text ranges only and hides
on body-block mode; paste feedback/table-cell modes retain separate contracts.

deleteBlocks is the one structural deletion transform shared by object and block
adapters. Only explicit IDs are removed. Surviving children bypass selected ancestors
to nearest surviving parent at their unchanged indent; content and formatting remain.
Adapters choose their different selection destinations on the same normal context/
Core/history/save path. No alternate semantic writer or CLI/MCP deletion owner.

## Scope and next pointer capability

This delivers keyboard A01–A05 and reusable explicit selection/deletion behavior.
Marquee/own-row geometry/Shift-additive hit-testing, handles and group/hierarchical
reordering are NEXT on this same model, not implemented here and not placeholders.
Do not call whole3C complete. Future pointer adapters set explicit IDs; descendant
move/indent scope must remain independent of flat membership. Native table-cell
selection remains a separate mode when tables are implemented.

## First scoped Mac check

Apply71 over70; `npm run desktop -- --new`, no npm install. Give a note a visible
title and two body paragraphs. Place caret in the SECOND paragraph.

1. Cmd+A once: only second paragraph text selected.
2. Cmd+A again: both BODY blocks highlighted as blocks, title unselected.
3. Next separate check: Escape clears highlights with no caret; click body text to
   resume normal typing. In title, repeated Cmd+A must select title text only.
4. Later check explicit deletion, Undo/Redo and Save/reopen; no completed formatting/
   client milestone replay. Same accepted path is checked by real peer regressions.

Native pointer/pixel/IME/Windows qualification is not inferred from Linux checks.

## Verification and mandatory completion review

218 full Linux tests PASS.8 new scoped integration cases PASS; final expanded
noncontiguous copy/delete/real-peer check PASS after adding explicit gap coverage.
Strict Core/runtime TS and57-source dependency boundaries PASS. Tests cover both
Meta/Ctrl variants, two presses in empty text, title isolation, explicit/no-caret
mode, ordinary click handler, input/read-only guards, selected parent chains,
unselected child formatting/indent, disjoint copy/deletion, Undo/Redo/mapping and
actual CLI/MCP accepted readback. Production React/PM/Core/SQLite case verifies text
then block mode, title exclusion, no replacement, toolbar dismissal, deletion,
Save/Undo and context reopen with no persisted selection.

One shared structural deletion replaces the old object-only implementation; no
parallel child-repair or accepted writer. Existing history/bookmark/Y safety bridge
is extended for the one selection type, not duplicated. No Core/runtime/native/
schema/contracts/dependencies/locks changed. Keyboard selection transforms and CSS
are shared across platforms; actual Mac/Windows/IME pointer/pixel claims remain
separate. Marquee/handles/reordering tests are not claimed from keyboard coverage.

## Actual71 observation and72 correction

User says the requested two-stage Cmd+A/body/title check works. User reports delayed,
faded initial caret blinks after deleting then clicking editor.72 preserves no-caret
bulk-delete behavior and corrects text re-entry/selection-guard timing. Read
[caret restore72](caret-restore-72.md). The assistant's alternate show-caret-on-delete
proposal was not applied. No whole3C/native pointer completion inferred.
