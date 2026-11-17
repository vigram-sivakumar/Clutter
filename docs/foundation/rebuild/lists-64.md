# Capability64 — ordered and unordered lists

**Insertion/focus refinement65:** read [the current policy](insertion-policy-65.md).
Empty text blocks now convert in place; filled text blocks insert below; caret enters
the chosen editable block. Earlier instructions below to click the inserted row or
retain/split the original paragraph are historical, not the current text-insertion rule.

17 November2026. Implemented; automated checks PASS. Scoped Mac list check next.
Both63 separator checks are user PASS. No formatting or3C block selection is bundled.

## Delivered

Working slash choices Ordered list (/ol), Unordered list (/ul), /list filters both.
Insertion obeys S06: existing caret stays; click the new empty list row to type.
The SAME document/context/history/Core save path owns list content. One flat list_item
block has stable ID, listStyle, indent, optional visual parentId and shared inline
content. Shift+Enter inserts hard_break inside it. No Markdown markers or stock nested
list owner. Numbering/bullets are derived decorations; indentation is a style projection.

The confirmed key matrix is implemented for both styles:

| Action | Behavior |
| --- | --- |
| Tab | Target and explicit descendants indent together. Previous same-level list sibling becomes parent where available; free indentation without a parent is legal. Unrelated siblings stay unchanged. |
| Shift+Tab | Target/subtree outdent one level, retaining internal parentage. Leftmost does nothing; no paragraph conversion. |
| Enter in nonempty item | Immediate same-level sibling. Prefix stays, suffix moves; direct children transfer to new sibling and grandchildren stay attached. Caret enters that sibling. |
| Shift+Enter | Inline break in same item; children unchanged. |
| Enter on empty item | Outdent current row only until leftmost; next Enter converts it to paragraph. Children keep their indentation/list type and are detached under the old parent/free roots. |
| Backspace at list start | Paragraph at SAME indent first. Children retain type/indent, detached under old parent/free roots. Further Backspaces outdent just that paragraph. |
| Leftmost paragraph Backspace | Merge only with immediately preceding text block. Separator/non-text stops merging; first body paragraph respects title boundary. |

Visual hierarchy is separate from selection and task ownership. No semantic subtasks.

## Parentage and history boundary

The older prototype validator required depth-first/contiguous indent ancestry. That
incorrectly refused outdenting B under A while an unaffected later child C stays
under A: it would demand moving/reparenting C.64 validates parent-before-child,
lower parent indentation and unique IDs instead. This still prevents cycles and
forward/dangling/self references, supports free indented roots and preserves unrelated
rows without imposing nested DOM/list defaults. Explicit references define subtree
scope, not a CSS rectangle or every row with a larger margin. This refines the
canonical graph admission rather than introducing a bypass or a duplicate hierarchy.

Each structural key is one origin-history action. List containers now receive the
same foreign-text protection as headings/paragraphs. A regression checks Undo of
Enter after another view types into its new sibling; foreign text/parentage survive
and save through Core. Empty list body is structural content: title Enter inserts
an actual paragraph before it instead of treating it as an empty paragraph.

## Evidence

Full162-test Linux suite PASS; final77-test editor run adds title/empty-list
and linked-text line-break boundary regressions (164 unique passing tests). Strict Core/runtime TS PASS;
46-source dependency checks PASS. No tests deleted. Actual production React menu/
PM/Core/SQLite checks ordered markers, Enter/Tab/ShiftTab, retained editor and saved
reopen. Real CLI/MCP processes write list content into a mounted view and read back
UI edits. Schema tests refuse invalid styles, dangling/self parentage and title breaks.

Tests cover both styles, first-item/free indent, parent with children/grandchildren,
following siblings, mid/end Enter transfer, empty Enter, Backspace sequence, non-text
barrier, derived numbering, history/foreign content, saved type/IDs and peer clients.
Native Mac keyboard/pointer/IME/marker paint and shipping qualification are not inferred.
No native/dependency/lock change; schema2 is extended with list_item/body hard_break.
Fresh synthetic build; prior sessions remain with original bundles. No migration.

## Scoped Mac checklist — one at a time

Build `npm run desktop -- --new` after applying64 over63.

1. Choose Ordered list using /ol. Click its new list row; type First and press Enter.
   A second item numbered2 appears with the caret in it. Repeat with /ul for bullets.
2. Make A, child, B. Tab/ShiftTab on a parent carries its children but not following
   siblings. First item can indent alone; ShiftTab at leftmost does nothing.
3. Enter mid-parent creates immediate sibling; child rows attach to new sibling.
   ShiftEnter stays in the same item as a line break.
4. Empty Enter outdents then becomes paragraph. Backspace first becomes paragraph
   at same indent, then outdents one level per press. Children do not move with it.
5. Undo/Redo, Save, safe close/reopen retain list content/indent/markers.

Record failures and fix THIS capability before formatting. Ctrl+A A01–A05, handles,
marquee/drag and explicit block deletion remain3C; do not claim those implemented.
