# Stage 3 — confirmed editor UX decisions

Recorded 17 November 2026. Status: **UX baseline recorded.3A/63 scoped Mac PASS.64 lists implemented; list Mac check next; remaining3B–3E pending.**
This document consolidates the user's decisions and corrections from the stage3
conversation. It records the final agreed behavior, not earlier proposals. Current
application behavior and editor-library defaults are not substitutes for these rules.

Discuss UX **one question at a time** and agree the stage before implementation.
The user resumed discussion after documentation58 and approved the toolbar actions
below, adding block background colour, and chose PRESET COLOURS ONLY.
The core UX baseline is sufficient; the concrete [implementation plan](stage3-implementation-plan.md) is now prepared. Do not
continue an exhaustive minor-detail questionnaire or treat unspecified behavior
as permission to contradict this record.

## 1. Scope for this stage

| Item | Confirmed scope |
| --- | --- |
| Slash-menu blocks | Paragraph, Headings, ordered Lists, unordered Lists, Tables, Images, Separators/dividing lines, Task. |
| Headings | H1 through H6. |
| Tables | Presets **2×2, 3×3, 4×4**, selectable inside the slash menu before insertion. No interactive grid or separate size dialog. |
| Direct Image insertion | Open a file picker immediately. Allow **only one file** to be selected. No preliminary upload/URL chooser block. |
| Embeds | **Deferred.** Generic PDF/image/URL embeds and playable YouTube embeds are future scope. Do not expose an inactive Embed command in this stage's menu. |
| Existing contracts | The agreed table interactions, one Space authority, view-local histories, and task single-location/no-subtask rules remain in force except where this document explicitly refines UX. |

The direct Image file-picker action remains in this stage. The discussion deferring
image/PDF/URL **embeds** does not remove that separately confirmed Image action.
Internal Clutter-page embed requirements have not been cancelled; defer their later
implementation/UX rather than silently dropping the existing product contract.

## 2. Note title and body boundary

| ID | Interaction | Confirmed behavior |
| --- | --- | --- |
| T01 | New note | Start the cursor in the title. |
| T02 | Empty title | Display **New note** as placeholder text until a title is entered. The actual title remains empty; do not store the placeholder as title content. |
| T03 | Title capabilities | Unformatted/plain-looking text with the same semantic inline capabilities as a normal paragraph, including `@` references to other notes, dates and URLs. Share these capabilities; do not create a separately limited title pipeline. |
| T04 | Enter in title | Move to the beginning of the body. If content exists, insert an empty paragraph before it and place the cursor there. If the body is empty, use its empty paragraph. |
| T05 | Shift+Enter in title | Do nothing; leave text, selection/cursor and focus unchanged. |
| T06 | Backspace at start of first body paragraph | Move the cursor to the end of the title without merging body text into the title. |
| T07 | Title/body Undo and Redo | One ordered history in the current note view, following the order of title and body edits. Independent note views retain their separate editing histories. |

“Unformatted” does not mean reducing semantic references to literal strings or
encoding them as Markdown. The supplied screenshot illustrated inline links and
wrapping text; it did not approve exact visual styling or change these key rules.
The existing implementation's `title: string` is not a reason to weaken this UX.
A representation change must preserve one owner per fact and shared inline behavior.

## 3. Multi-line paste into the title

| ID | Interaction | Confirmed behavior |
| --- | --- | --- |
| P01 | Paste containing more than one line | Append **all** pasted lines at the **bottom of the body**. Do not put the first line into the title. Leave the title unchanged. |
| P02 | Cursor | Show no text caret after this paste. |
| P03 | Scrolling | Scroll the note to the appended content. |
| P04 | Feedback | Highlight the appended blocks. **No automatic timeout.** |
| P05 | Dismissal | Clear that highlight immediately when the user clicks **anywhere**. |

The paste highlight is transient view feedback, not saved text formatting. Do not
conflate it with text-range selection or the independent block-selection mode below.

## 4. Slash menu and block insertion

