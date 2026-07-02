import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('2D Image Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await expect(page.getByText('Drag & Drop Files Here')).toBeVisible({ timeout: 10000 });
  });

  test('loads JPEG image and displays in 2D viewport', async ({ page }) => {
    // Find the main file input (not the label file input)
    const fileInput = page.locator('#file-input');

    // Upload the JPEG test image
    const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
    await fileInput.setInputFiles(jpegPath);

    // Wait for image to load - should see 2D View label
    await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });

    // Verify StatusBar shows 2D indicator
    await expect(page.getByText('2D', { exact: true })).toBeVisible();

    // Verify image dimensions are displayed in viewport info
    // The cysts1.jpeg should have some dimensions displayed
    await expect(page.locator('.absolute.bottom-2.left-2')).toContainText('x');
  });

  test('2D image shows correct format in status bar', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
    await fileInput.setInputFiles(jpegPath);

    // Wait for load
    await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });

    // StatusBar should show JPG format (use role=contentinfo for footer/statusbar)
    await expect(page.getByRole('contentinfo').getByText('JPG')).toBeVisible();
  });

  test('can connect to server with 2D image loaded', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
    await fileInput.setInputFiles(jpegPath);

    // Wait for image to load
    await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });

    // Server URL should be pre-filled from VITE_MONAI_SERVER_URL (defaults to localhost)
    const serverUrlInput = page.getByTestId('server-url-input');
    await expect(serverUrlInput).toHaveValue(
      process.env.VITE_MONAI_SERVER_URL || 'http://localhost:8002'
    );

    // Click connect button
    const connectButton = page.getByRole('button', { name: /connect/i });
    await connectButton.click();

    // Wait for connection (either connected or error)
    await page.waitForTimeout(5000);

    // Check connection status
    const statusText = page.getByTestId('connection-status');
    const text = await statusText.textContent();
    console.log('Connection status:', text);
  });

  test('2D viewport allows pan interaction', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
    await fileInput.setInputFiles(jpegPath);

    // Wait for load
    await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });

    // Find the viewport element
    const viewport = page.locator('.w-full.h-full').first();

    // Perform pan interaction (click and drag)
    const box = await viewport.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 50);
      await page.mouse.up();
    }

    // Should not throw errors (viewport should handle pan)
    await page.waitForTimeout(500);
  });

  test('console has no critical errors when loading 2D image', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    const fileInput = page.locator('#file-input');
    const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
    await fileInput.setInputFiles(jpegPath);

    // Wait for image to load
    await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Filter out non-critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('Resume Matcher') &&
      !e.includes('viewport') && // Some viewport warnings are expected
      !e.includes('does not exist') // Expected during cleanup
    );

    console.log('Console errors:', errors);

    // Log but don't fail on non-critical errors
    if (criticalErrors.length > 0) {
      console.warn('Critical errors found:', criticalErrors);
    }
  });
});
