import { expect, test } from '@playwright/test';
test.describe('EditableText', () => {
    test('clicking into the middle of the title places the caret at that position', async ({ page, }) => {
        await page.goto('/');
        const editableText = page.locator('.editable-text').first();
        await expect(editableText).toBeVisible();
        const originalValue = (await editableText.textContent()) ?? '';
        const box = await editableText.boundingBox();
        if (!box) {
            throw new Error('EditableText bounding box was not available.');
        }
        await editableText.click({
            position: {
                x: box.width / 2,
                y: box.height / 2,
            },
        });
        const caretOffset = await editableText.evaluate((element) => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                return null;
            }
            const range = selection.getRangeAt(0).cloneRange();
            range.selectNodeContents(element);
            range.setEnd(selection.anchorNode, selection.anchorOffset);
            return range.toString().length;
        });
        expect(caretOffset).not.toBeNull();
        expect(caretOffset).toBeGreaterThan(0);
        expect(caretOffset).toBeLessThan(originalValue.length);
        await page.keyboard.type('X');
        expect(caretOffset).not.toBeNull();
        await expect(editableText).toHaveText(`${originalValue.slice(0, caretOffset)}X${originalValue.slice(caretOffset)}`);
    });
    test('typing into an empty editable starts at the natural beginning', async ({ page, }) => {
        await page.goto('/');
        const editableText = page.locator('.editable-text').nth(1);
        await expect(editableText).toBeVisible();
        await editableText.evaluate((element) => {
            element.textContent = '';
            element.setAttribute('data-empty', 'true');
        });
        await editableText.click();
        await page.keyboard.type('A');
        await expect(editableText).toHaveText('A');
    });
});