| ID | Interaction | Confirmed behavior |
| --- | --- | --- |
| S01 | Trigger | Show the menu immediately when the user types `/` anywhere in body text, including inside existing text. No whitespace boundary is required. |
| S02 | URL exception | Leave URL slashes alone; do not open the block menu for them. |
| S03 | Query with no matching item | Dismiss the menu. Menu dismissal must not erase the typed `/text`. |
| S04 | Selecting a command | Consume only `/command`. Preserve all remaining inline content together in the current block; no prefix/suffix splitting. |
| S05 | Editable text-block conversion (latest user approval66) | After command removal, convert the current empty OR filled block to the selected paragraph/heading/list type. Retain all remaining inline content together, identity, indent and parentage. |
| S06 | Focus (latest user approval66) | Editable text types receive focus with the mapped current caret, ready to type. Object insertion uses its registered focus/placement policy; Separator retains the current caret per S09. Policies must be per-type configurable properties with one shared executor, not per-command UI logic. |
| S07 | Table choices | Offer the 2×2, 3×3 and 4×4 presets in the menu before insertion. |
| S08 | Image choice | Open the single-file picker immediately. |
| S09 | Separator placement (latest user correction,17 November2026) | Remove only `/separator`. If the current block is then empty, insert the separator ABOVE it. If text/content remains, insert BELOW it. Keep the same block, text/type and mapped caret; do not split text or create a continuation paragraph. This supersedes the earlier below-divider cursor override. |

66 supersedes65 filled-text insert-below behavior;65 superseded the earlier retain-caret rule for editable text types, and the earlier
prefix/suffix split. Separator S09 is retained. Table/object placement and editable
focus targets require their own confirmed policy/actual implementation; do not infer
all object placement from Separator. Entry points share one insertion transaction;
selection is view-local, content/hierarchy remain on the shared Core/editor path.

## 5. Floating formatting toolbar

| ID | Interaction | Confirmed behavior |
| --- | --- | --- |
| F01 | Selected body text | Show a floating formatting toolbar **directly above the selected text**. |
| F02 | Placement | Anchor to the selection, not to the top of the entire block or beside the selection. |
| F03 | Selection stability | Showing the toolbar must preserve the text selection. |
| F04 | Available actions | Bold, italic, underline, strikethrough, links, text colour, highlight, and block background colour. All seven previously proposed actions are now approved; block background colour is additionally required. |
| F05 | Text highlight | Highlight applies to the selected text range, separately from block background colour. |
| F06 | Block background colour | Change the background of the entire block containing the selected text, rather than only the selected characters. |
| F07 | Colour choices | PRESET COLOURS ONLY for the toolbar colour controls. Do not add custom colour entry/pickers. Exact preset swatches are not yet specified and can be reviewed with the component. |

## Body-wide indentation (confirmed66)

Tab/Shift+Tab apply to every editable body paragraph, H1–H6 and list item using one
shared transform. Carry explicit descendants; preserve text/type, selection and
parent/child relationships. Free indentation needs no parent. Root Shift+Tab does
nothing. Title, separator and object blocks do not initiate this operation; table
cell mode retains its separate contract. List Enter/Backspace rules below remain.

## 6. Lists: indentation, Enter and Backspace

Ordered and unordered lists support nested items. Free indentation must not be
restricted by editor defaults requiring an existing parent. Distinguish three
things: visual indentation, parent-child relationships, and selection membership.

| ID | Interaction | Confirmed behavior |
| --- | --- | --- |
| L01 | Tab | Indent the targeted item and its descendants together, preserving hierarchy. |
| L02 | Shift+Tab | Outdent the targeted item and its descendants together, preserving hierarchy and parent-child relationships. |
| L03 | Previous sibling exists | For same-level items A then B, Tab on B nests B and its children under A. |
| L04 | No previous sibling/parent | Tab must still indent. A parent is not required. |
| L05 | First item followed by siblings | For first item A and same-level B, indent only A and A's descendants. B stays unchanged. |
| L06 | Shift+Tab at leftmost level | Do nothing. Keep the list item; do not turn it into a paragraph. |
| L07 | Enter on an empty item | Outdent only that empty item one level per Enter. Once already at the leftmost level, the next Enter turns it into a normal paragraph. Do not carry its children with it. |
| L08 | Children when empty parent becomes paragraph | Leave them as list items below, at their existing indentation. Do not convert or outdent them. |
| L09 | Enter at end of non-empty parent | Create an **immediate sibling at the same indentation**, before the existing children. Those children become children of the **new sibling**. Do not insert after the entire child group. |
| L10 | Enter mid-item | Keep the prefix text in the original item. Move the suffix text into an immediate same-level sibling, and make the existing children children of that new sibling. |
| L11 | Shift+Enter | Add a line break inside the same list item and keep its children attached. |
| L12 | Backspace at list-item start | First turn the item into a normal paragraph at the **same indentation**. Do not outdent it on that first press. |
| L13 | Further Backspaces at paragraph start | Outdent that paragraph one level per press. These actions affect only the current block; children remain list items at their existing indentation. |
| L14 | Backspace at leftmost paragraph start | Merge only if the **immediately preceding block is a text block**. A table, separator or other non-text block stops the action: do nothing, and do not skip over it to earlier text. |
| L15 | First body paragraph | Apply the title-boundary rule T06 instead of merging its text into the title. |

