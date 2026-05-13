/**
 * E2E tests for editor keyboard and mouse interactions.
 * Each test navigates to a fresh page, so each starts with one empty node.
 *
 * DOM structure recap:
 *   .clutter-document-body              — editor root (direct children are top-level nodes)
 *     .clutter-node[data-node-id]       — each node wrapper
 *       .clutter-node__inner
 *         .clutter-node__content        — contenteditable
 *           span > (text node)
 *       .clutter-node__children         — present only when node has children
 *         .clutter-node[data-node-id]   — child node wrappers (same structure)
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to a fresh editor (one empty node). */
async function fresh(page: Page) {
  await page.goto('/');
  // Wait for the editor to mount and first node to appear
  await expect(page.locator('.clutter-node__content').first()).toBeVisible();
}

/** Click the nth content area (0-based) and place caret there. */
async function clickNode(page: Page, index: number) {
  await page.locator('.clutter-node__content').nth(index).click();
}

/** Return text of nth content area. */
async function nodeText(page: Page, index: number): Promise<string> {
  return (await page.locator('.clutter-node__content span').nth(index).textContent()) ?? '';
}

/** Count of top-level (root-child) .clutter-node elements. */
function topLevelNodes(page: Page) {
  return page.locator('.clutter-document-body > .clutter-node');
}

// ---------------------------------------------------------------------------
// Typing
// ---------------------------------------------------------------------------

test.describe('Typing', () => {
  test('text appears in the focused node', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('hello world');
    await expect(page.locator('.clutter-node__content span').first()).toHaveText('hello world');
  });

  test('typing triggers invariant: trailing empty node is added', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('hello');
    // After typing into n0, invariant adds a trailing empty node → 2 top-level nodes
    await expect(topLevelNodes(page)).toHaveCount(2);
    // Last node is empty
    const nodes = topLevelNodes(page);
    const lastText = await nodes.last().locator('.clutter-node__content span').textContent();
    expect(lastText?.trim()).toBe('');
  });

  test('typing in second node does not add extra trailing nodes', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('first');
    // now 2 nodes (first + trailing). Type in trailing:
    await clickNode(page, 1);
    await page.keyboard.type('second');
    // invariant adds a new trailing → 3 nodes total
    await expect(topLevelNodes(page)).toHaveCount(3);
    expect(await nodeText(page, 0)).toBe('first');
    expect(await nodeText(page, 1)).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// Enter — split node
// ---------------------------------------------------------------------------

test.describe('Enter', () => {
  test('Enter at end of text creates a new empty node below', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('hello');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    // nodes: 'hello', '' (new), '' (trailing) = 3
    await expect(topLevelNodes(page)).toHaveCount(3);
    expect(await nodeText(page, 0)).toBe('hello');
    expect(await nodeText(page, 1)).toBe('');
  });

  test('Enter in the middle splits text correctly', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('helloworld');
    // Move caret to after 'hello' (position 5): ArrowLeft x5 from end (offset 10 → 5)
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    expect(await nodeText(page, 0)).toBe('hello');
    expect(await nodeText(page, 1)).toBe('world');
  });

  test('Enter on empty node creates another empty node below', async ({ page }) => {
    await fresh(page);
    // First node is already empty
    await clickNode(page, 0);
    await page.keyboard.press('Enter');
    // 2 nodes: original empty + new empty (invariant may not add trailing since both are empty)
    const count = await topLevelNodes(page).count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Backspace — merge node
// ---------------------------------------------------------------------------

test.describe('Backspace', () => {
  test('Backspace at start of second node merges it into the first', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('foo');
    await page.keyboard.press('Enter');
    // Now: 'foo', '', trailing. Type in second node:
    await clickNode(page, 1);
    await page.keyboard.type('bar');
    // Now: 'foo', 'bar', trailing. Move to offset 0 via ArrowLeft x3.
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    // 'bar' merged into 'foo' → 'foobar', trailing = 2 nodes
    await expect(topLevelNodes(page)).toHaveCount(2);
    expect(await nodeText(page, 0)).toBe('foobar');
  });

  test('Backspace at start of first node does nothing', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('hello');
    // Move to offset 0 via ArrowLeft x5
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    // No merge possible — still 'hello' in first node
    expect(await nodeText(page, 0)).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Tab — indent / Shift+Tab — outdent
// ---------------------------------------------------------------------------

test.describe('Tab / Shift+Tab', () => {
  test('Tab makes node a child of the previous sibling', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('parent');
    await page.keyboard.press('Enter');
    await page.keyboard.type('child');
    await page.keyboard.press('Tab');
    // 'child' is now nested under 'parent'
    const parentNode = topLevelNodes(page).first();
    const nestedChild = parentNode.locator('.clutter-node__children .clutter-node__content span');
    await expect(nestedChild).toHaveText('child');
  });

  test('Tab on first node does nothing', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('first');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    // Still a top-level node
    await expect(topLevelNodes(page).first().locator('.clutter-node__content span')).toHaveText('first');
    expect(await topLevelNodes(page).count()).toBe(2); // first + trailing
  });

  test('Shift+Tab outdents a nested child back to top level', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('parent');
    await page.keyboard.press('Enter');
    await page.keyboard.type('child');
    await page.keyboard.press('Tab'); // indent
    // Now outdent
    await page.keyboard.press('Shift+Tab');
    // 'child' is back at top level
    await expect(topLevelNodes(page)).toHaveCount(3); // parent, child, trailing
    expect(await nodeText(page, 1)).toBe('child');
  });
});

// ---------------------------------------------------------------------------
// Arrow key navigation
// ---------------------------------------------------------------------------

test.describe('Arrow keys', () => {
  test('ArrowDown moves caret to next node', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');
    // Go back to first node
    await clickNode(page, 0);
    await page.keyboard.press('ArrowDown');
    // ArrowDown lands at offset 0 of next node, so '!' inserts at the front
    await page.keyboard.type('!');
    expect(await nodeText(page, 1)).toBe('!second');
  });

  test('ArrowUp moves caret to previous node', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');
    await page.keyboard.press('ArrowUp');
    // ArrowUp lands at offset 0 of previous node, so '!' inserts at the front
    await page.keyboard.type('!');
    expect(await nodeText(page, 0)).toBe('!first');
  });
});

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

