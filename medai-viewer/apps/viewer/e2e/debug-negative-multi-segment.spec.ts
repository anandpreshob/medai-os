import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test the exact user workflow:
 * 1. Make a box → segment 1
 * 2. Add segment → make positive box → segment 2
 * 3. Segment 2 oversegmented → negative point → does nothing
 * 4. Try negative box → does nothing
 */
test('debug negative prompts on segment 2 after positive box', async ({ page }) => {
  test.setTimeout(300000); // 5 minute timeout

  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = '[' + msg.type() + '] ' + msg.text();
    consoleLogs.push(text);
    // Print important logs immediately
    if (text.includes('Running inference') ||
        text.includes('negPoints') || text.includes('negBoxes') ||
        text.includes('isPositive') || text.includes('Segment changed') ||
        text.includes('annotation count') || text.includes('totalCount')) {
      console.log('>>>', text);
    }
  });

  await page.goto('/');
  await expect(page.getByText('Drag & Drop Files Here')).toBeVisible({ timeout: 10000 });

  // Load 2D image
  console.log('\n=== LOADING 2D IMAGE ===');
  const fileInput = page.locator('#file-input');
  const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
  await fileInput.setInputFiles(jpegPath);
  await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });

  // Connect
  console.log('\n=== CONNECTING ===');
  await page.getByRole('button', { name: /connect/i }).click();
  await page.waitForTimeout(3000);

  // SmartEdit tab
  await page.getByTestId('tab-smart-edit').click();
  await page.waitForTimeout(500);

  // Select SAM3
  const modelSelect = page.getByTestId('model-select-smartedit');
  await modelSelect.selectOption({ label: 'SAM3' });
  await page.waitForTimeout(1000);

  const viewport = page.locator('[data-viewport-uid]').first();
  const box = await viewport.boundingBox();
  if (!box) {
    console.log('Could not get viewport bounds');
    return;
  }

  // Use the CENTER of the viewport for all prompts - this is where the image content is
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  console.log(`Viewport center: (${centerX}, ${centerY})`);

  // ========== STEP 1: Positive POINT on Segment 1 ==========
  // Using point instead of box because points don't have the highlighted issue
  console.log('\n=== STEP 1: POSITIVE POINT ON SEGMENT 1 ===');

  // Click point tool
  const pointToolBtn = page.getByTestId('smartedit-point-tool');
  await pointToolBtn.click();
  await page.waitForTimeout(500);

  // Add positive point at center - this will create the initial mask
  console.log(`Adding positive point at center: (${centerX}, ${centerY})`);
  await page.mouse.click(centerX, centerY);

  // Wait for inference to complete
  console.log('Waiting for positive point inference...');
  await page.waitForTimeout(10000);
  await page.screenshot({ path: '/tmp/multi-seg-1-segment1.png' });

  // Store box tool button for later use
  const boxToolBtn = page.getByTestId('smartedit-box-tool');

  // ========== STEP 2: NEGATIVE POINT TO REFINE MASK ==========
  // After positive box creates a mask, we refine it with negative prompts
  // The negative prompts must be INSIDE the positive box area
  console.log('\n=== STEP 2: NEGATIVE POINT TO REFINE MASK ===');

  // Click Exclude button to switch to negative mode
  const excludeBtn = page.getByTestId('polarity-negative');
  const excludeExists = await excludeBtn.isVisible().catch(() => false);
  console.log('Exclude button exists:', excludeExists);

  if (excludeExists) {
    await excludeBtn.click();
    await page.waitForTimeout(500);
    console.log('Clicked Exclude (negative mode)');
  }

  // NOTE: Don't click pointToolBtn again! handlePolarityChange already re-activated
  // the point tool with negative polarity. Clicking again would toggle it OFF.
  await page.waitForTimeout(300);
  console.log('Point tool should still be active in negative mode');

  // Add negative point near the positive point (where the mask should be)
  // The positive point was at center, so click slightly offset
  // This negative point should SUBTRACT from the mask
  const negPointX = centerX + 30;  // Slightly offset from positive point
  const negPointY = centerY + 30;
  console.log(`Adding negative point at (${negPointX}, ${negPointY}) - should be INSIDE mask from positive point`);
  await page.mouse.click(negPointX, negPointY);

  // Wait for inference
  console.log('Waiting for negative point inference...');
  await page.waitForTimeout(15000);
  await page.screenshot({ path: '/tmp/multi-seg-2-negative-point.png' });

  // Print relevant logs
  console.log('\n--- Console logs after negative point ---');
  consoleLogs.filter(log =>
    log.includes('negPoints') || log.includes('isPositive') ||
    log.includes('Running inference') || log.includes('totalCount') ||
    log.includes('annotation')
  ).slice(-30).forEach(log => console.log(log));

  // ========== STEP 3: Try negative box ==========
  console.log('\n=== STEP 3: NEGATIVE BOX TO REFINE MASK ===');

  // Make sure we're still in negative mode and switch to box
  await excludeBtn.click().catch(() => {}); // Ensure negative mode
  await page.waitForTimeout(200);
  await boxToolBtn.click();
  await page.waitForTimeout(500);
  console.log('Clicked box tool (should be in negative mode)');

  // Draw SMALL negative box INSIDE the positive box area
  // This should cut a hole in the mask
  const negBoxStartX = centerX - 30;  // Small box at center
  const negBoxStartY = centerY - 30;
  const negBoxEndX = centerX + 30;
  const negBoxEndY = centerY + 30;

  console.log(`Drawing negative box at center: (${negBoxStartX}, ${negBoxStartY}) to (${negBoxEndX}, ${negBoxEndY})`);
  await page.mouse.move(negBoxStartX, negBoxStartY);
  await page.mouse.down();
  await page.mouse.move(negBoxEndX, negBoxEndY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Click elsewhere to deselect the box (removes highlighted state)
  console.log('Clicking elsewhere to deselect box...');
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.waitForTimeout(500);

  // Wait for inference
  console.log('Waiting for negative box inference...');
  await page.waitForTimeout(15000);
  await page.screenshot({ path: '/tmp/multi-seg-3-negative-box.png' });

  // ========== FINAL DEBUG OUTPUT ==========
  console.log('\n\n========== FINAL DEBUG OUTPUT ==========');

  // Filter for key logs
  console.log('\n--- All negPoints/negBoxes logs ---');
  consoleLogs.filter(log =>
    log.includes('negPoints') || log.includes('negBoxes') || log.includes('neg_points') || log.includes('neg_boxes')
  ).forEach(log => console.log(log));

  console.log('\n--- All isPositive logs ---');
  consoleLogs.filter(log =>
    log.includes('isPositive')
  ).forEach(log => console.log(log));

  console.log('\n--- All inference trigger logs ---');
  consoleLogs.filter(log =>
    log.includes('Running inference') || log.includes('totalCount') || log.includes('annotation count')
  ).forEach(log => console.log(log));

  console.log('\n--- All inference result logs ---');
  consoleLogs.filter(log =>
    log.includes('Updating existing segmentation') || log.includes('Result')
  ).forEach(log => console.log(log));

  console.log('\n========== END DEBUG ==========');
});
