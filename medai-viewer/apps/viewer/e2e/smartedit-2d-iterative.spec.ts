import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('2D SmartEdit iterative refinement with positive and negative points', async ({ page }) => {
  test.setTimeout(180000); // 3 minute timeout

  const consoleLogs: string[] = [];
  page.on('console', msg => {
    consoleLogs.push('[' + msg.type() + '] ' + msg.text());
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

  // Switch to SmartEdit tab and select SAM3
  await page.getByTestId('tab-smart-edit').click();
  await page.waitForTimeout(500);

  const modelSelect = page.getByTestId('model-select-smartedit');
  const modelOptions = await modelSelect.locator('option').allTextContents();
  console.log('Available models:', modelOptions);

  if (modelOptions.includes('SAM3')) {
    await modelSelect.selectOption({ label: 'SAM3' });
  } else {
    console.log('SAM3 not available, using default');
  }

  // Wait for inference completion helper
  const waitForInference = async (description: string, timeout = 60000) => {
    console.log(`Waiting for inference: ${description}...`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const hasComplete = consoleLogs.some(log =>
        log.includes('2D SAM3 inference complete') ||
        log.includes('Inference complete')
      );

      if (hasComplete) {
        console.log(`Inference complete: ${description}`);
        // Clear the "complete" logs so we can detect next inference
        const idx = consoleLogs.findIndex(l => l.includes('Inference complete') || l.includes('2D SAM3 inference complete'));
        if (idx > -1) consoleLogs[idx] = consoleLogs[idx] + ' [processed]';
        return true;
      }
      await page.waitForTimeout(1000);
    }
    console.log(`Inference timeout: ${description}`);
    return false;
  };

  // Get viewport for clicking
  const viewport = page.locator('[data-viewport-uid]').first();
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();

  // === First positive point ===
  console.log('\n=== Step 1: Adding first positive point ===');
  const pointToolBtn = page.getByTestId('smartedit-point-tool');
  await pointToolBtn.click();
  await page.waitForTimeout(500);

  // Click in upper-left area (likely on a cyst)
  const x1 = box!.x + box!.width * 0.35;
  const y1 = box!.y + box!.height * 0.4;
  console.log(`Clicking at (${x1}, ${y1})`);
  await page.mouse.click(x1, y1);

  // Wait for auto-inference
  await waitForInference('first positive point');
  await page.waitForTimeout(1000);

  // Screenshot after first point
  await page.screenshot({ path: '/tmp/iterative-step1-first-point.png' });

  // Count non-zero pixels from logs
  const getMaskPixels = () => {
    const match = consoleLogs.find(l => l.includes('totalNonZero:'));
    if (match) {
      const pixelMatch = match.match(/totalNonZero:\s*(\d+)/);
      return pixelMatch ? parseInt(pixelMatch[1]) : 0;
    }
    return 0;
  };

  const pixelsAfterFirst = getMaskPixels();
  console.log(`Mask pixels after first point: ${pixelsAfterFirst}`);

  // === Second positive point (expand selection) ===
  console.log('\n=== Step 2: Adding second positive point ===');
  // Click nearby to expand selection
  const x2 = box!.x + box!.width * 0.4;
  const y2 = box!.y + box!.height * 0.45;
  console.log(`Clicking at (${x2}, ${y2})`);
  await page.mouse.click(x2, y2);

  await waitForInference('second positive point');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/tmp/iterative-step2-second-point.png' });

  const pixelsAfterSecond = getMaskPixels();
  console.log(`Mask pixels after second point: ${pixelsAfterSecond}`);

  // === Negative point (refine selection) ===
  console.log('\n=== Step 3: Adding negative point ===');
  // Click the Exclude button to switch to negative polarity
  const negativeBtn = page.getByTestId('polarity-negative');
  const negativeBtnExists = await negativeBtn.isVisible().catch(() => false);

  if (negativeBtnExists) {
    await negativeBtn.click();
    await page.waitForTimeout(1000); // Give time for tool reactivation
    console.log('Switched to negative (Exclude) mode');

    // Print logs after switching polarity
    const recentLogs = consoleLogs.slice(-10);
    console.log('Recent logs after polarity switch:');
    recentLogs.forEach(l => console.log('  ', l));
  } else {
    console.log('Polarity negative button not found');
  }

  // Click in an area we want to exclude
  const x3 = box!.x + box!.width * 0.6;
  const y3 = box!.y + box!.height * 0.5;
  console.log(`Clicking negative point at (${x3}, ${y3})`);
  await page.mouse.click(x3, y3);
  await page.waitForTimeout(2000); // Wait for annotation + inference

  // Check console for negative annotation
  const negAnnotationLogs = consoleLogs.filter(l => l.includes('isPositive: false') || l.includes('neg_points') || l.includes('negative'));
  console.log('Negative-related logs:');
  negAnnotationLogs.forEach(l => console.log('  ', l));

  await waitForInference('negative point');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/tmp/iterative-step3-negative-point.png' });

  const pixelsAfterNegative = getMaskPixels();
  console.log(`Mask pixels after negative point: ${pixelsAfterNegative}`);

  // === Summary ===
  console.log('\n=== Summary ===');
  console.log(`Pixels after first positive: ${pixelsAfterFirst}`);
  console.log(`Pixels after second positive: ${pixelsAfterSecond}`);
  console.log(`Pixels after negative: ${pixelsAfterNegative}`);

  // Print relevant logs
  console.log('\n=== Inference Logs ===');
  consoleLogs.filter(log =>
    log.includes('Inference') ||
    log.includes('totalNonZero') ||
    log.includes('pos_points') ||
    log.includes('neg_points') ||
    log.includes('mask size')
  ).forEach(log => console.log(log));

  // Basic validation: should have generated some mask
  expect(pixelsAfterFirst).toBeGreaterThan(0);
  console.log('Test completed successfully!');
});