The earlier “only Shift+Tab preserves hierarchy” wording was clarified: **both
Tab and Shift+Tab preserve hierarchy**. Enter and Backspace follow their own rules.
The user explicitly identified list behavior as important UX: do not substitute
stock list behavior for this matrix or assume unspecified list details are approved.

## 7. Block handles and dragging

| ID | Interaction | Confirmed behavior |
| --- | --- | --- |
| D01 | Handles | Every block has a chrome handle. |
| D02 | Click a parent handle | Select only that parent block. Do not auto-select its children. |
| D03 | Drag a parent | Move that parent with its entire child hierarchy. Children travel with it even though selection membership is independent. |
| D04 | Drag a child | Move that child and its descendants. Leave its parent and siblings in place. |
| D05 | Horizontal drag | Dragging **only reorders** blocks. Moving left/right must not change indentation. |
| D06 | Drag a selected group | Dragging any selected block's handle moves the whole selected group, retaining its original document order. Parent/descendant movement follows D03/D04. |

Do not confuse explicit selection membership with an operation's scope. A parent's
children travel with a drag or Tab/Shift+Tab, but are not thereby auto-selected and
are not automatically deleted with it. Avoid applying a group operation twice when
both an ancestor and descendant happen to be explicitly selected.

## 8. Marquee and block-selection mode

| ID | Interaction | Confirmed behavior |
| --- | --- | --- |
| B01 | Shift+click on handles | Do **not** select the range between handles. |
| B02 | Ordinary drag inside starting block | Use text selection while the drag remains inside that block. |
| B03 | Drag leaves starting block | Transition to block/marquee selection. **Shift is not required.** |
| B04 | Where marquee can begin | Anywhere in the editor, including on top of a block; not restricted to empty space. |
| B05 | Shift+drag | Add blocks elsewhere while retaining the pre-existing selection. Selecting top and bottom blocks must not automatically select everything between them. |
| B06 | Hit rule | Select a block the moment the rectangle touches any part of it. Full enclosure is not required. |
| B07 | Drag back off a block | Deselect it immediately when the current rectangle no longer touches it. |
| B08 | Shift-additive baseline | Retain the selection that existed before the current Shift+drag. Live hit-testing changes the current gesture's additions. |
| B09 | Hierarchy | Marquee operates strictly per block. No parent-child selection propagation in either direction. Use each block's own area, not an enclosing parent box that includes child blocks. |
| B10 | Normal click inside text | Clear block selection and place the caret at the clicked position. |
| B11 | Escape | Clear block selection and leave **no text cursor**. |
| B12 | Ordinary typing with blocks selected | Do nothing. Do not replace selected blocks with typed text or a new paragraph. |
| B13 | Delete/Backspace | Delete **only explicitly selected blocks**. Delete children only when they are selected too. |
| B14 | Parent deleted, children not selected | Keep those children at their current indentation. Do not automatically outdent or delete them. |


### Select-all refinement — user confirmed17 November2026; queued for3C

| ID | Interaction | Confirmed behavior |
| --- | --- | --- |
| A01 | First Ctrl+A with caret in a body block | Select all text in that block only. |
| A02 | Second Ctrl+A | Leave text selection and select all BODY blocks as blocks, excluding the title. |
| A03 | Title isolation | Ctrl+A originating in the body must NEVER include the title. |
| A04 | Ctrl+A with caret in title | Select only title text; do not expand into body blocks. |
| A05 | Escape | Clear selection; block mode follows B11 (no text caret). |

Implement this with the block-selection mode in3C, including platform-standard
Command+A on Mac and Ctrl+A elsewhere.61 records the decision; it does not add a
competing temporary select-all implementation to block insertion. Table-cell mode
retains its own contract. Do not let PM's default whole-document selectAll become
the final product behavior.

Table-cell selection remains a separate mode with its already-confirmed Escape,
Enter and Tab behavior. B11 must not overwrite that table contract. The persistent
paste highlight in section3 is also separate from this selection model.

## 9. Task blocks and page conversion

The task has one stable identity and one owning location. Tasks do not gain semantic
subtasks from visual indentation. Conversion must not create a duplicate task.

