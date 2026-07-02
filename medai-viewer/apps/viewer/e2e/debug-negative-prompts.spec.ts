import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('debug negative points/boxes for SAM3 2D', async ({ page }) => {
  test.setTimeout(180000); // 3 minute timeout

  // Collect all console logs
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = '[' + msg.type() + '] ' + msg.text();
    consoleLogs.push(text);
    // Print mode-related logs immediately
    if (text.includes('setPointMode') || text.includes('getPointMode') ||
        text.includes('setBoxMode') || text.includes('getBoxMode') ||
        text.includes('isPositive') || text.includes('negPoints') ||
        text.includes('negBoxes') || text.includes('Negative')) {
      console.log('>>> MODE LOG:', text);
    }
  });

  await page.goto('/');
  await expect(page.getByText('Drag & Drop Files Here')).toBeVisible({ timeout: 10000 });

  // Load 2D image
  console.log('Loading 2D image...');
  const fileInput = page.locator('#file-input');
  const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
  await fileInput.setInputFiles(jpegPath);
  await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });
  console.log('2D image loaded successfully');

  // Connect to server
  console.log('Connecting to server...');
  await page.getByRole('button', { name: /connect/i }).click();
  await page.waitForTimeout(3000);

  // Click SmartEdit tab
  console.log('Switching to SmartEdit tab...');
  await page.getByTestId('tab-smart-edit').click();
  await page.waitForTimeout(500);

  // Select SAM3 model
  const modelSelect = page.getByTestId('model-select-smartedit');
  const modelOptions = await modelSelect.locator('option').allTextContents();
  console.log('Available models:', modelOptions);

  if (modelOptions.includes('SAM3')) {
    console.log('Selecting SAM3 model...');
    await modelSelect.selectOption({ label: 'SAM3' });
    await page.waitForTimeout(1000);
  } else {
    console.log('SAM3 not available, skipping test');
    return;
  }

  // Get viewport for clicking
  const viewport = page.locator('[data-viewport-uid]').first();
  const box = await viewport.boundingBox();
  if (!box) {
    console.log('Could not get viewport bounding box');
    return;
  }

  // ============ TEST POSITIVE POINT ============
  console.log('\n=== TESTING POSITIVE POINT ===');

  // Click point tool (positive by default)
  const pointToolBtn = page.getByTestId('smartedit-point-tool');
  await pointToolBtn.click();
  await page.waitForTimeout(500);

  // Click to add positive point
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  console.log(`Adding POSITIVE point at (${centerX}, ${centerY})`);
  await page.mouse.click(centerX, centerY);

  // Wait for inference
  console.log('Waiting for positive point inference...');
  await page.waitForTimeout(10000);

  // Print mode logs after positive point
  console.log('\n--- Logs after POSITIVE point ---');
  consoleLogs.filter(log =>
    log.includes('setPointMode') || log.includes('getPointMode') ||
    log.includes('isPositive') || log.includes('New annotation')
  ).slice(-10).forEach(log => console.log(log));

  await page.screenshot({ path: '/tmp/neg-test-1-positive-point.png' });

  // ============ SWITCH TO NEGATIVE MODE ============
  console.log('\n=== SWITCHING TO NEGATIVE MODE ===');

  // Find and click the negative button (polarity-negative)
  const negativeBtn = page.getByTestId('polarity-negative');
  const negativeBtnExists = await negativeBtn.isVisible().catch(() => false);
  console.log('Negative button (polarity-negative) exists:', negativeBtnExists);

  if (negativeBtnExists) {
    console.log('Clicking negative mode button...');
    await negativeBtn.click();
    await page.waitForTimeout(500);
  } else {
    // Try to find by text
    const negByText = page.locator('button:has-text("Exclude")').first();
    const negByTextExists = await negByText.isVisible().catch(() => false);
    console.log('Negative button by text (Exclude) exists:', negByTextExists);
    if (negByTextExists) {
      await negByText.click();
      await page.waitForTimeout(500);
    }
  }

  // Print mode logs after switching to negative
  console.log('\n--- Logs after clicking NEGATIVE button ---');
  consoleLogs.filter(log =>
    log.includes('setPointMode') || log.includes('getPointMode') ||
    log.includes('Polarity') || log.includes('handlePolarityChange') ||
    log.includes('activateTool')
  ).slice(-10).forEach(log => console.log(log));

  // NOTE: Don't click pointToolBtn again! handlePolarityChange already re-activated
  // the point tool with negative polarity. Clicking again would toggle it OFF.
  await page.waitForTimeout(500);

  // ============ TEST NEGATIVE POINT ============
  console.log('\n=== TESTING NEGATIVE POINT ===');

  // Click to add negative point (offset from center)
  const negX = box.x + box.width / 2 + 50;
  const negY = box.y + box.height / 2 + 50;
  console.log(`Adding NEGATIVE point at (${negX}, ${negY})`);
  await page.mouse.click(negX, negY);

  // Wait for inference
  console.log('Waiting for negative point inference...');
  await page.waitForTimeout(10000);

  // Print mode logs after negative point
  console.log('\n--- Logs after NEGATIVE point ---');
  consoleLogs.filter(log =>
    log.includes('setPointMode') || log.includes('getPointMode') ||
    log.includes('isPositive') || log.includes('New annotation') ||
    log.includes('negPoints') || log.includes('neg_points')
  ).slice(-15).forEach(log => console.log(log));

  await page.screenshot({ path: '/tmp/neg-test-2-negative-point.png' });

  // ============ TEST NEGATIVE BOX ============
  console.log('\n=== TESTING NEGATIVE BOX ===');

  // Click box tool
  const boxToolBtn = page.getByTestId('smartedit-box-tool');
  const boxToolExists = await boxToolBtn.isVisible().catch(() => false);
  console.log('Box tool button exists:', boxToolExists);

  if (boxToolExists) {
    await boxToolBtn.click();
    await page.waitForTimeout(500);

    // Draw a box - use drag and then click elsewhere to deselect
    const boxStartX = box.x + box.width / 3;
    const boxStartY = box.y + box.height / 3;
    const boxEndX = box.x + box.width * 2 / 3;
    const boxEndY = box.y + box.height * 2 / 3;

    console.log(`Drawing NEGATIVE box from (${boxStartX}, ${boxStartY}) to (${boxEndX}, ${boxEndY})`);

    // Drag to draw box
    await page.mouse.move(boxStartX, boxStartY);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(boxEndX, boxEndY, { steps: 20 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Click elsewhere to deselect/complete the annotation
    await page.mouse.click(box.x + 10, box.y + 10);
    await page.waitForTimeout(500);

    // Wait for inference
    console.log('Waiting for negative box inference...');
    await page.waitForTimeout(10000);

    // Print mode logs after negative box
    console.log('\n--- Logs after NEGATIVE box ---');
    consoleLogs.filter(log =>
      log.includes('setBoxMode') || log.includes('getBoxMode') ||
      log.includes('isPositive') || log.includes('New annotation') ||
      log.includes('negBoxes') || log.includes('neg_boxes') ||
      log.includes('RectangleMONAILabel')
    ).slice(-15).forEach(log => console.log(log));

    await page.screenshot({ path: '/tmp/neg-test-3-negative-box.png' });
  }

  // ============ FINAL SUMMARY ============
  console.log('\n\n========== FINAL SUMMARY ==========');

  // Count setPointMode calls
  const setPointModeCalls = consoleLogs.filter(log => log.includes('setPointMode'));
  console.log('\nsetPointMode calls:');
  setPointModeCalls.forEach(log => console.log('  ', log));

  // Count getPointMode calls
  const getPointModeCalls = consoleLogs.filter(log => log.includes('getPointMode'));
  console.log('\ngetPointMode calls:');
  getPointModeCalls.forEach(log => console.log('  ', log));

  // Count setBoxMode calls
  const setBoxModeCalls = consoleLogs.filter(log => log.includes('setBoxMode'));
  console.log('\nsetBoxMode calls:');
  setBoxModeCalls.forEach(log => console.log('  ', log));

  // Count getBoxMode calls
  const getBoxModeCalls = consoleLogs.filter(log => log.includes('getBoxMode'));
  console.log('\ngetBoxMode calls:');
  getBoxModeCalls.forEach(log => console.log('  ', log));

  // Annotation creation logs
  const annotationLogs = consoleLogs.filter(log => log.includes('New annotation created'));
  console.log('\nAnnotation creation logs:');
  annotationLogs.forEach(log => console.log('  ', log));

  // isPositive values in annotations
  const isPositiveLogs = consoleLogs.filter(log => log.includes('isPositive raw='));
  console.log('\nisPositive values when reading annotations:');
  isPositiveLogs.forEach(log => console.log('  ', log));

  // Check for any negPoints/negBoxes in inference
  const negPromptLogs = consoleLogs.filter(log =>
    log.includes('negPoints') || log.includes('neg_points') ||
    log.includes('negBoxes') || log.includes('neg_boxes')
  );
  console.log('\nNegative prompt logs:');
  negPromptLogs.forEach(log => console.log('  ', log));

  console.log('\n========== END SUMMARY ==========');
});
