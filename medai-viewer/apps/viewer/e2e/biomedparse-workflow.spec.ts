import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('BiomedParse 2D Inference Workflow', () => {
  test('complete workflow: load 2D image, connect, select biomedparse, enter prompt, run inference', async ({ page }) => {
    // Capture all console logs
    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Step 1: Navigate to app
    console.log('Step 1: Navigate to app');
    await page.goto('/');
    await expect(page.getByText('Drag & Drop Files Here')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: '/tmp/biomedparse-step1-app-loaded.png' });

    // Step 2: Load 2D JPEG image
    console.log('Step 2: Load 2D JPEG image');
    const fileInput = page.locator('#file-input');
    const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
    await fileInput.setInputFiles(jpegPath);

    // Wait for 2D View label to appear
    await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: '/tmp/biomedparse-step2-image-loaded.png' });
    console.log('Image loaded successfully');

    // Step 3: Connect to server
    console.log('Step 3: Connect to server');
    const serverUrlInput = page.getByTestId('server-url-input');
    const serverUrl = await serverUrlInput.inputValue();
    console.log('Server URL:', serverUrl);

    const connectButton = page.getByRole('button', { name: /connect/i });
    await connectButton.click();

    // Wait for connection with timeout
    await page.waitForTimeout(5000);
    const connectionStatus = page.getByTestId('connection-status');
    const statusText = await connectionStatus.textContent();
    console.log('Connection status:', statusText);
    await page.screenshot({ path: '/tmp/biomedparse-step3-connected.png' });

    if (!statusText?.includes('Connected')) {
      console.error('Failed to connect to server');
      console.log('Console errors:', consoleErrors);
      throw new Error(`Server connection failed. Status: ${statusText}`);
    }

    // Step 4: Check available models
    console.log('Step 4: Check available models');
    const modelSelect = page.getByTestId('model-select');
    await expect(modelSelect).toBeVisible();
    const modelOptions = await modelSelect.locator('option').allTextContents();
    console.log('Available models:', modelOptions);

    // Check if biomedparse is available
    const hasBiomedparse = modelOptions.some(m => m.toLowerCase().includes('biomedparse'));
    if (!hasBiomedparse) {
      console.log('BiomedParse model not available on server - test cannot continue');
      console.log('Available models:', modelOptions);
      // Skip rest of test if biomedparse not available
      return;
    }

    // Step 5: Select biomedparse model
    console.log('Step 5: Select biomedparse model');
    const biomedparseOption = modelOptions.find(m => m.toLowerCase().includes('biomedparse'));
    await modelSelect.selectOption({ label: biomedparseOption });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/biomedparse-step5-model-selected.png' });

    // Step 6: Verify text prompt input is visible
    console.log('Step 6: Verify text prompt input');
    const textPromptInput = page.getByTestId('biomedparse-text-prompt');
    await expect(textPromptInput).toBeVisible({ timeout: 5000 });
    console.log('Text prompt input is visible');

    // Step 7: Enter text prompt
    console.log('Step 7: Enter text prompt');
    await textPromptInput.fill('liver');
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/biomedparse-step7-prompt-entered.png' });

    // Step 8: Click Run Segmentation
    console.log('Step 8: Click Run Segmentation');
    const runButton = page.getByTestId('run-segmentation-button');
    await expect(runButton).toBeEnabled();
    await runButton.click();

    // Step 9: Wait for inference to complete or fail
    console.log('Step 9: Wait for inference');

    // Wait for either success (segmentation appears) or error
    const startTime = Date.now();
    const timeout = 60000; // 60 second timeout for inference
    let inferenceComplete = false;
    let inferenceError = null;

    while (Date.now() - startTime < timeout && !inferenceComplete) {
      await page.waitForTimeout(1000);

      // Check for error message
      const errorElement = page.locator('text=Error');
      const hasError = await errorElement.count() > 0;

      // Check for inference error in console
      const recentErrors = consoleErrors.filter(e =>
        e.includes('Inference failed') ||
        e.includes('failed to fetch') ||
        e.includes('TypeError')
      );

      if (recentErrors.length > 0) {
        inferenceError = recentErrors.join('; ');
        break;
      }

      // Check if button is no longer showing "Running..."
      const buttonText = await runButton.textContent();
      if (buttonText && !buttonText.includes('Running')) {
        inferenceComplete = true;
      }

      // Check for segmentation in the list
      const segmentationList = page.locator('[data-testid="segmentation-list"]');
      const hasSegmentation = await segmentationList.count() > 0;
      if (hasSegmentation) {
        inferenceComplete = true;
      }
    }

    await page.screenshot({ path: '/tmp/biomedparse-step9-inference-result.png' });

    // Log all console output for debugging
    console.log('\n=== Console Logs ===');
    consoleLogs.filter(log =>
      log.includes('inference') ||
      log.includes('Inference') ||
      log.includes('biomedparse') ||
      log.includes('BiomedParse') ||
      log.includes('error') ||
      log.includes('Error') ||
      log.includes('fetch')
    ).forEach(log => console.log(log));
    console.log('===================\n');

    if (inferenceError) {
      console.error('Inference failed with error:', inferenceError);
      console.log('\nAll console errors:');
      consoleErrors.forEach(e => console.log(e));
      throw new Error(`Inference failed: ${inferenceError}`);
    }

    if (!inferenceComplete) {
      console.error('Inference timed out');
      throw new Error('Inference timed out after 60 seconds');
    }

    console.log('Inference completed successfully');
  });
});
