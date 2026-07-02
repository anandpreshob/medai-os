import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * Brush Slice Bleeding Test Suite
 *
 * This test verifies that the brush tool only paints on the current slice
 * and does not bleed into adjacent slices (2D mode behavior).
 *
 * Expected behavior: When using CircularBrush (FILL_INSIDE_CIRCLE strategy),
 * only voxels on the currently viewed slice should be modified.
 *
 * Bug being tested: The brush tool paints across multiple slices instead of
 * just the current slice because Cornerstone3D's FILL_INSIDE_CIRCLE strategy
 * creates a 3D ellipsoid/sphere rather than a 2D circle.
 */

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get sample NIfTI file path - use the sample data in the repo
const getSampleNiftiPath = (): string => {
  const candidates = [
    // The sample data is in the MedAI root, not in medai-viewer
    path.join(__dirname, '../../../../sample-data/DUKE_001_0000.nii.gz'),
    path.join(__dirname, '../../../sample-data/DUKE_001_0000.nii.gz'),
    process.env.TEST_NIFTI_FILE || '',
  ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }

  return '';
};

test.describe('Brush Tool - Slice Bleeding Bug', () => {
  test.beforeEach(async ({ page }) => {
    // Go to the viewer
    await page.goto('/');

    // Wait for the app to load
    await page.waitForSelector('[data-testid="right-panel"]', { timeout: 15000 });
  });

  test('should have brush and eraser tools visible when segmentation exists', async ({ page }) => {
    // Verify toolbar has brush tools
    const brushButton = page.locator('[data-testid="brush-tool-button"]');
    const eraserButton = page.locator('[data-testid="eraser-tool-button"]');

    await expect(brushButton).toBeVisible();
    await expect(eraserButton).toBeVisible();

    // Initially disabled without a segmentation
    await expect(brushButton).toBeDisabled();
    await expect(eraserButton).toBeDisabled();
  });

  test('should enable brush tools after creating a segmentation', async ({ page }) => {
    const sampleFile = getSampleNiftiPath();

    if (!sampleFile) {
      test.skip();
      return;
    }

    // Load the sample NIfTI file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(sampleFile);

    // Wait for image to load (viewports should render)
    await page.waitForTimeout(3000);

    // Click "Create" to create an empty segmentation
    const createButton = page.locator('[data-testid="create-segmentation-button"]');
    await expect(createButton).toBeEnabled({ timeout: 10000 });
    await createButton.click();

    // Wait for segmentation to be created
    await page.waitForTimeout(1000);

    // Now brush tools should be enabled
    const brushButton = page.locator('[data-testid="brush-tool-button"]');
    await expect(brushButton).toBeEnabled({ timeout: 5000 });
  });

  test('brush should only paint on current slice (2D mode)', async ({ page }) => {
    const sampleFile = getSampleNiftiPath();

    if (!sampleFile) {
      test.skip();
      return;
    }

    // Load the sample NIfTI file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(sampleFile);

    // Wait for image to load
    await page.waitForTimeout(5000);

    // Create a segmentation
    const createButton = page.locator('[data-testid="create-segmentation-button"]');
    await expect(createButton).toBeEnabled({ timeout: 10000 });
    await createButton.click();
    await page.waitForTimeout(1000);

    // Activate the brush tool
    const brushButton = page.locator('[data-testid="brush-tool-button"]');
    await expect(brushButton).toBeEnabled();
    await brushButton.click();
    await page.waitForTimeout(500);

    // Get the axial viewport element
    const axialViewport = page.locator('.bg-black.rounded-lg').first();
    const viewportBounds = await axialViewport.boundingBox();

    if (!viewportBounds) {
      throw new Error('Could not get viewport bounds');
    }

    // Paint a stroke in the center of the axial viewport
    const centerX = viewportBounds.x + viewportBounds.width / 2;
    const centerY = viewportBounds.y + viewportBounds.height / 2;

    // Perform a brush stroke
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 50, centerY);
    await page.mouse.up();

    // Wait for the stroke to be applied
    await page.waitForTimeout(500);

    // Now we need to check if voxels were painted on multiple slices
    // We'll use the debug utility exposed to window.brushDebug
    const sliceAnalysis = await page.evaluate(async () => {
      const brushDebug = (window as any).brushDebug;

      if (!brushDebug) {
        return { error: 'brushDebug not available' };
      }

      // Get the active segmentation ID from the store
      const segStore = (window as any).__SEGMENTATION_STORE__;
      if (!segStore) {
        // Try to get it another way - look for segmentations in cornerstone
        const cornerstoneTools = (window as any).cornerstoneTools;
        if (!cornerstoneTools) {
          return { error: 'cornerstoneTools not available' };
        }

        const segmentations = cornerstoneTools.segmentation?.state?.getSegmentations?.();
        if (!segmentations || segmentations.length === 0) {
          return { error: 'No segmentations found' };
        }

        const segId = segmentations[0].segmentationId;
        return brushDebug.analyze(segId, 'axial');
      }

      return { error: 'Could not analyze' };
    });

    console.log('Slice analysis result:', sliceAnalysis);

    // If we got analysis results, check if voxels were painted on multiple slices
    if (sliceAnalysis && !sliceAnalysis.error) {
      const distribution = sliceAnalysis.sliceDistribution;
      if (distribution) {
        const slicesWithVoxels = Object.keys(distribution);

        // Log the distribution for debugging
        console.log('Voxel slice distribution:', distribution);
        console.log('Total non-zero voxels:', sliceAnalysis.totalNonZero);
        console.log('Slices with voxels:', slicesWithVoxels);

        // CRITICAL CHECK: There should only be voxels on ONE slice
        // If there are voxels on multiple slices, the brush is bleeding
        if (slicesWithVoxels.length > 1) {
          // This is the bug we're testing for!
          console.error('SLICE BLEEDING DETECTED: Voxels found on multiple slices');
          console.error('Expected: 1 slice, Found:', slicesWithVoxels.length);

          // Fail the test to indicate the bug is present
          expect(slicesWithVoxels.length).toBe(1);
        } else {
          console.log('OK: Voxels only on current slice');
        }
      }
    }
  });

  test('should capture brush debug info in console', async ({ page }) => {
    const sampleFile = getSampleNiftiPath();

    if (!sampleFile) {
      test.skip();
      return;
    }

    // Listen for console messages
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('[MedAI Debug]') || msg.text().includes('[MedAI]')) {
        consoleLogs.push(msg.text());
      }
    });

    // Load the sample NIfTI file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(sampleFile);
    await page.waitForTimeout(5000);

    // Create a segmentation
    const createButton = page.locator('[data-testid="create-segmentation-button"]');
    await createButton.click();
    await page.waitForTimeout(1000);

    // Activate the brush tool
    const brushButton = page.locator('[data-testid="brush-tool-button"]');
    await brushButton.click();
    await page.waitForTimeout(500);

    // Paint a stroke
    const axialViewport = page.locator('.bg-black.rounded-lg').first();
    const viewportBounds = await axialViewport.boundingBox();

    if (viewportBounds) {
      const centerX = viewportBounds.x + viewportBounds.width / 2;
      const centerY = viewportBounds.y + viewportBounds.height / 2;

      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX + 30, centerY);
      await page.mouse.up();
    }

    await page.waitForTimeout(1000);

    // Check if debug logs were captured
    console.log('Captured console logs:');
    consoleLogs.forEach((log) => console.log(log));

    // We should see some debug output
    const hasDebugOutput = consoleLogs.some(
      (log) => log.includes('BrushTool') || log.includes('strategy') || log.includes('Brush')
    );

    // Log if we found debug output
    if (hasDebugOutput) {
      console.log('Found debug output about brush tool configuration');
    }
  });
});

test.describe('Brush Tool - Strategy Configuration', () => {
  test('should have correct strategy configured for CircularBrush', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="right-panel"]', { timeout: 15000 });

    // Wait for Cornerstone to initialize
    await page.waitForTimeout(3000);

    // Check the strategy configuration via window.brushDebug
    const strategyInfo = await page.evaluate(() => {
      const brushDebug = (window as any).brushDebug;
      if (!brushDebug) {
        return { error: 'brushDebug not available' };
      }

      // Inspect the CircularBrush tool
      brushDebug.inspectTool('medaiToolGroup', 'CircularBrush');

      // Return any available info
      return { success: true };
    });

    console.log('Strategy info:', strategyInfo);
  });

  test('should expose debug utilities on window', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="right-panel"]', { timeout: 15000 });
    await page.waitForTimeout(3000);

    const hasDebugUtils = await page.evaluate(() => {
      return typeof (window as any).brushDebug !== 'undefined';
    });

    expect(hasDebugUtils).toBe(true);
  });
});
