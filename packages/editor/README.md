# Editor

ProseMirror/Yjs schema, context history, replica and codecs. Browser entry excludes
Node/backend codecs. Backend entry composes the same page format into Core. Product
React surfaces are supplied by the UI; this package never imports product UI or storage.
Current schema2 is one title plus body paragraphs/H1–H6/separators in one Y
fragment/history.61 adds deterministic slash insertion and a menu-renderer port. The
shared inline schema supports note-reference/date/link representation; insertion/
formatting controls are a later3B capability. JSON and raw Y validation reject unknown fields and
forbidden metadata/asset updates. Title paste feedback belongs to the view plugin,
not persisted formatting. See ../../docs/foundation/rebuild/title-body-60.md.
