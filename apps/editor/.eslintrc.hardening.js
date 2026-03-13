/**
 * 🔒 HARDENING ESLINT RULES
 * 
 * Enforces architectural boundaries at compile time.
 * Prevents forbidden patterns from being reintroduced.
 */

module.exports = {
  rules: {
    // 🔒 FORBIDDEN LEGACY PATTERNS
    'no-restricted-syntax': [
      'error',
      {
        selector: 'MemberExpression[object.name="node"][property.name="text"]',
        message: '❌ node.text is FORBIDDEN. Use getPlainText(node.segments) instead.',
      },
      {
        selector: 'MemberExpression[object.name="node"][property.name="meta"]',
        message: '❌ node.meta is FORBIDDEN. Segments architecture only.',
      },
      {
        selector: 'Identifier[name="TreeWalker"]',
        message: '❌ TreeWalker is FORBIDDEN. Use direct child iteration with segments.',
      },
      {
        selector: 'Identifier[name="extractPureText"]',
        message: '❌ extractPureText is FORBIDDEN. Use getPlainText() from SegmentUtils.',
      },
      {
        selector: 'Identifier[name="CursorBias"]',
        message: '❌ CursorBias is FORBIDDEN. Use CursorPosition with segmentIndex.',
      },
      {
        selector: 'Identifier[name="NodeWithMeta"]',
        message: '❌ NodeWithMeta is FORBIDDEN. Use Node with segments.',
      },
      {
        selector: 'Identifier[name="InlineMeta"]',
        message: '❌ InlineMeta is FORBIDDEN. Use Segment type.',
      },
      {
        selector: 'Identifier[name="applyIntent"]',
        message: '❌ applyIntent is FORBIDDEN. Use direct mutations through SegmentedEditor.',
      },
      {
        selector: 'Identifier[name="OldNode"]',
        message: '❌ OldNode is FORBIDDEN. Migration complete.',
      },
    ],

    // 🔒 PREVENT SEGMENTOPS BYPASS
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/SegmentOps', '../**/SegmentOps', '../../**/SegmentOps'],
            message:
              '❌ Direct import of SegmentOps is FORBIDDEN. Import from editor/index.ts only. UI must use SegmentedEditor API.',
          },
        ],
      },
    ],

    // 🔒 PREVENT SECOND EDITOR
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/packages/editor/**'],
            message: '❌ packages/editor/ was deleted. Only apps/engine-demo/ editor exists.',
          },
          {
            group: ['@clutter/editor', '@clutter/editor/*'],
            message: '❌ @clutter/editor package was deleted. Use apps/engine-demo/ only.',
          },
        ],
      },
    ],
  },

  overrides: [
    {
      // SegmentedEditor and SegmentOps can import from each other
      files: ['src/editor/SegmentedEditor.ts', 'src/editor/SegmentOps.ts', 'src/editor/index.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
