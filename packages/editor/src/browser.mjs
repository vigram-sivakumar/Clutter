/** Browser entry: no Node/SQLite/backend codec or OS mechanisms. */
export { createEditorReplica } from './replica.mjs';
export { browserCodec } from './browser-codec.mjs';
export { OriginHistoryContext } from './origin-history-context.mjs';
export { noteSchema, taskSchema, pageContent } from './schema.mjs';

export { createBlockDefinitions } from './block-definitions.mjs';
export { createInsertionTransaction } from './block-insertion.mjs';
