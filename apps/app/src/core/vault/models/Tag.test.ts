import { describe, expect, it } from 'vitest';
import { normalizeTagName } from './Tag';

describe('normalizeTagName', () => {
  it('lowercases mixed-case input', () => {
    expect(normalizeTagName('Project')).toBe('project');
    expect(normalizeTagName('PROJECT')).toBe('project');
    expect(normalizeTagName('project')).toBe('project');
  });
});
