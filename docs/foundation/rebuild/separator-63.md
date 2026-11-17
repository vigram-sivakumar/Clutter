# Separator placement63

Historical separator behavior is superseded by [selected objects67](object-selection-67.md).
Earlier scoped passes remain historical evidence.67 changes separator focus/empty
placement;66 text conversion and body-wide indentation remain current.


17 November2026. Latest confirmed user decision; supersedes62. Implemented;
empty-block/above placement is user PASS. Nonempty-block/below check is next. No new capability is bundled into this correction.

## Current behavior

Remove only /separator. Judge emptiness AFTER removal:

- Empty block: insert divider ABOVE; keep that same empty block/caret below.
- Nonempty block: insert divider BELOW; keep prefix and suffix together in that
  same block, with caret mapped to where the command was removed.

No separator-specific cursor jump, forced paragraph conversion, split suffix or
new continuation block. Existing block type/identity/inline content remain intact;
a heading stays a heading. Existing later blocks remain unchanged. Pre-existing
child groups keep their existing parent/order, with a below insertion after that
visual group as before; no list/hierarchy behavior is added in this correction.

One shared deterministic PM transaction deletes the command then inserts the divider;
normal transaction mapping retains selection. React menu/save/Core/history ownership
is unchanged. Basic heading CSS already exists; current heading-sized text remains
heading-sized intentionally rather than being hidden by a paragraph CSS override.

The earlier62 implementation moved caret below and forced paragraph continuation.
The user has explicitly withdrawn that rule. Its tests were updated to these current
outcomes; do not count both contradictory behaviors as passing requirements.

## Verification and next action

56 editor checks PASS: empty insertion with no extra blank block, paragraph identity,
all H1–H6 nonempty cases, complete prefix/suffix text, caret/focus retention, save,
Undo/Redo and existing peer CLI/MCP/history regressions. One production React/PM/
Core/SQLite integration test checks both empty/nonempty menu actions, unchanged
editor/current-paragraph DOM, actual selection and accepted persisted order.
45-source boundary checks PASS. No full-suite replay, native build/pointer/IME or
shipping pass inferred. Core/schema, CSS, native source/dependencies/locks unchanged.

63 supports delivered61 OR62. Apply it directly to the version present; do not apply
62 just to install63. Helpers select matching exact paths and refuse conflicts/main.
Build using `npm run desktop -- --new`; previous synthetic sessions keep original
bundles. No migration or existing-user data work.

Mac check one at a time:

1. In an empty body paragraph, type /separator and select it: divider ABOVE, same
   empty paragraph below with caret ready to type; no extra empty line above.
2. In a nonempty paragraph, insert /separator in its text and choose it: remove
   command only, keep all remaining text together, divider BELOW, caret stays at
   the removed command position. Undo/Redo should treat insertion as one action.

Confirm this correction before lists/formatting. Ctrl+A A01–A05 remains queued for3C.
