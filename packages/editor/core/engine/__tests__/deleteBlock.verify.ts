/**
 * Manual Verification Script: engine.deleteBlock() - Child Promotion
 *
 * Run with: npx ts-node packages/editor/core/engine/__tests__/deleteBlock.verify.ts
 *
 * Tests Editor Law #8: Child Promotion Invariant
 */

import { EditorEngine } from '../EditorEngine';
import { DeleteBlockCommand } from '../command';
import type { BlockTree, BlockNode } from '../types';

// ===== TEST UTILITIES =====

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  testCount++;
  if (condition) {
    
    passCount++;
  } else {
    
    failCount++;
  }
}

function assertEqual(actual: any, expected: any, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  assert(
    actualStr === expectedStr,
    `${message}\n     Expected: ${expectedStr}\n     Got:      ${actualStr}`
  );
}

function test(name: string, fn: () => void): void {
  
  try {
    fn();
  } catch (error) {
      // Error handled
    
    failCount++;
  }
}

// ===== TEST HELPERS =====

function createTestTree(): BlockTree {
  return {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        type: 'doc',
        parentId: null,
        children: [],
        content: null,
      },
    },
  };
}

function addBlock(
  tree: BlockTree,
  id: string,
  parentId: string,
  type = 'paragraph'
): BlockNode {
  const block: BlockNode = {
    id,
    type,
    parentId,
    children: [],
    content: null,
  };

  tree.nodes[id] = block;

  const parent = tree.nodes[parentId];
  if (parent) {
    parent.children.push(id);
  }

  return block;
}

// ===== TESTS =====




// TEST 1: Delete Leaf Block (No Children)
test('TEST 1: Delete leaf block with no children', () => {
  const engine = new EditorEngine(createTestTree());

  // Setup: root → A
  addBlock(engine.tree, 'A', 'root');

  // Delete A
  const result = engine.deleteBlock('A');

  // Verify
  assert(result !== null, 'Deletion returned metadata');
  assert(result?.deletedBlock.id === 'A', 'Deleted block ID is A');
  assertEqual(result?.promotedChildren, [], 'No children promoted');
  assert(engine.tree.nodes['A'] === undefined, 'Block A removed from tree');
  assertEqual(engine.tree.nodes['root']?.children, [], 'Root has no children');
});

// TEST 2: Delete Block with 1 Child
test('TEST 2: Delete block with 1 child (child promoted)', () => {
  const engine = new EditorEngine(createTestTree());

  // Setup: root → A → Child1
  addBlock(engine.tree, 'A', 'root');
  addBlock(engine.tree, 'Child1', 'A');

  // Delete A
  const result = engine.deleteBlock('A');

  // Verify
  assert(result !== null, 'Deletion returned metadata');
  assertEqual(result?.promotedChildren, ['Child1'], '1 child promoted');
  assert(engine.tree.nodes['A'] === undefined, 'Block A removed');
  assert(
    engine.tree.nodes['Child1']?.parentId === 'root',
    'Child1 promoted to root'
  );
  assertEqual(
    engine.tree.nodes['root']?.children,
    ['Child1'],
    'Root contains Child1'
  );
});

// TEST 3: Delete Block with 3 Children
test('TEST 3: Delete block with 3 children (all promoted in order)', () => {
  const engine = new EditorEngine(createTestTree());

  // Setup: root → A → [Child1, Child2, Child3]
  addBlock(engine.tree, 'A', 'root');
  addBlock(engine.tree, 'Child1', 'A');
  addBlock(engine.tree, 'Child2', 'A');
  addBlock(engine.tree, 'Child3', 'A');

  // Delete A
  const result = engine.deleteBlock('A');

  // Verify
  assert(result !== null, 'Deletion returned metadata');
  assertEqual(
    result?.promotedChildren,
    ['Child1', 'Child2', 'Child3'],
    '3 children promoted'
  );
  assert(engine.tree.nodes['A'] === undefined, 'Block A removed');
  assert(engine.tree.nodes['Child1']?.parentId === 'root', 'Child1 promoted');
  assert(engine.tree.nodes['Child2']?.parentId === 'root', 'Child2 promoted');
  assert(engine.tree.nodes['Child3']?.parentId === 'root', 'Child3 promoted');
  assertEqual(
    engine.tree.nodes['root']?.children,
    ['Child1', 'Child2', 'Child3'],
    'Root children in correct order'
  );
});

