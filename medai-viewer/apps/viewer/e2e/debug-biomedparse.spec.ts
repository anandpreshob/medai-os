import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('debug BiomedParse 2D inference with detailed logging', async ({ page }) => {
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    consoleLogs.push('[' + msg.type() + '] ' + msg.text());
  });

  await page.goto('/');
  await expect(page.getByText('Drag & Drop Files Here')).toBeVisible({ timeout: 10000 });

  // Load 2D image
  const fileInput = page.locator('#file-input');
  const jpegPath = path.resolve(__dirname, '../../../../sample-data/cysts1.jpeg');
  await fileInput.setInputFiles(jpegPath);
  await expect(page.getByText('2D View')).toBeVisible({ timeout: 15000 });

  // Connect
  await page.getByRole('button', { name: /connect/i }).click();
  await page.waitForTimeout(3000);

  // Select biomedparse
  const modelSelect = page.getByTestId('model-select');
  await modelSelect.selectOption({ label: 'biomedparse' });
  await page.waitForTimeout(500);

  // Enter prompt and run
  await page.getByTestId('biomedparse-text-prompt').fill('liver');
  await page.getByTestId('run-segmentation-button').click();

  // Wait for inference
  await page.waitForTimeout(15000);

  // Print relevant logs
  console.log('\n=== All Console Logs ===');
  consoleLogs.filter(log =>
    log.includes('MedAI') ||
    log.includes('Inference') ||
    log.includes('segmentation') ||
    log.includes('Segmentation') ||
    log.includes('PNG') ||
    log.includes('mask') ||
    log.includes('Mask') ||
    log.includes('error') ||
    log.includes('Error') ||
    log.includes('label') ||
    log.includes('Label') ||
    log.includes('createSegmentation')
  ).forEach(log => console.log(log));

  // Take screenshot
  await page.screenshot({ path: '/tmp/biomedparse-debug.png' });
});
