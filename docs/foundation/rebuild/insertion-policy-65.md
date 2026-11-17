# Insertion policy65

17 November2026. User corrected text insertion after64 and requested a configurable,
clean shared architecture. Implemented and automated checks PASS; Mac check pending.

| Type | Empty after removing /command | Content remains | Focus |
| --- | --- | --- | --- |
| Paragraph, H1–H6, ordered/unordered list | Convert current block in place | New empty block below; current text stays together | Chosen editable block, ready to type |
| Separator | Insert above | Insert below | Retain current block/caret |
| Future objects | Their confirmed registered policy | Their confirmed registered policy | Their supported focus policy; not implemented by this registry alone |

No prefix/suffix splitting. Only /command is removed. An inline reference/date/break
counts as content; it is not dropped merely because literal text is empty. Conversion
preserves block ID/location and child references, strips old type-specific attrs and
applies the chosen type's attrs. Inserted siblings get a new ID after the current
explicit descendant group. Free-indented unrelated rows are not treated as children.

## One policy, one executor, one context

- block-definitions.mjs registers ID/label/search terms, nodeType/attrs and insertion
  properties. Immutable defaults/validated per-workspace overrides are not saved facts.
- createInsertionTransaction builds the same structural transaction for every entry.
  It supports insertion without slash text; optional removeRange consumes a trigger.
- Slash only validates its current query/range and calls that entry. No command-ID
  branch decides conversion, placement or cursor movement. React only shows choices.
- block-structure.mjs shares canonical graph selectors with list operations. No DOM/
  margin-derived hierarchy or second list owner.
- The replica dispatcher groups insertion into one history action for every entry.
  Selection is view-local; accepted content, grants/revisions/save/protection/recovery
  stay on the existing EditorSession/Core path. No new save or Undo manager.

Configuration example at shared mount/workspace composition:

```js
mountWorkspace(target, {
  ...options,
  insertionPolicies: {
    'heading-2': { focus: 'retain' },
    // Supported properties: empty, nonEmpty, focus.
  },
});
```

Empty actions: convert/before/after. Nonempty: before/after. Focus: inserted/retain.
Default text behavior is convert/after/inserted. Separator is before/after/retain.
Schema-incompatible settings fail before changing a document. Inserted-edit focus
currently requires an implemented text block; future object editing targets require
real supported schema/view behavior, not an unchecked flag. Add actual Core-admitted
entity/media operations before enabling their block definitions; policy is not a
way around task ownership or asset atomicity. No inactive commands are added.

## Checks and platform boundaries

171 full-suite Linux tests PASS; strict Core/runtime TS PASS;48-source dependency
checks PASS. Conversion matrix exercises paragraph/heading/ordered/unordered sources
and nine editable targets, stable identity, attr cleanup, caret, save and Undo/Redo.
Filled insertion keeps all source text together. Tests cover children, unrelated
indented roots, immutable/invalid overrides, actual workspace prop behavior and the
generic no-slash entry/Undo. Production React/PM/Core/SQLite checks focused insertion
and persisted structure; real CLI/MCP regressions remain passing. Superseded tests
were updated, not counted as passing opposite requirements.

Policy, transforms and focus stay in the shared editor and shared React UI. No OS
logic, native source, Core contract/schema, CSS, dependencies or lock changed. Current
adapters retain OS/window/filesystem/lifecycle mechanisms. Windows still needs its
adapters/builds/actual tests; no Windows/native65/IME/no-blank-paint/shipping pass is
inferred from Linux checks. No later extraction of new Mac-specific page logic is
introduced here.

## Next scoped Mac check

Apply65 over64, then `npm run desktop -- --new` to build changed source into a fresh
synthetic Space; previous sessions keep original bundles. No npm install/migration.

1. In empty body paragraph choose /ol. The SAME block becomes item1, no extra empty
   paragraph. Type First immediately, without clicking; Enter creates item2.
2. /ul, /h1 and Paragraph choices likewise convert an empty editable block and leave
   caret ready. Empty heading → ordered list must be one conversion, no added row.
3. In existing text choose /h2. Remove only command; keep all other text together;
   insert empty heading below and move caret there, ready to type.
4. Separator still inserts above an empty block/below a filled block and retains
   cursor. Undo/Redo, Save/reopen preserve chosen types/content.

Then continue list key checks from64, before formatting. Ctrl+A A01–A05 and block
selection remain3C, not implemented here.3A and both separator63 checks are user PASS;
list Mac completion is not claimed from the correction conversation.