// TEST 4: Delete Block with Nested Grandchildren
test('TEST 4: Delete block with grandchildren (only children promoted)', () => {
  const engine = new EditorEngine(createTestTree());

  // Setup:
  // root → A → Child1 → GrandChild1
  //         └─ Child2 → GrandChild2
  addBlock(engine.tree, 'A', 'root');
  addBlock(engine.tree, 'Child1', 'A');
  addBlock(engine.tree, 'GrandChild1', 'Child1');
  addBlock(engine.tree, 'Child2', 'A');
  addBlock(engine.tree, 'GrandChild2', 'Child2');

  // Delete A
  const result = engine.deleteBlock('A');

  // Verify
  assert(result !== null, 'Deletion returned metadata');
  assertEqual(
    result?.promotedChildren,
    ['Child1', 'Child2'],
    'Only direct children promoted'
  );
  assert(engine.tree.nodes['A'] === undefined, 'Block A removed');

  // Children promoted to root
  assert(
    engine.tree.nodes['Child1']?.parentId === 'root',
    'Child1 promoted to root'
  );
  assert(
    engine.tree.nodes['Child2']?.parentId === 'root',
    'Child2 promoted to root'
  );

  // Grandchildren stay with their parents
  assert(
    engine.tree.nodes['GrandChild1']?.parentId === 'Child1',
    'GrandChild1 stays with Child1'
  );
  assert(
    engine.tree.nodes['GrandChild2']?.parentId === 'Child2',
    'GrandChild2 stays with Child2'
  );
  assertEqual(
    engine.tree.nodes['Child1']?.children,
    ['GrandChild1'],
    'Child1 still has GrandChild1'
  );
  assertEqual(
    engine.tree.nodes['Child2']?.children,
    ['GrandChild2'],
    'Child2 still has GrandChild2'
  );
});

// TEST 5: Delete → Undo → Redo
test('TEST 5: Delete → Undo → Redo (state restoration)', () => {
  const engine = new EditorEngine(createTestTree());

  // Setup: root → A → [Child1, Child2]
  addBlock(engine.tree, 'A', 'root');
  addBlock(engine.tree, 'Child1', 'A');
  addBlock(engine.tree, 'Child2', 'A');

  // Capture initial relationships (not JSON, which has non-deterministic key order)
  const initialRelationships = {
    rootChildren: [...engine.tree.nodes['root'].children],
    aParent: engine.tree.nodes['A'].parentId,
    aChildren: [...engine.tree.nodes['A'].children],
    child1Parent: engine.tree.nodes['Child1'].parentId,
    child2Parent: engine.tree.nodes['Child2'].parentId,
  };

  // Delete via command
  const cmd = new DeleteBlockCommand('A');
  engine.dispatch(cmd);

  // Verify deletion
  assert(engine.tree.nodes['A'] === undefined, 'Block A deleted');
  assert(engine.tree.nodes['Child1']?.parentId === 'root', 'Child1 promoted');
  assert(engine.tree.nodes['Child2']?.parentId === 'root', 'Child2 promoted');

  // Undo
  engine.undo();

  // Verify restoration
  assert(engine.tree.nodes['A'] !== undefined, 'Block A restored');
  assertEqual(
    engine.tree.nodes['A']?.children,
    ['Child1', 'Child2'],
    'A has children again'
  );
  assert(
    engine.tree.nodes['Child1']?.parentId === 'A',
    'Child1 parent restored to A'
  );
  assert(
    engine.tree.nodes['Child2']?.parentId === 'A',
    'Child2 parent restored to A'
  );
  assertEqual(
    engine.tree.nodes['root']?.children,
    ['A'],
    'Root children restored'
  );

  // Verify relationships match (not JSON, which has non-deterministic key order)
  const restoredRelationships = {
    rootChildren: [...engine.tree.nodes['root'].children],
    aParent: engine.tree.nodes['A'].parentId,
    aChildren: [...engine.tree.nodes['A'].children],
    child1Parent: engine.tree.nodes['Child1'].parentId,
    child2Parent: engine.tree.nodes['Child2'].parentId,
  };
  assertEqual(
    restoredRelationships,
    initialRelationships,
    'Tree relationships exactly match initial state'
  );

  // Redo
  engine.redo();

  // Verify deletion again (deterministic)
  assert(engine.tree.nodes['A'] === undefined, 'Block A deleted again');
  assert(
    engine.tree.nodes['Child1']?.parentId === 'root',
    'Child1 promoted again'
  );
  assert(
    engine.tree.nodes['Child2']?.parentId === 'root',
    'Child2 promoted again'
  );
});

