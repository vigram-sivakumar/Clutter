import { describe, expect, it } from 'vitest';
import { normalizeTagName, formatTagDisplayLabel, serializeTagName } from './Tag';

describe('normalizeTagName', () => {
  it('lowercases mixed-case input', () => {
    expect(normalizeTagName('Project')).toBe('project');
    expect(normalizeTagName('PROJECT')).toBe('project');
    expect(normalizeTagName('project')).toBe('project');
  });

  it('treats hyphen and underscore as the same identity', () => {
    expect(normalizeTagName('product-design')).toBe(normalizeTagName('product_design'));
  });

  it('folds case AND separator together — all separator/case variants share one identity', () => {
    const variants = [
      'product-design',
      'product_design',
      'Product-design',
      'Product_design',
      'product-Design',
      'product_Design',
      'Product-Design',
      'Product_Design',
      'PRODUCT-DESIGN',
    ];

    const identities = new Set(variants.map(normalizeTagName));
    expect(identities.size).toBe(1);
    expect(identities.has('product design')).toBe(true);
  });

  it('collapses a run of separators to a single space', () => {
    expect(normalizeTagName('product--design')).toBe('product design');
    expect(normalizeTagName('product-_design')).toBe('product design');
  });
});

describe('formatTagDisplayLabel', () => {
  it('leaves a tag with no separator unchanged', () => {
    expect(formatTagDisplayLabel('project')).toBe('project');
  });

  it('replaces a hyphen with a space, preserving casing', () => {
    expect(formatTagDisplayLabel('Product-design')).toBe('Product design');
  });

  it('replaces an underscore with a space, preserving casing', () => {
    expect(formatTagDisplayLabel('product_design')).toBe('product design');
  });

  it('preserves casing exactly — never forces lowercase', () => {
    expect(formatTagDisplayLabel('Product_Design')).toBe('Product Design');
  });
});

describe('serializeTagName', () => {
  it('replaces a space with a hyphen — the canonical serialized separator', () => {
    expect(serializeTagName('Product design')).toBe('Product-design');
  });

  it('leaves a tag with no space unchanged', () => {
    expect(serializeTagName('project')).toBe('project');
  });

  it('is the inverse of formatTagDisplayLabel for a hyphen-separated name', () => {
    const original = 'Product-design';
    expect(serializeTagName(formatTagDisplayLabel(original))).toBe(original);
  });
});
