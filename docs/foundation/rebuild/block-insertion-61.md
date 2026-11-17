# Capability61 — slash block insertion

**Insertion/focus refinement65:** read [the current policy](insertion-policy-65.md).
Empty text blocks now convert in place; filled text blocks insert below; caret enters
the chosen editable block. Earlier instructions below to click the inserted row or
retain/split the original paragraph are historical, not the current text-insertion rule.

**Current separator behavior is defined by [correction63](separator-63.md).**
The earlier cursor-jump/normal-paragraph rule below is historical and superseded.

17 November2026. Implemented/automated checks PASS; scoped Mac check pending.
This is the first capability under3B, not all blocks/formatting or all stage3.
User61 reports everything looks good with one separator-focus correction.
[Correction62](separator-62.md) implements the confirmed exception: normal paragraph
and caret BELOW the separator. Other insertions keep the original caret.

## Delivered behavior

- / opens the shared React menu in body paragraphs/headings, including mid-text.
  Working options only: Paragraph, Heading1–6, Separator. /h1…/h6 filter directly.
- URL slashes (schemes, www, bare domains, link-mark text, common punctuation) do
  not trigger it. An unmatched query dismisses the menu without deleting text.
- Arrow keys choose; Enter or pointer selects; Escape/outside click/blur dismiss.
  A stale menu callback cannot apply to a changed query/range.
- One deterministic PM transaction consumes only /command, retains prefix/suffix
  inline content, inserts an empty block, and keeps caret in the original prefix.
  No focus jump into the inserted block. Suffix retains its original text-block
  type/inline content and gets its own stable identity.
- Existing children/indented blocks retain identity/order/parentage; new siblings
  are inserted after that existing visual group. No list/hierarchy UX is invented.
- Heading Enter at its end creates a paragraph. Body-start Backspace goes to title
  end; a separator above a text block stops Backspace merging. Shared title/paste,
  save/protection/recovery and retained view lifecycles remain the same.

Editor owns query/range/commands/history; React only owns menu chrome outside the
editable DOM. There is no second document reducer/save implementation. Core's same
accepted schema handles UI, CLI and MCP. JSON AND raw Y XML checks reject invalid
heading levels, separator content and unknown fields before accepting a root.

Structural Undo originally inherited paragraph-only protection from upstream.
The new regression caught deletion of a heading containing foreign-context text;
OriginHistoryContext now protects title/heading text containers as well. Empty local
headings can still undo; foreign heading content survives, saves and reconciles.
No stale-root restoration or unrelated history manager was introduced.

## Verification

133 Linux tests PASS, strict Core/runtime TypeScript and45-source boundary checks
PASS. Final49-test editor run also checks URL punctuation. No test was deleted.
Coverage includes six levels, exact prefix/suffix/caret, arrows/Escape/unmatched/URL
queries, normal paragraph and separator insertion, stable IDs, heading Enter, safe
Backspace, Undo/Redo, foreign heading preservation and actual CLI/MCP writes/readback.
The actual production React menu/PM/Core/SQLite integration checks pointer selection,
focus, unchanged editor DOM and persisted structure. Existing navigation/recovery/
window-surface tests pass. No native source, dependencies or locks changed.

This does not establish native61 menu positioning/pointer/IME/no-blank-paint or
shipping qualification. Previous3A Mac passes are now recorded for their actual
scope; no need to replay that checklist. Build61 with --new, preserving prior
synthetic sessions with their original bundles; no old-format migration work.

## Scoped Mac check — one at a time

1. In a note BODY, type /. Menu shows Paragraph, Heading1–6, Separator.
2. Type before/h2 and choose Heading2. Only /h2 disappears. before stays, an empty
   heading is added below, and caret remains after before. Click the heading to
   type into it; do not expect automatic focus there.
3. Type /h3 inside existing text with a suffix; choose it. Both sides survive in
   their original order. Undo/Redo reverts/restores that insertion as one action.
4. A URL slash does not open the menu. /nonsense dismisses it without erasing text.
5. Insert Separator; Backspace at start of the following paragraph does nothing.
   Save, close and reopen: inserted structures remain.

Record failures precisely and fix THIS capability before adding the next. Menus for
lists/tasks/images/tables are intentionally absent until their real behavior lands.

## Queued UX and next work

User confirmed Ctrl+A A01–A05: first selects text in current body block, second
selects all body blocks, title is NEVER included; title selects only its own text;
Escape clears selection. Implement with3C block mode, not as a temporary parallel
select-all handler here. Platform-standard Command+A applies on Mac.

After61 Mac check, next3B capabilities are list behavior and formatting/shared inline
controls, one capability at a time using the recorded UX. Then3C block selection/
drag/Select-all,3D tasks/images,3E tables and integrated familiar UI. Do not reopen
host research, migrations or minor-detail questions already resolved.