test.describe('Undo / Redo', () => {
  test('Cmd+Z undoes typed text', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('hello');
    await page.keyboard.press('Meta+z');
    // After undo, text should be gone (or partially gone — one char at a time)
    // The controller batches per keystroke so each character is one undo step.
    // After one undo, 'hell' remains.
    const text = await nodeText(page, 0);
    expect(text.length).toBeLessThan(5);
  });

  test('Cmd+Z undoes a split (Enter)', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('hello');
    await page.keyboard.press('Enter');
    await expect(topLevelNodes(page)).toHaveCount(3); // hello, new empty, trailing
    await page.keyboard.press('Meta+z');
    // Undo split: back to 2 nodes (hello + trailing)
    await expect(topLevelNodes(page)).toHaveCount(2);
    expect(await nodeText(page, 0)).toBe('hello');
  });

  test('Cmd+Shift+Z redoes after undo', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('hello');
    await page.keyboard.press('Meta+z'); // undo 'o' → 'hell'
    await page.keyboard.press('Meta+Shift+z'); // redo → 'hello'
    expect(await nodeText(page, 0)).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Block-range selection via mouse drag
// ---------------------------------------------------------------------------

test.describe('Block-range selection', () => {
  test('dragging across two nodes selects both', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');

    // Drag from first node to second node
    const first = topLevelNodes(page).nth(0);
    const second = topLevelNodes(page).nth(1);

    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    if (!firstBox || !secondBox) throw new Error('nodes not visible');

    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, { steps: 5 });
    await page.mouse.up();

    // Both nodes should have block-selected class
    await expect(first).toHaveClass(/clutter-node--block-selected/);
    await expect(second).toHaveClass(/clutter-node--block-selected/);
  });

  test('ArrowLeft on block-range collapses caret to first node', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');

    const first = topLevelNodes(page).nth(0);
    const second = topLevelNodes(page).nth(1);
    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    if (!firstBox || !secondBox) throw new Error('nodes not visible');

    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, { steps: 5 });
    await page.mouse.up();

    await page.keyboard.press('ArrowLeft');
    // Neither node should be block-selected after collapse
    await expect(first).not.toHaveClass(/clutter-node--block-selected/);
    await expect(second).not.toHaveClass(/clutter-node--block-selected/);
  });

  test('Backspace on block-range deletes all selected nodes', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');

    const first = topLevelNodes(page).nth(0);
    const second = topLevelNodes(page).nth(1);
    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    if (!firstBox || !secondBox) throw new Error('nodes not visible');

    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, { steps: 5 });
    await page.mouse.up();

    await page.keyboard.press('Backspace');
    // Both 'first' and 'second' nodes are deleted; only trailing empty remains
    await expect(topLevelNodes(page)).toHaveCount(1);
    expect((await nodeText(page, 0)).trim()).toBe('');
  });

  test('typing on block-range replaces selection with typed text', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');

    const first = topLevelNodes(page).nth(0);
    const second = topLevelNodes(page).nth(1);
    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    if (!firstBox || !secondBox) throw new Error('nodes not visible');

    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, { steps: 5 });
    await page.mouse.up();

    await page.keyboard.type('x');
    // 'x' is appended to the first node in the range; the block-range is cleared
    expect(await nodeText(page, 0)).toContain('x');
  });
});

// ---------------------------------------------------------------------------
// Undo after structural edits
// ---------------------------------------------------------------------------

test.describe('Undo structural edits', () => {
  test('undo of indent restores node to top level', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('parent');
    await page.keyboard.press('Enter');
    await page.keyboard.type('child');
    await page.keyboard.press('Tab'); // indent child under parent
    // Verify nested
    const parentNode = topLevelNodes(page).first();
    await expect(parentNode.locator('.clutter-node__children')).toBeVisible();

    await page.keyboard.press('Meta+z'); // undo indent
    // child should be back at top level
    await expect(topLevelNodes(page)).toHaveCount(3); // parent, child, trailing
  });

  test('undo of block-range delete restores deleted nodes', async ({ page }) => {
    await fresh(page);
    await clickNode(page, 0);
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');

    const first = topLevelNodes(page).nth(0);
    const second = topLevelNodes(page).nth(1);
    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    if (!firstBox || !secondBox) throw new Error('nodes not visible');

    // Select and delete
    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press('Backspace');
    await expect(topLevelNodes(page)).toHaveCount(1);

    // Undo
    await page.keyboard.press('Meta+z');
    await expect(topLevelNodes(page)).toHaveCount(3); // first, second, trailing
    expect(await nodeText(page, 0)).toBe('first');
    expect(await nodeText(page, 1)).toBe('second');
  });
});