| ID | Interaction | Confirmed behavior |
| --- | --- | --- |
| K01 | Insert Task | Insert it inline in the note, with inline title editing and no task-creation dialog. |
| K02 | Before conversion | Clicking the title edits it inline. |
| K03 | Conversion | Only clicking the adjacent icon converts the task into a full task page. |
| K04 | After conversion | Clicking its title opens the task page directly rather than editing the title inline. |
| K05 | Checkbox after conversion | Toggle completion directly, without opening the page. |
| K06 | Enter in non-empty inline title | Create another task immediately below. It is a separate task, not a semantic subtask. |
| K07 | Enter in empty inline title | Turn that empty task block into a normal paragraph instead of creating another task. |
| K08 | Backspace at inline title start | Turn it into a paragraph at the same indentation **only if it has not been converted to a page**. |
| K09 | Shift+Enter in inline title | Do nothing. |

Existing single-location/copy/move/delete/recovery contracts still apply. Removing
a task placement must not leave an invisible active orphan. Preserve task identity,
completion, properties and ownership during page conversion. This refines the earlier
always-open-as-page UX assumption; it does not authorize a second task data owner.
Unconverted-task routing in the global Tasks view belongs to that view's later UX stage.

## 10. Existing table contract stays authoritative

Read [table interaction contract](../table-interaction-contract.md) rather than
re-asking its decisions. Its agreed rules include:

- Enter moves down the same column; at the bottom it does nothing and adds no row.
- Shift+Enter inserts a break inside the cell.
- Tab/Shift+Tab move through existing cells. Final Tab stays in the final cell.
- Clicking a cell shows its highlight/caret. Escape removes the caret but retains
  the selected cell. In cell-selection mode, Tab moves the highlight without a
  caret, and Enter resumes editing.
- Explicit row/column handles add an axis and preserve the active cell/caret/focus.
- Triple-click selects the cell's text, not the entire cell object.

The source contract owns finer boundaries and unresolved prototype choices. Prior
native table observations belong to the retired proof, not to this unimplemented
stage3 component.

## 11. Final clarifications and superseded proposals

| Earlier wording/proposal | Final decision |
| --- | --- |
| Untitled placeholder | **New note** placeholder; real title initially empty. |
| Pasted-block highlight disappears after three seconds | **No timeout**; clear immediately on any click. |
| Move cursor into a slash-inserted block | **Keep the cursor where it was.** |
| Shift required for marquee over text | No Shift: text selection inside starting block becomes block selection when dragged outside. Shift is for additive selection. |
| Select parent implies select children | **No** automatic family selection. |
| Delete parent implies delete descendants | Delete only explicitly selected blocks; unselected children survive at unchanged indentation. |
| Only Shift+Tab preserves hierarchy | **Both Tab and Shift+Tab** preserve hierarchy. |
| Enter inserts a sibling after all existing children | **Immediate** sibling; children reparent to it. |
| Select multiple image files | **One file only.** |
| Include Embed in this stage | **Deferred**, including YouTube. |
| Every task opens as a page from initial insertion | Inline editing until explicit icon-driven conversion, then title clicks open the page. |

Some rows were rejected suggestions rather than previously accepted rules. This
ledger exists to prevent a future agent reviving either kind of superseded proposal.

## 12. Open question and continuation

**Next step: implement part3A of the [stage3 plan](stage3-implementation-plan.md).
No further required pre-code UX questions.** The toolbar action list and preset-only colour policy
are answered (F04–F07). The user asked how many questions remain; stop the serial
minor-detail questionnaire. Do not re-ask confirmed decisions. Use consistent
editing conventions for ordinary implementation details; bring up only genuine
material blockers, one at a time. Visual details can be reviewed with the component.

Unspecified details are not silently settled by this document. Resolve material
ambiguities as needed, one question at a time, without reopening agreed behavior.
Precise insertion-caret mapping and later global Tasks routing are noted above;
this is not permission to implement a different visible interaction.

Implementation must preserve the selected architecture: one Core/Space authority;
one shared React web UI; PM owns editable DOM; no React body mirror or separate
title/task save pipeline; stable view/context identity; independent view histories;
safe close/protection across all retained work. Old Markdown/CM6 code is not a
compatibility constraint. Do not reopen the completed host-selection research.

## 13. Implementation and evidence status

- **No stage3 application/schema/editor implementation has started.** This is a UX record.
- Delivered57 remains the current application baseline. Its114 passing Linux checks
  are historical implementation checks, not tests of these new UX decisions.
- User reports56 flicker stopped and57's scoped split-policy/new-window check works.
  Do not infer broader app-quit/refusal, IME, shipping or installed-data qualification.
- This documentation checkpoint changes no application source, dependency locks,
  native code, build outputs or sessions. No app test/build replay is needed for it.
- [Resume checkpoint](../START-HERE.md) tells the next agent where to continue.
