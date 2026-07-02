import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Debug test for nnInteractive/SmartEdit init phase failures
 * This test provides comprehensive logging to identify where the pipeline breaks
 */
test.describe('nnInteractive Debug', () => {
  test.setTimeout(180000); // 3 minutes for debugging

  test('debug nnInteractive init phase with comprehensive logging', async ({ page }) => {
    const logs: { time: number; type: string; message: string }[] = [];
    const networkLogs: { time: number; type: string; url: string; method?: string; status?: number; body?: string }[] = [];
    const startTime = Date.now();

    const log = (type: string, message: string) => {
      const entry = { time: Date.now() - startTime, type, message };
      logs.push(entry);
      console.log(`[${entry.time}ms] [${type}] ${message}`);
    };

    // Capture ALL console logs from browser
    page.on('console', msg => {
      const text = msg.text();
      log('BROWSER', text);
    });

    // Capture page errors
    page.on('pageerror', error => {
      log('PAGE_ERROR', error.message);
    });

    // Capture network requests
    page.on('request', req => {
      const url = req.url();
      if (url.includes('/infer/') || url.includes('/session/') || url.includes('/info')) {
        const entry = {
          time: Date.now() - startTime,
          type: 'REQUEST',
          url,
          method: req.method(),
        };
        networkLogs.push(entry);
        log('NETWORK', `${req.method()} ${url}`);
      }
    });

    // Capture network responses
    page.on('response', async res => {
      const url = res.url();
      if (url.includes('/infer/') || url.includes('/session/') || url.includes('/info')) {
        let bodyPreview = '';
        try {
          const contentType = res.headers()['content-type'] || '';
          if (contentType.includes('json')) {
            const body = await res.text();
            bodyPreview = body.substring(0, 500);
          } else if (contentType.includes('multipart')) {
            bodyPreview = `[multipart response, ${res.headers()['content-length'] || 'unknown'} bytes]`;
          }
        } catch {
          bodyPreview = '[could not read body]';
        }

        const entry = {
          time: Date.now() - startTime,
          type: 'RESPONSE',
          url,
          status: res.status(),
          body: bodyPreview,
        };
        networkLogs.push(entry);
        log('NETWORK', `${res.status()} ${url} ${bodyPreview.substring(0, 100)}`);
      }
    });

    // Capture request failures
    page.on('requestfailed', req => {
      const url = req.url();
      if (url.includes('/infer/') || url.includes('/session/') || url.includes('/info')) {
        log('NETWORK_FAIL', `${req.method()} ${url} - ${req.failure()?.errorText}`);
      }
    });

    log('TEST', '=== Starting nnInteractive Debug Test ===');

    // Step 1: Navigate to viewer
    log('TEST', 'Step 1: Navigating to viewer...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/debug-01-initial.png' });
    log('TEST', 'Step 1: Navigation complete');

    // Step 2: Wait for right panel
    log('TEST', 'Step 2: Waiting for right panel...');
    await expect(page.locator('[data-testid="right-panel"]')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'test-results/debug-02-right-panel.png' });
    log('TEST', 'Step 2: Right panel visible');

    // Step 3: Load test image
    log('TEST', 'Step 3: Loading test image...');
    const sampleImagePath = path.resolve(__dirname, '../../../../sample-data/DUKE_001_0000.nii.gz');

    if (!fs.existsSync(sampleImagePath)) {
      log('ERROR', `Test image not found: ${sampleImagePath}`);
      throw new Error(`Test image not found: ${sampleImagePath}`);
    }

    const fileInput = page.locator('input[type="file"][accept*=".nii"]').first();
    await fileInput.setInputFiles(sampleImagePath);
    log('TEST', 'Step 3: File input set, waiting for load...');

    // Wait for image to load - check for viewport content
    await page.waitForTimeout(8000);
    await page.screenshot({ path: 'test-results/debug-03-image-loaded.png' });
    log('TEST', 'Step 3: Image load wait complete');

    // Step 4: Connect to server
    log('TEST', 'Step 4: Connecting to MONAI Label server...');
    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    const serverUrl = 'http://localhost:8002';
    await serverUrlInput.fill(serverUrl);
    log('TEST', `Step 4: Server URL set to ${serverUrl}`);

    const connectButton = page.locator('[data-testid="connect-button"]');
    await connectButton.click();
    log('TEST', 'Step 4: Connect button clicked, waiting for connection...');

    // Wait for connection with extended timeout
    try {
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 20000 });
      log('TEST', 'Step 4: Connected successfully');
    } catch (e) {
      const statusText = await page.locator('[data-testid="connection-status"]').textContent();
      log('ERROR', `Step 4: Connection failed. Status: ${statusText}`);
      await page.screenshot({ path: 'test-results/debug-04-connection-failed.png' });
      throw e;
    }
    await page.screenshot({ path: 'test-results/debug-04-connected.png' });

    // Step 5: Switch to SmartEdit tab
    log('TEST', 'Step 5: Switching to SmartEdit tab...');
    const smartEditTab = page.locator('[data-testid="tab-smart-edit"]');
    await smartEditTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/debug-05-smartedit-tab.png' });
    log('TEST', 'Step 5: SmartEdit tab active');

    // Step 6: Select nnInteractive model
    log('TEST', 'Step 6: Selecting nnInteractive model...');
    const modelSelect = page.locator('[data-testid="model-select-smartedit"]');

    // Log available options
    const options = await modelSelect.locator('option').allTextContents();
    log('TEST', `Step 6: Available models: ${options.join(', ')}`);

    // Check if nnInteractive is available
    const hasNnInteractive = options.some(opt => opt.toLowerCase().includes('nninteractive'));
    if (!hasNnInteractive) {
      log('ERROR', 'Step 6: nnInteractive model not available in dropdown');
      await page.screenshot({ path: 'test-results/debug-06-no-nninteractive.png' });
      throw new Error('nnInteractive model not available');
    }

    await modelSelect.selectOption({ label: 'nnInteractive' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/debug-06-model-selected.png' });
    log('TEST', 'Step 6: nnInteractive model selected');

    // Step 7: Activate Point tool
    log('TEST', 'Step 7: Activating Point tool...');
    const pointButton = page.locator('button:has-text("Point")');
    await pointButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/debug-07-point-tool.png' });
    log('TEST', 'Step 7: Point tool activated');

    // Step 8: Click on viewport - THE CRITICAL MOMENT
    log('TEST', 'Step 8: Clicking on viewport to add point...');
    const viewport = page.locator('[data-viewport-uid="axial"]').first();

    if (!await viewport.isVisible()) {
      log('ERROR', 'Step 8: Axial viewport not visible');
      await page.screenshot({ path: 'test-results/debug-08-no-viewport.png' });
      throw new Error('Axial viewport not visible');
    }

    const box = await viewport.boundingBox();
    if (!box) {
      log('ERROR', 'Step 8: Could not get viewport bounding box');
      throw new Error('Could not get viewport bounding box');
    }

    log('TEST', `Step 8: Viewport bounds: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`);

    const clickX = box.x + box.width / 2;
    const clickY = box.y + box.height / 2;
    log('TEST', `Step 8: Clicking at (${clickX}, ${clickY})...`);

    const clickTime = Date.now();
    await page.mouse.click(clickX, clickY);
    log('TEST', `Step 8: Click sent at ${clickTime - startTime}ms`);

    await page.screenshot({ path: 'test-results/debug-08-after-click.png' });

    // Step 9: Monitor for inference completion or error
    log('TEST', 'Step 9: Monitoring for inference result...');

    let inferenceComplete = false;
    let errorDetected = false;
    let lastStatus = '';

    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);

      // Check for error toast
      const errorToast = await page.locator('.toast-error, [class*="error"]').count();
      if (errorToast > 0) {
        const errorText = await page.locator('.toast-error, [class*="error"]').first().textContent();
        log('ERROR', `Step 9: Error detected at ${i}s: ${errorText}`);
        errorDetected = true;
        break;
      }

      // Check session status indicator
      const sessionStatus = await page.locator('[data-testid="session-status"], text=/Session|Processing|Ready/i').first().textContent().catch(() => '');
      if (sessionStatus && sessionStatus !== lastStatus) {
        log('TEST', `Step 9: Session status changed: ${sessionStatus}`);
        lastStatus = sessionStatus;
      }

      // Check if processing indicator is gone (inference complete)
      const processingIndicator = await page.locator('text=/Processing|Inferring|Loading/i').count();
      if (processingIndicator === 0 && i > 5) {
        // Check if we have a segmentation result
        const hasSegmentation = await page.evaluate(() => {
          // Check if cornerstone has segmentation data
          return !!(window as any).__cornerstoneSegmentation;
        }).catch(() => false);

        if (hasSegmentation) {
          log('TEST', `Step 9: Inference complete at ${i}s`);
          inferenceComplete = true;
          break;
        }
      }

      // Screenshot every 10 seconds
      if (i % 10 === 0) {
        await page.screenshot({ path: `test-results/debug-09-waiting-${i}s.png` });
        log('TEST', `Step 9: Still waiting... ${i}s elapsed`);
      }
    }

    // Final screenshot
    await page.screenshot({ path: 'test-results/debug-10-final.png', fullPage: true });

    // Write detailed logs to file
    const logContent = {
      summary: {
        inferenceComplete,
        errorDetected,
        totalTime: Date.now() - startTime,
      },
      consoleLogs: logs,
      networkLogs: networkLogs,
    };

    fs.writeFileSync(
      'test-results/debug-nninteractive-logs.json',
      JSON.stringify(logContent, null, 2)
    );

    log('TEST', '=== Test Complete ===');
    log('TEST', `Inference complete: ${inferenceComplete}`);
    log('TEST', `Error detected: ${errorDetected}`);
    log('TEST', `Total time: ${Date.now() - startTime}ms`);

    // Print summary of network requests
    console.log('\n=== Network Summary ===');
    networkLogs.forEach(entry => {
      console.log(`[${entry.time}ms] ${entry.type} ${entry.method || ''} ${entry.url} ${entry.status || ''}`);
    });

    // Assertions
    if (errorDetected) {
      throw new Error('Inference error detected - check logs');
    }
  });

  test('test server connection only', async ({ page }) => {
    const startTime = Date.now();

    page.on('console', msg => {
      console.log(`[BROWSER] ${msg.text()}`);
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Test direct server connection
    const serverUrl = 'http://localhost:8002';

    console.log(`Testing connection to ${serverUrl}/info...`);

    const response = await page.evaluate(async (url) => {
      try {
        const res = await fetch(`${url}/info`);
        const data = await res.json();
        return { status: res.status, data };
      } catch (e) {
        return { error: (e as Error).message };
      }
    }, serverUrl);

    console.log('Server response:', JSON.stringify(response, null, 2));

    if ('error' in response) {
      console.error(`Connection failed: ${response.error}`);
    } else {
      console.log(`Connection successful. Models: ${Object.keys(response.data.models || {}).join(', ')}`);
    }
  });

  test('test session creation only', async ({ page }) => {
    page.on('console', msg => {
      console.log(`[BROWSER] ${msg.text()}`);
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    const serverUrl = 'http://localhost:8002';

    // Create a minimal test image (1x1x1 NIfTI)
    const result = await page.evaluate(async (url) => {
      // Create minimal NIfTI-1 header (348 bytes) + 1 voxel
      const buffer = new ArrayBuffer(352);
      const view = new DataView(buffer);

      // sizeof_hdr
      view.setInt32(0, 348, true);
      // dim
      view.setInt16(40, 3, true); // ndim
      view.setInt16(42, 1, true); // dim1
      view.setInt16(44, 1, true); // dim2
      view.setInt16(46, 1, true); // dim3
      // datatype (float32)
      view.setInt16(70, 16, true);
      // bitpix
      view.setInt16(72, 32, true);
      // pixdim
      view.setFloat32(76, 1.0, true);
      view.setFloat32(80, 1.0, true);
      view.setFloat32(84, 1.0, true);
      view.setFloat32(88, 1.0, true);
      // vox_offset
      view.setFloat32(108, 348, true);
      // magic
      view.setUint8(344, 110); // 'n'
      view.setUint8(345, 43);  // '+'
      view.setUint8(346, 49);  // '1'
      view.setUint8(347, 0);

      try {
        const formData = new FormData();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        formData.append('files', blob, 'test.nii.gz');
        formData.append('expiry', '3600');

        console.log('Sending session creation request...');
        const res = await fetch(`${url}/session/`, {
          method: 'PUT',
          body: formData,
        });

        const text = await res.text();
        console.log(`Response status: ${res.status}`);
        console.log(`Response body: ${text}`);

        return { status: res.status, body: text };
      } catch (e) {
        return { error: (e as Error).message };
      }
    }, serverUrl);

    console.log('Session creation result:', result);
  });
});
