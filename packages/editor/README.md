# Editor

ProseMirror/Yjs schema, context history, replica and codecs. Browser entry excludes
Node/backend codecs. Backend entry composes the same page format into Core. Product
React surfaces are supplied by the UI; this package never imports product UI or storage.
Current schema2 is one title plus body paragraphs in one Y fragment/history. The
shared inline schema supports note-reference/date/link representation; insertion/
formatting controls are3B. JSON and raw Y validation reject unknown fields and
forbidden metadata/asset updates. Title paste feedback belongs to the view plugin,
not persisted formatting. See ../../docs/foundation/rebuild/title-body-60.md.
