import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test segment isolation:
 * 1. Add positive point on segment 1 → get mask
 * 2. Add segment 2 → prompts should NOT carry over
 * 3. Add positive point on segment 2 → get NEW mask (not segment 1's mask)
 * 4. Switch back to segment 1 → should restore segment 1's prompts
 */
test('debug segment isolation - prompts should not leak between segments', async ({ page }) => {
  test.setTimeout(300000); // 5 minute timeout

  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = '[' + msg.type() + '] ' + msg.text();
    consoleLogs.push(text);
    // Print important logs immediately
    if (text.includes('Segment changed') ||
        text.includes('SegmentChange') ||
        text.includes('clearAllSmartEditAnnotations') ||
        text.includes('resetInferenceSession') ||
        text.includes('Running inference') ||
        text.includes('totalCount') ||
        text.includes('Saved prompts') ||
        text.includes('Restoring saved prompts')) {
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

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // ========== STEP 1: Add positive point on Segment 1 ==========
  console.log('\n=== STEP 1: POSITIVE POINT ON SEGMENT 1 ===');

  const pointToolBtn = page.getByTestId('smartedit-point-tool');
  await pointToolBtn.click();
  await page.waitForTimeout(500);

  console.log(`Adding positive point at (${centerX}, ${centerY})`);
  await page.mouse.click(centerX, centerY);

  console.log('Waiting for inference...');
  await page.waitForTimeout(10000);
  await page.screenshot({ path: '/tmp/seg-isolation-1-segment1.png' });

  // Check annotation count
  const logsAfterSeg1 = consoleLogs.filter(log =>
    log.includes('totalCount') || log.includes('Running inference')
  );
  console.log('\n--- Logs after segment 1 point ---');
  logsAfterSeg1.slice(-10).forEach(log => console.log(log));

  // ========== STEP 2: Add Segment 2 ==========
  console.log('\n=== STEP 2: ADDING SEGMENT 2 ===');

  // Find and click the "Add Seg" button (data-testid="create-segmentation-button")
  const addSegmentBtn = page.getByTestId('create-segmentation-button');
  const addSegmentExists = await addSegmentBtn.isVisible().catch(() => false);
  console.log('Add Seg button exists:', addSegmentExists);

  if (addSegmentExists) {
    await addSegmentBtn.click();
    console.log('Clicked Add Seg button');
  } else {
    console.log('ERROR: Could not find Add Seg button');
  }
  await page.waitForTimeout(3000);

  // Check if segment 2 is now active
  console.log('Segment 2 should now be active');
  await page.screenshot({ path: '/tmp/seg-isolation-2-after-add-segment.png' });

  // Check logs for segment change
  const segChangeLog = consoleLogs.filter(log =>
    log.includes('Segment changed') || log.includes('clearAllSmartEditAnnotations')
  );
  console.log('\n--- Segment change logs ---');
  segChangeLog.slice(-10).forEach(log => console.log(log));

  // ========== STEP 3: Check that annotations are cleared ==========
  console.log('\n=== STEP 3: VERIFY ANNOTATIONS CLEARED ===');

  // Wait a moment for polling to run
  await page.waitForTimeout(2000);

  // Check if any inference was triggered (should NOT be if annotations were cleared)
  const inferenceAfterSwitch = consoleLogs.filter(log =>
    log.includes('Running inference')
  );
  console.log('\n--- All inference logs (should be only 1 from segment 1) ---');
  inferenceAfterSwitch.forEach(log => console.log(log));

  // ========== STEP 4: Add positive point on Segment 2 ==========
  console.log('\n=== STEP 4: POSITIVE POINT ON SEGMENT 2 ===');

  // Reset to positive mode and activate point tool
  // After segment switch, we need to ensure the tool is active
  const includeBtn = page.getByTestId('polarity-positive');
  if (await includeBtn.isVisible().catch(() => false)) {
    await includeBtn.click();
    await page.waitForTimeout(300);
    console.log('Clicked Include (positive mode) for segment 2');
  }

  // Now the point tool should be active (handlePolarityChange re-activates it)
  await page.waitForTimeout(500);

  // Click at different position to distinguish from segment 1
  const seg2X = centerX - 50;
  const seg2Y = centerY - 50;
  console.log(`Adding positive point at (${seg2X}, ${seg2Y}) for segment 2`);
  await page.mouse.click(seg2X, seg2Y);

  console.log('Waiting for inference...');
  await page.waitForTimeout(10000);
  await page.screenshot({ path: '/tmp/seg-isolation-3-segment2.png' });

  // ========== STEP 5: Switch back to Segment 1 ==========
  console.log('\n=== STEP 5: SWITCH BACK TO SEGMENT 1 ===');

  // Find segment 1 in the segment list and click it
  // The segment item has data-testid="segment-{index}"
  const segment1 = page.locator('[data-testid="segment-1"]');
  const seg1Exists = await segment1.isVisible().catch(() => false);
  console.log('Segment 1 item exists (data-testid="segment-1"):', seg1Exists);

  if (seg1Exists) {
    console.log('Clicking segment 1 item...');
    await segment1.click();
  } else {
    // Try clicking segment by label text
    const seg1Alt = page.locator('.segment-item:has-text("Segment 1")').first();
    const seg1AltExists = await seg1Alt.isVisible().catch(() => false);
    console.log('Segment 1 by text exists:', seg1AltExists);
    if (seg1AltExists) {
      await seg1Alt.click();
    } else {
      // Last resort - try finding any element with Segment 1
      const anySegment1 = page.getByText('Segment 1', { exact: false }).first();
      if (await anySegment1.isVisible().catch(() => false)) {
        console.log('Found Segment 1 text, clicking...');
        await anySegment1.click();
      } else {
        console.log('ERROR: Could not find Segment 1 to click');
      }
    }
  }
  await page.waitForTimeout(5000);

  console.log('Should have switched back to segment 1');
  await page.screenshot({ path: '/tmp/seg-isolation-4-back-to-segment1.png' });

  // Check if prompts were restored
  const restoreLog = consoleLogs.filter(log =>
    log.includes('Restoring saved prompts') || log.includes('Replaying prompts')
  );
  console.log('\n--- Restore prompts logs ---');
  restoreLog.forEach(log => console.log(log));

  // ========== FINAL DEBUG OUTPUT ==========
  console.log('\n\n========== FINAL DEBUG OUTPUT ==========');

  console.log('\n--- All segment change logs ---');
  consoleLogs.filter(log =>
    log.includes('Segment changed')
  ).forEach(log => console.log(log));

  console.log('\n--- All clearAllSmartEditAnnotations logs ---');
  consoleLogs.filter(log =>
    log.includes('clearAllSmartEditAnnotations')
  ).forEach(log => console.log(log));

  console.log('\n--- All inference trigger logs ---');
  consoleLogs.filter(log =>
    log.includes('Running inference') || log.includes('totalCount')
  ).forEach(log => console.log(log));

  console.log('\n--- All saved/restored prompts logs ---');
  consoleLogs.filter(log =>
    log.includes('Saved prompts') || log.includes('Restoring')
  ).forEach(log => console.log(log));

  console.log('\n========== END DEBUG ==========');
});
