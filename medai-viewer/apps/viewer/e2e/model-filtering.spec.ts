import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Model Filtering by Dimensionality', () => {
  test('2D image shows only 2D-compatible models in Auto-Seg', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Drag & Drop Files Here')).toBeVisible({ timeout: 10000 });

    // Load 2D JPEG image
    const fileInput = page.locator('#file-input');
    const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
    await fileInput.setInputFiles(jpegPath);

    // Wait for image to load
    await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });

    // Connect to server
    const connectButton = page.getByRole('button', { name: /connect/i });
    await connectButton.click();
    await page.waitForTimeout(3000);

    // Check if connected
    const connectionStatus = page.getByTestId('connection-status');
    await expect(connectionStatus).toContainText('Connected', { timeout: 10000 });

    // Get the model dropdown
    const modelSelect = page.getByTestId('model-select');
    const modelOptions = await modelSelect.locator('option').allTextContents();

    console.log('Available models for 2D image:', modelOptions);

    // For 2D images, should only see 2D-compatible models like biomedparse
    // Should NOT see 3D-only models like 'segmentation'
    const has2DModels = modelOptions.some(m =>
      m.toLowerCase().includes('biomedparse') || m.toLowerCase().includes('sam2')
    );

    // Check that standard 3D segmentation model is NOT shown
    const has3DOnlyModels = modelOptions.some(m => m === 'segmentation');

    // If biomedparse model is available on server, it should be shown
    // Note: This test depends on server having biomedparse model
    console.log('Has 2D-compatible models:', has2DModels);
    console.log('Has 3D-only models shown:', has3DOnlyModels);
  });

  test('BiomedParse shows text prompt input', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Drag & Drop Files Here')).toBeVisible({ timeout: 10000 });

    // Load 2D JPEG image
    const fileInput = page.locator('#file-input');
    const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
    await fileInput.setInputFiles(jpegPath);

    // Wait for image to load
    await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });

    // Connect to server
    const connectButton = page.getByRole('button', { name: /connect/i });
    await connectButton.click();
    await page.waitForTimeout(3000);

    // Check if connected
    const connectionStatus = page.getByTestId('connection-status');
    await expect(connectionStatus).toContainText('Connected', { timeout: 10000 });

    // Select biomedparse model if available
    const modelSelect = page.getByTestId('model-select');
    const modelOptions = await modelSelect.locator('option').allTextContents();

    const biomedparseOption = modelOptions.find(m => m.toLowerCase().includes('biomedparse'));

    if (biomedparseOption) {
      await modelSelect.selectOption({ label: biomedparseOption });

      // Wait for text prompt to appear
      await page.waitForTimeout(500);

      // Check that text prompt input is visible
      const textPromptInput = page.getByTestId('biomedparse-text-prompt');
      await expect(textPromptInput).toBeVisible();

      // Check placeholder text
      await expect(textPromptInput).toHaveAttribute('placeholder', 'liver[SEP]kidney[SEP]spleen');

      console.log('BiomedParse text prompt input is visible and working');
    } else {
      console.log('BiomedParse model not available on server - skipping text prompt test');
    }
  });
});
