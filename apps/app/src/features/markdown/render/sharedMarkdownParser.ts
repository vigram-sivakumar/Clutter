import { parser as baseMarkdownParser, type MarkdownParser } from '@lezer/markdown';

import { markdownGrammarFor } from '../../../core/vault/ingest/grammar/markdownGrammarExtensions';
import { readEnableEmojiLists } from '@shared/helpers/enableEmojiListsPreference';

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
const parserWithEmojiLists = baseMarkdownParser.configure(markdownGrammarFor(true));
const parserWithoutEmojiLists = baseMarkdownParser.configure(markdownGrammarFor(false));

/**
 * Both configured parsers exist once; which one parses is decided per call from the *Enable emoji lists* setting
 * (`enableEmojiListsPreference.ts`), so every read-only surface follows it without each consumer reading the setting.
 * With it off an emoji-led line is an ordinary paragraph (no `EmojiList` node), exactly as in the editor.
 */
export const sharedMarkdownParser: Pick<MarkdownParser, 'parse'> = {
  parse: (...args: Parameters<MarkdownParser['parse']>) =>
    (readEnableEmojiLists() ? parserWithEmojiLists : parserWithoutEmojiLists).parse(...args),
};