// TEST 6: Delete Last Root Block with Children
test('TEST 6: Delete last root block (children promoted to root)', () => {
  const engine = new EditorEngine(createTestTree());

  // Setup: root → A → [Child1, Child2, Child3]
  addBlock(engine.tree, 'A', 'root');
  addBlock(engine.tree, 'Child1', 'A');
  addBlock(engine.tree, 'Child2', 'A');
  addBlock(engine.tree, 'Child3', 'A');

  // Delete A (last root block)
  const result = engine.deleteBlock('A');

  // Verify
  assert(result !== null, 'Deletion returned metadata');
  assert(engine.tree.nodes['A'] === undefined, 'Block A deleted');
  assert(
    engine.tree.nodes['Child1']?.parentId === 'root',
    'Child1 promoted to root'
  );
  assert(
    engine.tree.nodes['Child2']?.parentId === 'root',
    'Child2 promoted to root'
  );
  assert(
    engine.tree.nodes['Child3']?.parentId === 'root',
    'Child3 promoted to root'
  );
  assertEqual(
    engine.tree.nodes['root']?.children,
    ['Child1', 'Child2', 'Child3'],
    'Root now has 3 children'
  );

  // Verify document invariant
  const rootChildren = engine.tree.nodes['root']?.children || [];
  assert(
    rootChildren.length >= 1,
    'Document has ≥ 1 block (invariant preserved)'
  );
});

// EDGE CASE: Children Inserted at Correct Index
test("EDGE CASE: Children inserted at deleted block's index", () => {
  const engine = new EditorEngine(createTestTree());

  // Setup: root → [Before, A → [Child1, Child2], After]
  addBlock(engine.tree, 'Before', 'root');
  addBlock(engine.tree, 'A', 'root');
  addBlock(engine.tree, 'Child1', 'A');
  addBlock(engine.tree, 'Child2', 'A');
  addBlock(engine.tree, 'After', 'root');

  // Delete A
  engine.deleteBlock('A');

  // Verify order: [Before, Child1, Child2, After]
  assertEqual(
    engine.tree.nodes['root']?.children,
    ['Before', 'Child1', 'Child2', 'After'],
    'Children inserted at correct index'
  );
});

// EDGE CASE: Multiple Undo/Redo Cycles
test('EDGE CASE: Multiple undo/redo cycles (no corruption)', () => {
  const engine = new EditorEngine(createTestTree());

  // Setup: root → A → [Child1, Child2]
  addBlock(engine.tree, 'A', 'root');
  addBlock(engine.tree, 'Child1', 'A');
  addBlock(engine.tree, 'Child2', 'A');

  // Capture initial relationships
  const initialRelationships = {
    rootChildren: [...engine.tree.nodes['root'].children],
    aParent: engine.tree.nodes['A'].parentId,
    aChildren: [...engine.tree.nodes['A'].children],
    child1Parent: engine.tree.nodes['Child1'].parentId,
    child2Parent: engine.tree.nodes['Child2'].parentId,
  };

  // Delete
  const cmd = new DeleteBlockCommand('A');
  engine.dispatch(cmd);

  // Undo → Redo → Undo → Redo → Undo
  engine.undo();
  engine.redo();
  engine.undo();
  engine.redo();
  engine.undo();

  // Verify relationships match initial after final undo
  const finalRelationships = {
    rootChildren: [...engine.tree.nodes['root'].children],
    aParent: engine.tree.nodes['A'].parentId,
    aChildren: [...engine.tree.nodes['A'].children],
    child1Parent: engine.tree.nodes['Child1'].parentId,
    child2Parent: engine.tree.nodes['Child2'].parentId,
  };
  assertEqual(
    finalRelationships,
    initialRelationships,
    'Tree relationships match initial state after multiple cycles'
  );
});

// ===== SUMMARY =====







if (failCount === 0) {
  
  
  process.exit(0);
} else {
  
  process.exit(1);
}
