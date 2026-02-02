/**
 * Corpus Validation Runner
 *
 * This is the gate. Migration must pass all synthetic cases.
 *
 * Gate Conditions:
 * - ✅ No exceptions thrown
 * - ✅ No text content lost
 * - ✅ Valid block trees produced
 * - ❌ No silent data drops
 *
 * Run this before deploying Lexical editor.
 */

import { migrateDocument } from '../migrateDocument';
import { SYNTHETIC_CORPUS, EXPECTED_OUTCOMES } from './syntheticCorpus';
import { Block } from '../../types/Block';

interface ValidationResult {
  testName: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  blocks: Block[];
  duration: number;
}

interface CorpusValidationReport {
  totalTests: number;
  passed: number;
  failed: number;
  results: ValidationResult[];
  overallPassed: boolean;
}

/**
 * Extract all text content from blocks for comparison
 */
function extractAllText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      try {
        if (!block.content) return '';
        const lexicalState = JSON.parse(block.content);
        return extractTextFromLexical(lexicalState);
      } catch {
        return block.content || '';
      }
    })
    .join(' ')
    .trim();
}

/**
 * Extract text from Lexical JSON
 */
function extractTextFromLexical(state: any): string {
  if (!state?.root?.children) return '';

  const extractFromNode = (node: any): string => {
    if (node.type === 'text') {
      return node.text || '';
    }
    if (node.children) {
      return node.children.map(extractFromNode).join('');
    }
    return '';
  };

  return state.root.children.map(extractFromNode).join(' ').trim();
}

/**
 * Extract all text from PM document
 */
function extractPMText(doc: any): string {
  if (!doc?.content) return '';

  const extractFromNode = (node: any): string => {
    if (node.type === 'text') {
      return node.text || '';
    }
    if (node.content) {
      return node.content.map(extractFromNode).join('');
    }
    return '';
  };

  return doc.content.map(extractFromNode).join(' ').trim();
}

/**
 * Validate tree structure
 */
