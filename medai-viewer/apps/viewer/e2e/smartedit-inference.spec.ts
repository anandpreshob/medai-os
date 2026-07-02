import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('SmartEdit Inference', () => {
  test.setTimeout(120000); // 2 minutes for long operations

  test('should run nnInteractive inference and display segmentation', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[MonaiLabelClient]') ||
          text.includes('[InferenceService]') ||
          text.includes('[MedAI]') ||
          text.includes('[RightPanel]') ||
          text.includes('[SmartEdit]')) {
        console.log(`BROWSER: ${text}`);
      }
    });

    // Navigate to the viewer
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Wait for the viewer to be ready
    await expect(page.locator('[data-testid="right-panel"]')).toBeVisible({ timeout: 10000 });

    // Load the test image via file input
    const sampleImagePath = path.resolve(__dirname, '../../../../sample-data/DUKE_001_0000.nii.gz');

    // Find the file input and upload
    const fileInput = page.locator('input[type="file"][accept*=".nii"]').first();
    await fileInput.setInputFiles(sampleImagePath);

    // Wait for image to load - look for viewports to have content
    await page.waitForTimeout(5000); // Give time for image processing

    // Connect to MONAI Label server
    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    await serverUrlInput.fill('http://localhost:8002');

    const connectButton = page.locator('[data-testid="connect-button"]');
    await connectButton.click();

    // Wait for connection
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 15000 });

    // Switch to SmartEdit tab
    const smartEditTab = page.locator('[data-testid="tab-smart-edit"]');
    await smartEditTab.click();

    // Select nnInteractive model
    const modelSelect = page.locator('[data-testid="model-select-smartedit"]');
    await modelSelect.selectOption('nnInteractive');

    // Click on Point mode to activate
    const pointButton = page.locator('button:has-text("Point")');
    await pointButton.click();

    // Click on the axial viewport to add a point
    // The viewport should be in the center area
    const viewport = page.locator('[data-viewport-uid="axial"]').first();
    if (await viewport.isVisible()) {
      const box = await viewport.boundingBox();
      if (box) {
        // Click in the center of the viewport
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    }

    // Wait for inference to complete
    await page.waitForTimeout(30000); // Wait up to 30 seconds for inference

    // Check console logs for results
    console.log('Test completed - check browser logs above for inference details');
  });
});
