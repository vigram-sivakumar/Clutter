import { describe, expect, it } from 'vitest';
import { PageBuilder } from '../build/PageBuilder';
import type { Page } from '../models/Page';
import {
  applyArchiveMetadataCorrection,
  evaluateArchiveMetadataRepair,
  isInsideArchiveFolder,
} from './archiveMetadataReconciler';

const ROOT = '/vault';

function buildPage(path: string, status: 'active' | 'archived'): Page {
  const builder = new PageBuilder();

  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/${path}`,
      directoryPath: ROOT,
      frontmatter: {
        id: 'page-1',
        status,
        archivedAt: status === 'archived' ? '2024-01-01T00:00:00.000Z' : null,
        originalPath: status === 'archived' ? `${ROOT}/Inbox/Note.md` : null,
        originalParentId: status === 'archived' ? 'folder-inbox' : null,
      },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

describe('archiveMetadataReconciler', () => {
  describe('isInsideArchiveFolder', () => {
    it('returns true for paths under Archive/', () => {
      expect(isInsideArchiveFolder(`${ROOT}/Archive/Note.md`, ROOT)).toBe(true);
      expect(isInsideArchiveFolder(`${ROOT}/Archive/Sub/Note.md`, ROOT)).toBe(
        true
      );
    });

    it('returns false for paths outside Archive/', () => {
      expect(isInsideArchiveFolder(`${ROOT}/Projects/Note.md`, ROOT)).toBe(
        false
      );
      expect(isInsideArchiveFolder(`${ROOT}/Inbox/Note.md`, ROOT)).toBe(false);
    });
  });

  describe('evaluateArchiveMetadataRepair', () => {
    it('returns null for archived page inside Archive/', () => {
      const page = buildPage('Archive/Note.md', 'archived');
      expect(evaluateArchiveMetadataRepair(page, ROOT)).toBeNull();
    });

    it('returns null for active page outside Archive/', () => {
      const page = buildPage('Projects/Note.md', 'active');
      expect(evaluateArchiveMetadataRepair(page, ROOT)).toBeNull();
    });

    it('returns null for active page inside Archive/', () => {
      const page = buildPage('Archive/Reference/API.md', 'active');
      expect(evaluateArchiveMetadataRepair(page, ROOT)).toBeNull();
    });

    it('clears archive metadata for archived page outside Archive/', () => {
      const page = buildPage('Projects/Note.md', 'archived');
      expect(evaluateArchiveMetadataRepair(page, ROOT)).toEqual({
        status: 'active',
        archivedAt: null,
        originalPath: null,
        originalParentId: null,
      });
    });
  });

  describe('applyArchiveMetadataCorrection', () => {
    it('applies the correction without changing other metadata fields', () => {
      const page = buildPage('Projects/Note.md', 'archived');
      const corrected = applyArchiveMetadataCorrection(page, {
        status: 'active',
        archivedAt: null,
        originalPath: null,
        originalParentId: null,
      });

      expect(corrected.metadata.status).toBe('active');
      expect(corrected.metadata.archivedAt).toBeNull();
      expect(corrected.metadata.originalPath).toBeNull();
      expect(corrected.metadata.originalParentId).toBeNull();
      expect(corrected.metadata.favorite).toBe(page.metadata.favorite);
    });
  });
});
