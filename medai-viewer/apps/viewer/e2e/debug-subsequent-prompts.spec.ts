import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Debug Subsequent Prompts', () => {
  const serverUrl = 'http://localhost:8002';
  const sampleDataPath = path.resolve(__dirname, '../../../../sample-data/DUKE_001_0000.nii.gz');

  test('should trace subsequent prompt flow for nnInteractive', async ({ page }) => {
    // Collect all console logs
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(`[${new Date().toISOString()}] ${msg.type()}: ${text}`);
      // Print important logs immediately
      if (text.includes('[SmartEdit') || text.includes('[DEBUG') || text.includes('[RightPanel') || text.includes('[InferenceService')) {
        console.log(`BROWSER: ${text}`);
      }
    });

    await page.goto('/');
    console.log('Page loaded, waiting for panel...');
    await page.waitForSelector('[data-testid="right-panel"]');

    // 1. Load image
    console.log('Loading sample image...');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(sampleDataPath);
    await page.waitForTimeout(8000);
    console.log('Image loaded');

    // 2. Connect to server
    console.log('Connecting to server...');
    const serverUrlInput = page.getByTestId('server-url-input');
    await serverUrlInput.clear();
    await serverUrlInput.fill(serverUrl);

    const connectButton = page.getByTestId('connect-button');
    await connectButton.click();
    await page.waitForTimeout(5000);
    console.log('Server connected');

    // 3. Switch to SmartEdit tab
    console.log('Switching to SmartEdit tab...');
    const smartEditTab = page.getByTestId('tab-smart-edit');
    await smartEditTab.click();
    await page.waitForTimeout(1000);

    // 4. Select nnInteractive
    console.log('Selecting nnInteractive model...');
    const modelSelect = page.getByTestId('model-select-smartedit');
    await modelSelect.selectOption({ label: 'nnInteractive' });
    await page.waitForTimeout(2000);
    console.log('Model selected');

    // 5. Activate Point tool
    console.log('Clicking Point button...');
    const pointButton = page.locator('button:has-text("Point")');
    await pointButton.click();
    await page.waitForTimeout(500);

    // 6. Click Include button
    console.log('Clicking Include button...');
    const includeButton = page.locator('button:has-text("Include")');
    await includeButton.click();
    await page.waitForTimeout(500);
    console.log('Include mode active');

    // 7. Wait for session pre-initialization to complete
    console.log('Waiting for session pre-initialization...');
    // Wait for the "AI ready" toast which appears when pre-init completes
    try {
      await page.waitForSelector('text=AI ready', { timeout: 120000 });
      console.log('Pre-initialization complete - AI ready!');
    } catch (e) {
      console.log('AI ready toast not found, checking if session initialized...');
      // Also check for the toast that might have appeared
      await page.waitForTimeout(60000); // Give it more time
    }
    await page.waitForTimeout(2000); // Small buffer after ready

    // Get viewport for clicking
    const viewport = page.locator('[data-viewport-uid]').first();
    const box = await viewport.boundingBox();

    if (!box) {
      console.log('ERROR: Could not find viewport');
      return;
    }

    // 8. First click - first prompt
    console.log('=== FIRST PROMPT ===');
    console.log('Clicking first point on viewport...');
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
    console.log('First point clicked, waiting for inference...');

    // Wait for first inference to complete
    await page.waitForTimeout(20000);
    console.log('First inference should be complete');

    // Take screenshot after first prompt
    await page.screenshot({ path: '/tmp/debug-after-first-prompt.png', fullPage: true });
    console.log('Screenshot saved: /tmp/debug-after-first-prompt.png');

    // 9. Second click - second prompt
    console.log('=== SECOND PROMPT ===');
    console.log('Clicking second point on viewport...');
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
    console.log('Second point clicked, waiting for inference...');

    // Wait for second inference
    await page.waitForTimeout(20000);
    console.log('Second inference should be complete');

    // Take screenshot after second prompt
    await page.screenshot({ path: '/tmp/debug-after-second-prompt.png', fullPage: true });
    console.log('Screenshot saved: /tmp/debug-after-second-prompt.png');

    // 10. Third click - third prompt
    console.log('=== THIRD PROMPT ===');
    console.log('Clicking third point on viewport...');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
    console.log('Third point clicked, waiting for inference...');

    // Wait for third inference
    await page.waitForTimeout(20000);
    console.log('Third inference should be complete');

    // Take final screenshot
    await page.screenshot({ path: '/tmp/debug-after-third-prompt.png', fullPage: true });
    console.log('Screenshot saved: /tmp/debug-after-third-prompt.png');

    // Print all logs
    console.log('\n=== ALL BROWSER LOGS ===');
    logs.filter(log =>
      log.includes('[SmartEdit') ||
      log.includes('[DEBUG') ||
      log.includes('[RightPanel') ||
      log.includes('[InferenceService')
    ).forEach(log => console.log(log));

    // Test passes if we get here
    expect(true).toBe(true);
  });
});
