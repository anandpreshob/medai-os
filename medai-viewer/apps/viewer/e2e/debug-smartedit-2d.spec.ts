import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('debug 2D SmartEdit inference with detailed logging', async ({ page }) => {
  test.setTimeout(120000); // 2 minute timeout
  // Collect all console logs
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    consoleLogs.push('[' + msg.type() + '] ' + msg.text());
  });

  // Collect network requests
  const requests: { url: string; method: string; status?: number }[] = [];
  page.on('request', req => {
    requests.push({ url: req.url(), method: req.method() });
  });
  page.on('response', res => {
    const req = requests.find(r => r.url === res.url());
    if (req) req.status = res.status();
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

  // Take screenshot after loading
  await page.screenshot({ path: '/tmp/smartedit-2d-step1-loaded.png' });

  // Connect to server
  console.log('Connecting to server...');
  await page.getByRole('button', { name: /connect/i }).click();
  await page.waitForTimeout(3000);

  // Check connection status
  const connectionStatus = await page.locator('[data-testid="connection-status"]').textContent().catch(() => 'unknown');
  console.log('Connection status:', connectionStatus);

  // Take screenshot after connection
  await page.screenshot({ path: '/tmp/smartedit-2d-step2-connected.png' });

  // Click SmartEdit tab
  console.log('Switching to SmartEdit tab...');
  await page.getByTestId('tab-smart-edit').click();
  await page.waitForTimeout(500);

  // Take screenshot of SmartEdit tab
  await page.screenshot({ path: '/tmp/smartedit-2d-step3-smartedit-tab.png' });

  // Check what models are available in the dropdown
  const modelSelect = page.getByTestId('model-select-smartedit');
  const isModelSelectDisabled = await modelSelect.isDisabled();
  console.log('Model select disabled:', isModelSelectDisabled);

  // Get all options in the model select
  const modelOptions = await modelSelect.locator('option').allTextContents();
  console.log('Available models:', modelOptions);

  // Check if there's a 2D warning message
  const warningText = await page.locator('text=2D Image').textContent().catch(() => 'no warning');
  console.log('2D warning/info text:', warningText);

  // Select SAM3 model if available
  if (modelOptions.includes('SAM3')) {
    console.log('Selecting SAM3 model...');
    await modelSelect.selectOption({ label: 'SAM3' });
    await page.waitForTimeout(500);
  } else if (modelOptions.includes('nnInteractive')) {
    console.log('Selecting nnInteractive model...');
    await modelSelect.selectOption({ label: 'nnInteractive' });
    await page.waitForTimeout(500);
  } else {
    console.log('No SmartEdit models available!');
  }

  // Take screenshot after model selection
  await page.screenshot({ path: '/tmp/smartedit-2d-step4-model-selected.png' });

  // Check if point tool button exists and click it
  const pointToolBtn = page.getByTestId('smartedit-point-tool');
  const pointToolExists = await pointToolBtn.isVisible().catch(() => false);
  const pointToolDisabled = await pointToolBtn.isDisabled().catch(() => true);
  console.log('Point tool button visible:', pointToolExists, 'disabled:', pointToolDisabled);

  if (pointToolExists) {
    console.log('Clicking point tool...');
    await pointToolBtn.click();
    await page.waitForTimeout(2000);

    // Print console logs after clicking point tool to see if there are errors
    console.log('\n=== Console Logs After Point Tool Click ===');
    consoleLogs.slice(-30).forEach(log => console.log(log));
  }

  // Take screenshot
  await page.screenshot({ path: '/tmp/smartedit-2d-step5-point-tool.png' });

  // Try to click on the viewport to add a point
  console.log('Clicking on viewport to add point...');
  const viewport = page.locator('[data-viewport-uid]').first();
  const viewportExists = await viewport.isVisible().catch(() => false);
  console.log('Viewport visible:', viewportExists);

  if (viewportExists) {
    const box = await viewport.boundingBox();
    if (box) {
      // Click in the center of the viewport
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      console.log(`Clicking at viewport center: (${centerX}, ${centerY})`);
      await page.mouse.click(centerX, centerY);
      await page.waitForTimeout(1000);
    }
  }

  // Take screenshot after clicking
  await page.screenshot({ path: '/tmp/smartedit-2d-step6-point-added.png' });

  // Print logs after viewport click
  console.log('\n=== Console Logs After Viewport Click ===');
  consoleLogs.slice(-40).forEach(log => console.log(log));

  // Wait for inference to complete by watching console logs
  console.log('Waiting for inference to complete...');

  // Wait for either inference complete log or error (with timeout)
  let inferenceComplete = false;
  let inferenceError = false;
  const startTime = Date.now();
  const maxWaitTime = 90000; // 90 seconds for inference

  while (!inferenceComplete && !inferenceError && (Date.now() - startTime) < maxWaitTime) {
    // Check if inference completed successfully
    const has2DComplete = consoleLogs.some(log =>
      log.includes('2D SAM3 inference complete') ||
      log.includes('2D session initialized') && consoleLogs.some(l => l.includes('mask size'))
    );

    const hasInferenceResult = consoleLogs.some(log =>
      log.includes('Inference complete') ||
      log.includes('Inference finished') ||
      log.includes('isInferring changed: false') && consoleLogs.filter(l => l.includes('isInferring changed')).length > 1
    );

    const hasError = consoleLogs.some(log =>
      log.toLowerCase().includes('error') &&
      (log.includes('inference') || log.includes('fetch') || log.includes('network'))
    );

    if (has2DComplete || hasInferenceResult) {
      inferenceComplete = true;
      console.log('Inference completed successfully!');
    } else if (hasError) {
      inferenceError = true;
      console.log('Inference error detected');
    }

    if (!inferenceComplete && !inferenceError) {
      await page.waitForTimeout(2000); // Check every 2 seconds
    }
  }

  if (!inferenceComplete && !inferenceError) {
    console.log('Inference timed out after', maxWaitTime, 'ms');
  }

  // Small delay to let UI update
  await page.waitForTimeout(2000);

  // Take final screenshot
  await page.screenshot({ path: '/tmp/smartedit-2d-step7-final.png' });

  // Print relevant console logs
  console.log('\n=== Relevant Console Logs ===');
  consoleLogs.filter(log =>
    log.includes('MedAI') ||
    log.includes('Inference') ||
    log.includes('2D') ||
    log.includes('SAM') ||
    log.includes('SmartEdit') ||
    log.includes('PNG') ||
    log.includes('error') ||
    log.includes('Error') ||
    log.includes('nninter') ||
    log.includes('segmentation')
  ).forEach(log => console.log(log));

  // Print network requests to infer endpoint
  console.log('\n=== Network Requests to /infer ===');
  requests.filter(r => r.url.includes('/infer')).forEach(r => {
    console.log(`${r.method} ${r.url} -> ${r.status || 'pending'}`);
  });

  // Print all console logs for debugging
  console.log('\n=== ALL Console Logs ===');
  consoleLogs.forEach(log => console.log(log));
});
