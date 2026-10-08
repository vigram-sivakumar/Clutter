import { parser as baseMarkdownParser } from '@lezer/markdown';

import { markdownGrammarExtensions } from '../../../core/vault/ingest/grammar/markdownGrammarExtensions';

/**
 * The one configured `@lezer/markdown` parser instance used by every
 * CM6-independent, read-only rendering surface — currently
 * `tokenizeCompactMarkdown` (the sidebar/collection-entry compact preview
 * renderer) — parses with this exact grammar, completely independent of
 * CodeMirror (no `EditorView`/`EditorState` involved), so it can't
 * silently disagree with the page editor about what counts as
 * bold/italic/WikiLink/Tag/Date/Embed/etc. Configured once here rather
 * than each consumer calling `.configure(...)` on its own copy — kept as
 * a shared module even with one current consumer, since a second
 * CM6-independent rendering surface would need the identical grammar.
 */
export const sharedMarkdownParser = baseMarkdownParser.configure(markdownGrammarExtensions);