function validateTreeStructure(blocks: Block[]): string[] {
  const errors: string[] = [];
  const blockMap = new Map(blocks.map((b) => [b.id, b]));

  for (const block of blocks) {
    // Check parent exists
    if (block.parent) {
      const parent = blockMap.get(block.parent);
      if (!parent) {
        errors.push(
          `Block ${block.id} references non-existent parent ${block.parent}`
        );
      } else {
        // Check parent includes this child
        if (!parent.children.includes(block.id)) {
          errors.push(
            `Block ${block.id} has parent ${block.parent}, but parent doesn't include it in children`
          );
        }
      }
    }

    // Check children exist
    for (const childId of block.children) {
      const child = blockMap.get(childId);
      if (!child) {
        errors.push(
          `Block ${block.id} references non-existent child ${childId}`
        );
      } else {
        // Check child points back to parent
        if (child.parent !== block.id) {
          errors.push(
            `Block ${block.id} has child ${childId}, but child's parent is ${child.parent}`
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Validate single test case
 */
function validateTestCase(testName: string, pmDoc: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const startTime = performance.now();

  let blocks: Block[] = [];
  let migrationSucceeded = false;

  try {
    // Run migration
    const result = migrateDocument(pmDoc, {
      preserveBlockIds: true,
      validateTree: true,
    });

    if (!result.success) {
      errors.push(`Migration failed: ${result.errors.join(', ')}`);
      return {
        testName,
        passed: false,
        errors,
        warnings,
        blocks: [],
        duration: performance.now() - startTime,
      };
    }

    blocks = result.blocks;
    migrationSucceeded = true;

    // Validate expectations
    const expected =
      EXPECTED_OUTCOMES[testName as keyof typeof EXPECTED_OUTCOMES];

    if (
      expected.blockCount !== undefined &&
      blocks.length !== expected.blockCount
    ) {
      errors.push(
        `Expected ${expected.blockCount} blocks, got ${blocks.length}`
      );
    }

    // Validate text preservation
    const pmText = extractPMText(pmDoc);
    const blockText = extractAllText(blocks);

    if (pmText && pmText !== blockText) {
      // Allow some whitespace normalization
      const normalizedPM = pmText.replace(/\s+/g, ' ').trim();
      const normalizedBlock = blockText.replace(/\s+/g, ' ').trim();

      if (normalizedPM !== normalizedBlock) {
        errors.push(
          `Text content mismatch:\nPM: "${normalizedPM}"\nBlocks: "${normalizedBlock}"`
        );
      }
    }

    // Validate tree structure
    const treeErrors = validateTreeStructure(blocks);
    errors.push(...treeErrors);

    // Check for descriptions
    if (expected.hasDescription) {
      const hasDesc = blocks.some(
        (b) => b.description && b.description.trim() !== ''
      );
      if (!hasDesc) {
        errors.push('Expected blocks with descriptions, found none');
      }
    }

    // Check for tree structure
    if (expected.hasTree) {
      const hasChildren = blocks.some((b) => b.children.length > 0);
      if (!hasChildren) {
        errors.push('Expected tree structure with children, found none');
      }

      // Check max depth
      if (expected.maxDepth !== undefined) {
        const calculateDepth = (
          blockId: string,
          visited = new Set<string>()
        ): number => {
          if (visited.has(blockId)) return 0; // Circular reference protection
          visited.add(blockId);

          const block = blocks.find((b) => b.id === blockId);
          if (!block || block.children.length === 0) return 0;

          return (
            1 +
            Math.max(...block.children.map((c) => calculateDepth(c, visited)))
          );
        };

        const rootBlocks = blocks.filter((b) => !b.parent);
        const maxDepth = Math.max(
          ...rootBlocks.map((b) => calculateDepth(b.id))
        );

        if (maxDepth !== expected.maxDepth) {
          warnings.push(
            `Expected max depth ${expected.maxDepth}, got ${maxDepth}`
          );
        }
      }
    }

    // Check for blockId preservation
    const pmBlockIds = new Set<string>();
    const collectPMBlockIds = (node: any) => {
      if (node.attrs?.blockId) {
        pmBlockIds.add(node.attrs.blockId);
      }
      if (node.content) {
        node.content.forEach(collectPMBlockIds);
      }
    };
    if (pmDoc.content) {
      pmDoc.content.forEach(collectPMBlockIds);
    }

    const migratedBlockIds = new Set(blocks.map((b) => b.id));
    const missingIds = Array.from(pmBlockIds).filter(
      (id) => !migratedBlockIds.has(id)
    );
    if (missingIds.length > 0) {
      errors.push(`Missing blockIds from migration: ${missingIds.join(', ')}`);
    }
  } catch (error) {
    errors.push(
      `Exception thrown: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const duration = performance.now() - startTime;

  return {
    testName,
    passed: errors.length === 0,
    errors,
    warnings,
    blocks,
    duration,
  };
}

/**
 * Run full corpus validation
 */
export function validateCorpus(): CorpusValidationReport {
  const results: ValidationResult[] = [];

  for (const [testName, pmDoc] of Object.entries(SYNTHETIC_CORPUS)) {
    const result = validateTestCase(testName, pmDoc);
    results.push(result);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    totalTests: results.length,
    passed,
    failed,
    results,
    overallPassed: failed === 0,
  };
}

/**
 * Format validation report for console
 */
export function formatReport(report: CorpusValidationReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  SYNTHETIC CORPUS VALIDATION REPORT');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Total Tests: ${report.totalTests}`);
  lines.push(`Passed: ${report.passed} ✅`);
  lines.push(`Failed: ${report.failed} ${report.failed > 0 ? '❌' : ''}`);
  lines.push('');

  for (const result of report.results) {
    const status = result.passed ? '✅' : '❌';
    lines.push(
      `${status} ${result.testName} (${result.duration.toFixed(2)}ms)`
    );

    if (result.blocks.length > 0) {
      lines.push(`   → ${result.blocks.length} blocks migrated`);
    }

    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        lines.push(`   ⚠️  ${warning}`);
      }
    }

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        lines.push(`   ❌ ${error}`);
      }
    }

    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  if (report.overallPassed) {
    lines.push('✅ ALL TESTS PASSED - Migration is production-ready');
  } else {
    lines.push('❌ TESTS FAILED - Fix issues before deploying Lexical editor');
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Console-friendly test runner
 */
export function runCorpusValidation(): void {
  console.log('Running synthetic corpus validation...');
  console.log('');

  const report = validateCorpus();
  const formatted = formatReport(report);

  console.log(formatted);

  if (!report.overallPassed) {
    console.error('❌ Validation failed. See errors above.');
  }
}

// Export for console use
if (typeof window !== 'undefined') {
  (window as any).runCorpusValidation = runCorpusValidation;
  (window as any).validateCorpus = validateCorpus;
}
