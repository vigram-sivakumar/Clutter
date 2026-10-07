import { parser } from '@lezer/markdown';

import { markdownGrammarExtensions } from '../grammar/markdownGrammarExtensions';

/**
 * The Markdown parser Vault Ingest finds tags with: `@lezer/markdown` with
 * exactly the grammar the page editor parses with (`markdownGrammarExtensions`
 * — GFM, WikiLink, Embed, Date, Tag, …), configured the same way. The
 * grammar lives in Vault Ingest (`ingest/grammar/`) and the editor imports
 * it from there, so what the editor renders as a tag and what is indexed as
 * a tag cannot differ: there is no second parser and no editor-only syntax
 * that could swallow or reveal a `#`.
 */
export const tagParser = parser.configure(markdownGrammarExtensions);
