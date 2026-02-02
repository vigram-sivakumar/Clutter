/**
 * Migration Module
 *
 * Tools for migrating ProseMirror documents to Lexical format.
 */

// Types
export type {
  PMBlockAttrs,
  PMNode,
  PMMark,
  PMDocument,
  LexicalNode,
  LexicalTextNode,
  LexicalParagraphNode,
  LexicalRoot,
  MigrationResult,
  DocumentMigrationResult,
  MigrationOptions,
  TextFormat,
} from './types';

// Converters
export {
  marksToFormat,
  convertTextNode,
  convertInlineContent,
  convertParagraph,
  convertHeading,
  convertListBlock,
  convertBlockquote,
  convertCodeBlock,
  convertCallout,
  convertBlockContent,
  extractPlainText,
} from './converters';

// Document migration
export { migrateDocument, migrateBlock } from './migrateDocument';

// Batch migration
export type {
  DocumentToMigrate,
  DocumentResult,
  BatchMigrationResult,
  BatchMigrationOptions,
  MigrationBackup,
} from './batchMigration';

export {
  batchMigrateDocuments,
  createMigrationBackup,
  restoreFromBackup,
  saveBackupToLocalStorage,
  loadBackupFromLocalStorage,
  clearBackupFromLocalStorage,
  migrateWithBackup,
} from './batchMigration';

// Corpus validation (testing/validation)
export {
  validateCorpus,
  runCorpusValidation,
  formatReport,
} from './__tests__/corpusValidation';
export {
  SYNTHETIC_CORPUS,
  EXPECTED_OUTCOMES,
} from './__tests__/syntheticCorpus';
