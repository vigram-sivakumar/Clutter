// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PageOperations } from '@core/application/page/PageOperations';

import { createNoteFromTemplate, pickInheritedTemplateMetadata } from './createNoteFromTemplate';

function fakeOperations() {
  const openDraft = vi.fn().mockResolvedValue('draft-1');
  const mutateBody = vi.fn().mockResolvedValue(undefined);
  const updateMetadata = vi.fn().mockResolvedValue(undefined);
  return {
    openDraft,
    mutateBody,
    updateMetadata,
    operations: { openDraft, mutateBody, updateMetadata } as unknown as PageOperations,
  };
}

describe('createNoteFromTemplate', () => {
  it('opens a draft in the folder and puts the template body into it', async () => {
    const { openDraft, mutateBody, operations } = fakeOperations();

    await createNoteFromTemplate(operations, 'folder-1', '# Agenda');

    expect(openDraft).toHaveBeenCalledWith({ folderId: 'folder-1' });
    expect(mutateBody).toHaveBeenCalledTimes(1);
    expect(mutateBody.mock.calls[0]![0]).toBe('draft-1');
    expect(mutateBody.mock.calls[0]![1]('ignored')).toBe('# Agenda');
  });

  it('leaves a blank template as the plain empty draft', async () => {
    const { openDraft, mutateBody, operations } = fakeOperations();

    await createNoteFromTemplate(operations, null, '  \n');

    expect(openDraft).toHaveBeenCalledWith({ folderId: null });
    expect(mutateBody).not.toHaveBeenCalled();
  });
});

const DEFAULTS = {
  icon: null,
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
};

describe('pickInheritedTemplateMetadata', () => {
  it('returns nothing for a template with no icon or cover', () => {
    expect(pickInheritedTemplateMetadata(DEFAULTS)).toEqual({});
  });

  it('returns only the icon when there is no cover — cover settings mean nothing without one', () => {
    expect(
      pickInheritedTemplateMetadata({ ...DEFAULTS, icon: '📌', coverLayout: 'above', coverPositionAbove: 10 })
    ).toEqual({ icon: '📌' });
  });

  it('returns the cover and all of its presentation settings, never anything else', () => {
    expect(
      pickInheritedTemplateMetadata({
        ...DEFAULTS,
        cover: 'Assets/c.png',
        coverHidden: true,
        coverLayout: 'above',
        coverPositionAbove: 20,
        coverPositionSide: 80,
      })
    ).toEqual({
      cover: 'Assets/c.png',
      coverHidden: true,
      coverLayout: 'above',
      coverPositionAbove: 20,
      coverPositionSide: 80,
    });
  });
});

describe('createNoteFromTemplate — inherited metadata', () => {
  it('applies the template’s icon and cover to the draft after its body', async () => {
    const { mutateBody, updateMetadata, operations } = fakeOperations();

    await createNoteFromTemplate(operations, null, '# A', { ...DEFAULTS, icon: '📌', cover: 'Assets/c.png' });

    expect(updateMetadata).toHaveBeenCalledTimes(1);
    expect(updateMetadata.mock.calls[0]![0]).toBe('draft-1');
    expect(updateMetadata.mock.calls[0]![1]).toMatchObject({ icon: '📌', cover: 'Assets/c.png' });
    expect(mutateBody.mock.invocationCallOrder[0]!).toBeLessThan(updateMetadata.mock.invocationCallOrder[0]!);
  });

  it('does not touch metadata (the note stays a draft) when the template has no icon or cover', async () => {
    const { updateMetadata, operations } = fakeOperations();

    await createNoteFromTemplate(operations, null, '# A', DEFAULTS);
    await createNoteFromTemplate(operations, null, '# A');

    expect(updateMetadata).not.toHaveBeenCalled();
  });
});

describe('pickInheritedTemplateMetadata — tags, description, custom properties', () => {
  it('picks tags, description and custom properties, and drops the kind: template marker', () => {
    expect(
      pickInheritedTemplateMetadata({
        ...DEFAULTS,
        description: 'About',
        tags: ['a', 'b'],
        unownedFrontmatter: ['kind: template', 'rating: 5'],
      })
    ).toEqual({ description: 'About', tags: ['a', 'b'], unownedFrontmatter: ['rating: 5'] });
  });

  it('omits what the template does not have (null description, no tags, only the marker)', () => {
    expect(
      pickInheritedTemplateMetadata({ ...DEFAULTS, description: null, tags: [], unownedFrontmatter: ['kind: template'] })
    ).toEqual({});
  });

  it('never returns aliases, favorite, id or timestamps, whatever the template carries', () => {
    const patch = pickInheritedTemplateMetadata({
      ...DEFAULTS,
      icon: '📌',
      aliases: ['x'],
      favorite: true,
      id: 'template-1',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
    } as never);

    expect(Object.keys(patch)).toEqual(['icon']);
  });
});

describe('pickInheritedTemplateMetadata — Apply template icon / cover image', () => {
  afterEach(() => localStorage.clear());

  const FULL = {
    ...DEFAULTS,
    icon: '📌',
    cover: 'Assets/c.png',
    coverCredit: { name: 'Alex', url: 'https://unsplash.com/@alex' },
    description: 'D',
    tags: ['t'],
    unownedFrontmatter: ['Priority: High'],
  };

  it('reads the stored preferences: on by default, each off on its own', () => {
    expect(pickInheritedTemplateMetadata(FULL)).toMatchObject({ icon: '📌', cover: 'Assets/c.png' });

    localStorage.setItem('clutter-apply-template-icon', 'false');
    const iconOff = pickInheritedTemplateMetadata(FULL);
    expect(iconOff).not.toHaveProperty('icon');
    expect(iconOff).toMatchObject({ cover: 'Assets/c.png', description: 'D', tags: ['t'] });

    localStorage.clear();
    localStorage.setItem('clutter-apply-template-cover', 'false');
    const coverOff = pickInheritedTemplateMetadata(FULL);
    expect(coverOff).toMatchObject({ icon: '📌', description: 'D', tags: ['t'], unownedFrontmatter: ['Priority: High'] });
    for (const key of ['cover', 'coverCredit', 'coverHidden', 'coverLayout', 'coverPositionAbove', 'coverPositionSide']) {
      expect(coverOff).not.toHaveProperty(key);
    }
  });

  it('explicit options override the stored preferences', () => {
    localStorage.setItem('clutter-apply-template-icon', 'false');

    expect(pickInheritedTemplateMetadata(FULL, { applyIcon: true })).toHaveProperty('icon', '📌');
    expect(pickInheritedTemplateMetadata(FULL, { applyCover: false })).not.toHaveProperty('cover');
  });
});
