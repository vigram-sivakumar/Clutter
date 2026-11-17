# Separator correction62

**Current separator behavior is defined by [correction63](separator-63.md).**
The earlier cursor-jump/normal-paragraph rule below is historical and superseded.

17 November2026. Shared insertion fix implemented; scoped Mac confirmation pending.
User61: everything looks good, except separator must move caret below. User explicitly
confirmed this exception to the earlier keep-caret rule (S09). No new capability.

## Cause and behavior

61 used the same transform for all blocks: cursor stayed in the prefix; suffix kept
its source text-block type. Inserting from a heading could leave heading-sized text
below a divider. Separately, choosing Heading creates an empty heading below but
leaves caret in the original paragraph: continued typing still looks like paragraph
text. The production UI test reproduces that sequence. These explain two code paths;
the exact user font-size sequence was not supplied, so do not claim it was captured.
Basic H1–H6 CSS already exists; final typography remains later component styling.

62 makes separator an explicit shared-command exception:

- Move caret to the start of a normal paragraph immediately after the divider.
- Preserve inline suffix text/marks and continue it as a paragraph, not a heading.
- With no suffix, reuse an existing following paragraph. If absent or the next block
  is a heading/other block, insert a paragraph before it; preserve that existing block.
- Normal heading/paragraph insertion keeps its prior caret policy. Prefix content,
  stable identities, shared history and the Core save/recovery path remain the same.
- This is a document/selection transform, not CSS hiding a heading as a paragraph.

## Checks

56 editor tests PASS, including H1–H6 separator suffix conversion, actual caret/body
node, save, Undo/Redo, end-of-document creation, existing paragraph reuse and existing
heading preservation. One production React/PM/Core/SQLite integration test PASS
checks menu clicks, unchanged editor/heading DOM, focus/caret in the following P,
computed paragraph font size and accepted persisted block types.45-source dependency
checks PASS.61's earlier133 full-suite/type checks remain recorded separately;
no full-suite replay, native build, native pointer/IME or shipping result inferred62.
Core contracts/schema, CSS, native source/dependencies/locks are unchanged. No migration.

## Next check

Build changed source with `npm run desktop -- --new` after applying62 over61.
Insert Separator from a heading. Caret should land in the paragraph below and typed
text should be normal paragraph size. An existing heading farther below keeps its
own style. Confirm this correction before moving to lists/formatting.

Ctrl+A A01–A05 remains queued for3C; not implemented by this focused correction.
