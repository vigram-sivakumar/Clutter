/**
 * Batch Migration
 *
 * Migrate multiple documents with progress tracking and rollback support.
 */

import type { Block } from '../types/Block';
import type {
  PMDocument,
  DocumentMigrationResult,
  MigrationOptions,
} from './types';
import { migrateDocument } from './migrateDocument';

/**
 * Document to migrate
 */
export interface DocumentToMigrate {
  id: string;
  name?: string;
  pmDoc: PMDocument;
}

/**
 * Result for a single document migration
 */
export interface DocumentResult {
  id: string;
  name?: string;
  success: boolean;
  blocks: Block[];
  errors: Array<{ blockId?: string; error: string }>;
  warnings: Array<{ blockId?: string; warning: string }>;
  stats: {
    totalBlocks: number;
    converted: number;
    failed: number;
    skipped: number;
  };
}

/**
 * Batch migration result
 */
export interface BatchMigrationResult {
  success: boolean;
  documents: DocumentResult[];
  summary: {
    totalDocuments: number;
    succeeded: number;
    failed: number;
    totalBlocks: number;
    totalErrors: number;
    totalWarnings: number;
  };
}

/**
 * Batch migration options
 */
export interface BatchMigrationOptions extends MigrationOptions {
  /** Stop on first document failure (default: false) */
  stopOnError?: boolean;

  /** Progress callback for document-level tracking */
  onDocumentProgress?: (current: number, total: number, docId: string) => void;

  /** Progress callback for block-level tracking */
  onBlockProgress?: (
    docId: string,
    current: number,
    total: number,
    blockId?: string
  ) => void;
}

/**
 * Backup data for rollback
 */
export interface MigrationBackup {
  timestamp: number;
  documents: Array<{
    id: string;
    pmDoc: PMDocument;
  }>;
}

/**
 * Migrate multiple documents in batch
 */
export function batchMigrateDocuments(
  documents: DocumentToMigrate[],
  options: BatchMigrationOptions = {}
): BatchMigrationResult {
  const results: DocumentResult[] = [];
  let totalBlocks = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];

    // Notify document progress
    if (options.onDocumentProgress) {
      options.onDocumentProgress(i + 1, documents.length, doc.id);
    }

    // Migrate document
    const migrationResult = migrateDocument(doc.pmDoc, {
      ...options,
      onProgress: (current, total, blockId) => {
        if (options.onBlockProgress) {
          options.onBlockProgress(doc.id, current, total, blockId);
        }
      },
    });

    // Store result
    const docResult: DocumentResult = {
      id: doc.id,
      name: doc.name,
      success: migrationResult.success,
      blocks: migrationResult.blocks,
      errors: migrationResult.errors,
      warnings: migrationResult.warnings,
      stats: migrationResult.stats,
    };

    results.push(docResult);

    // Update totals
    totalBlocks += migrationResult.stats.totalBlocks;
    totalErrors += migrationResult.errors.length;
    totalWarnings += migrationResult.warnings.length;

    // Stop on error if requested
    if (!migrationResult.success && options.stopOnError) {
      break;
    }
  }

  // Calculate summary
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    success: failed === 0,
    documents: results,
    summary: {
      totalDocuments: documents.length,
      succeeded,
      failed,
      totalBlocks,
      totalErrors,
      totalWarnings,
    },
  };
}

/**
 * Create backup for rollback
 */
export function createMigrationBackup(
  documents: DocumentToMigrate[]
): MigrationBackup {
  return {
    timestamp: Date.now(),
    documents: documents.map((doc) => ({
      id: doc.id,
      pmDoc: doc.pmDoc,
    })),
  };
}

/**
 * Restore from backup (rollback)
 */
export function restoreFromBackup(
  backup: MigrationBackup
): DocumentToMigrate[] {
  return backup.documents.map((doc) => ({
    id: doc.id,
    pmDoc: doc.pmDoc,
  }));
}

/**
 * Save backup to localStorage (for browser environments)
 */
export function saveBackupToLocalStorage(
  backup: MigrationBackup,
  key: string = 'migration-backup'
): void {
  try {
    localStorage.setItem(key, JSON.stringify(backup));
  } catch (error) {
    console.error('Failed to save backup:', error);
    throw new Error('Failed to save migration backup');
  }
}

/**
 * Load backup from localStorage
 */
export function loadBackupFromLocalStorage(
  key: string = 'migration-backup'
): MigrationBackup | null {
  try {
    const data = localStorage.getItem(key);
    if (!data) return null;
    return JSON.parse(data) as MigrationBackup;
  } catch (error) {
    console.error('Failed to load backup:', error);
    return null;
  }
}

/**
 * Clear backup from localStorage
 */
export function clearBackupFromLocalStorage(
  key: string = 'migration-backup'
): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear backup:', error);
  }
}

/**
 * Migration workflow helper with automatic backup
 */
export async function migrateWithBackup(
  documents: DocumentToMigrate[],
  options: BatchMigrationOptions = {}
): Promise<{
  result: BatchMigrationResult;
  backup: MigrationBackup;
  rollback: () => void;
}> {
  // Create backup
  const backup = createMigrationBackup(documents);

  // Save backup to localStorage
  saveBackupToLocalStorage(backup);

  // Perform migration
  const result = batchMigrateDocuments(documents, options);

  // Rollback function
  const rollback = () => {
    const restored = restoreFromBackup(backup);
    console.log('Rolled back migration, restored documents:', restored.length);
    // Clear backup after rollback
    clearBackupFromLocalStorage();
  };

  // If migration succeeded, clear backup
  if (result.success) {
    clearBackupFromLocalStorage();
  }

  return {
    result,
    backup,
    rollback,
  };
}
