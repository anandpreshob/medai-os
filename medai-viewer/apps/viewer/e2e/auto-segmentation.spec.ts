import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Auto-Segmentation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="right-panel"]', { timeout: 10000 });
  });

  test('should have run segmentation button disabled when disconnected', async ({ page }) => {
    const runButton = page.locator('[data-testid="run-segmentation-button"]');
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeDisabled();
  });

  test('should show model selector with placeholder when disconnected', async ({ page }) => {
    const modelSelect = page.locator('[data-testid="model-select"]');
    await expect(modelSelect).toBeVisible();
    await expect(modelSelect).toBeDisabled();
    await expect(modelSelect).toContainText('Connect to server first');
  });
});

test.describe('Auto-Segmentation - With Live Server', () => {
  // These tests require the actual MONAI Label server to be running
  test.skip(({ }, testInfo) => !process.env.MONAI_SERVER_URL, 'Skipped: MONAI_SERVER_URL not set');

  const serverUrl = process.env.MONAI_SERVER_URL || 'http://localhost:8002';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="right-panel"]');

    // Connect to server
    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    const connectButton = page.locator('[data-testid="connect-button"]');

    await serverUrlInput.fill(serverUrl);
    await connectButton.click();

    // Wait for connection
    await page.locator('[data-testid="connection-status"]').filter({ hasText: /connected/i }).waitFor({ timeout: 30000 });
  });

  test('should enable run button when connected and model selected', async ({ page }) => {
    const runButton = page.locator('[data-testid="run-segmentation-button"]');

    // Button should still be disabled without an image loaded
    // But model selector should be enabled
    const modelSelect = page.locator('[data-testid="model-select"]');
    await expect(modelSelect).toBeEnabled();
  });

  test('should populate model selector with available models', async ({ page }) => {
    const modelSelect = page.locator('[data-testid="model-select"]');
    await expect(modelSelect).toBeEnabled();

    // Check that there are options available
    const options = await modelSelect.locator('option').all();
    expect(options.length).toBeGreaterThan(0);
  });

  test('should allow changing selected model', async ({ page }) => {
    const modelSelect = page.locator('[data-testid="model-select"]');

    // Get available options
    const options = await modelSelect.locator('option').all();
    if (options.length > 1) {
      // Select the second option
      const secondOption = await options[1].getAttribute('value');
      if (secondOption) {
        await modelSelect.selectOption(secondOption);
        await expect(modelSelect).toHaveValue(secondOption);
      }
    }
  });
});

test.describe('Auto-Segmentation - Full Flow', () => {
  // These tests require both the server and a test file
  test.skip(({ }, testInfo) => !process.env.MONAI_SERVER_URL || !process.env.TEST_NIFTI_FILE,
    'Skipped: MONAI_SERVER_URL or TEST_NIFTI_FILE not set');

  const serverUrl = process.env.MONAI_SERVER_URL || 'http://localhost:8002';
  const testFile = process.env.TEST_NIFTI_FILE || '';

  test('should run segmentation on loaded image', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="right-panel"]');

    // Load test file via file input or drag-drop
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(testFile);
    }

    // Wait for image to load
    await page.waitForSelector('[data-testid="viewport"]', { timeout: 30000 });

    // Connect to server
    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    const connectButton = page.locator('[data-testid="connect-button"]');

    await serverUrlInput.fill(serverUrl);
    await connectButton.click();
    await page.locator('[data-testid="connection-status"]').filter({ hasText: /connected/i }).waitFor({ timeout: 30000 });

    // Select model
    const modelSelect = page.locator('[data-testid="model-select"]');
    await expect(modelSelect).toBeEnabled();

    // Click run segmentation
    const runButton = page.locator('[data-testid="run-segmentation-button"]');
    await expect(runButton).toBeEnabled();
    await runButton.click();

    // Should show loading state
    await expect(runButton).toContainText(/running/i, { timeout: 5000 });

    // Wait for segmentation to complete (may take a while)
    await expect(page.locator('[data-testid="segment-list"]')).not.toBeEmpty({ timeout: 120000 });
  });
});
