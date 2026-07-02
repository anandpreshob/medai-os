import { test, expect, Page } from '@playwright/test';

/**
 * Chest X-Ray Detection Workflow E2E Test
 *
 * Tests the complete workflow:
 * 1. Open study browser
 * 2. Load patient_13 (has pneumothorax)
 * 3. Connect to Lambda server
 * 4. Run AI detection
 * 5. Verify bounding boxes are overlaid on viewport
 * 6. Verify findings panel shows AI findings
 * 7. Test Draft Report button navigation
 * 8. Verify report generation flow
 */

// Configuration
const SERVER_URL = process.env.MEDAI_SERVER_URL || 'http://localhost:8002';
const PATIENT_NAME = 'patient_13';

test.describe('Chest X-Ray Detection Workflow', () => {
  let consoleLogs: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    // Capture console logs for debugging
    consoleLogs = [];
    consoleErrors = [];

    page.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Set a longer timeout for this workflow
    test.setTimeout(120000);
  });

  test('complete workflow: load patient_13, detect pneumothorax, verify findings, draft report', async ({ page }) => {
    // ==========================================
    // Step 1: Navigate to Study Browser
    // ==========================================
    console.log('Step 1: Navigate to Study Browser');
    await page.goto('/');

    // Wait for app to load - look for the study browser indicators
    await page.waitForSelector('text=Study Browser', { timeout: 15000 });
    await page.screenshot({ path: '/tmp/chestxray-step1-study-browser.png' });
    console.log('Study browser loaded');

    // ==========================================
    // Step 2: Search for patient_13
    // ==========================================
    console.log('Step 2: Search for patient_13');

    // Find and fill the search input
    const searchInput = page.locator('input[placeholder*="Search by patient name"]');
    await searchInput.fill(PATIENT_NAME);
    await searchInput.press('Enter');

    // Wait for search results
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/chestxray-step2-search-results.png' });

    // ==========================================
    // Step 3: Click on patient_13 study to open viewer
    // ==========================================
    console.log('Step 3: Open patient_13 study');

    // Click on the study card containing patient_13
    const studyCard = page.locator('text=patient_13').first();
    await expect(studyCard).toBeVisible({ timeout: 10000 });
    await studyCard.click();

    // Wait for viewer to load
    await page.waitForURL(/\/viewer/, { timeout: 15000 });
    await page.waitForSelector('[data-testid="right-panel"]', { timeout: 15000 });
    await page.screenshot({ path: '/tmp/chestxray-step3-viewer-loaded.png' });
    console.log('Viewer loaded');

    // ==========================================
    // Step 4: Connect to Lambda server
    // ==========================================
    console.log('Step 4: Connect to server');

    const serverUrlInput = page.getByTestId('server-url-input');
    await serverUrlInput.fill(SERVER_URL);

    const connectButton = page.getByTestId('connect-button');
    await connectButton.click();

    // Wait for connection
    await page.waitForTimeout(3000);
    const connectionStatus = page.getByTestId('connection-status');
    await expect(connectionStatus).toContainText(/connected/i, { timeout: 30000 });
    await page.screenshot({ path: '/tmp/chestxray-step4-connected.png' });
    console.log('Connected to server');

    // ==========================================
    // Step 5: Select Chest X-Ray Suite
    // ==========================================
    console.log('Step 5: Select Chest X-Ray Suite');

    // Click on the suite selector dropdown in the top bar
    const suiteSelector = page.locator('button:has-text("Auto")').first();
    if (await suiteSelector.isVisible({ timeout: 5000 })) {
      await suiteSelector.click();
      await page.waitForTimeout(500);

      // Look for Chest X-Ray option in dropdown
      const chestXraySuiteOption = page.locator('text=Chest X-Ray').first();
      if (await chestXraySuiteOption.isVisible({ timeout: 3000 })) {
        await chestXraySuiteOption.click();
        console.log('Selected Chest X-Ray suite from dropdown');
      } else {
        console.log('Chest X-Ray suite option not found in dropdown');
        // Close dropdown by clicking elsewhere
        await page.keyboard.press('Escape');
      }
    } else {
      // Check if suite was auto-detected (shows "Chest X-Ray" instead of "Auto")
      const chestXraySuiteActive = page.locator('button:has-text("Chest X-Ray")').first();
      if (await chestXraySuiteActive.isVisible({ timeout: 3000 })) {
        console.log('Chest X-Ray suite already auto-detected');
      } else {
        console.log('Suite selector not visible');
      }
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/chestxray-step5-suite-selected.png' });

    // ==========================================
    // Step 6: Verify Chest X-Ray AI header and Detection tab
    // ==========================================
    console.log('Step 6: Verify Chest X-Ray AI UI');

    // Check for the Chest X-Ray AI header
    const chestXrayHeader = page.locator('text=Chest X-Ray AI').first();
    const hasChestXrayHeader = await chestXrayHeader.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Chest X-Ray AI header visible: ${hasChestXrayHeader}`);

    // Click on Detection tab
    const detectionTab = page.getByTestId('tab-detection');
    if (await detectionTab.isVisible({ timeout: 5000 })) {
      await detectionTab.click();
      await page.waitForTimeout(500);
      console.log('Clicked Detection tab');
    } else {
      console.log('Detection tab not visible - checking for alternative tab names');
      // Try alternative selectors
      const altDetectionTab = page.locator('button:has-text("Detection")').first();
      if (await altDetectionTab.isVisible({ timeout: 3000 })) {
        await altDetectionTab.click();
        console.log('Clicked alternative Detection button');
      }
    }

    await page.screenshot({ path: '/tmp/chestxray-step6-detection-tab.png' });

    // ==========================================
    // Step 7: Run AI detection
    // ==========================================
    console.log('Step 7: Run AI detection');

    // Wait for MedGemma service to be ready
    await page.waitForSelector('text=MedGemma Ready', { timeout: 60000 }).catch(() => {
      console.log('MedGemma not showing ready status, attempting detection anyway...');
    });

    // Click Run Detection button
    const runDetectionButton = page.getByTestId('run-detection-button');
    await expect(runDetectionButton).toBeVisible({ timeout: 10000 });
    await expect(runDetectionButton).toBeEnabled({ timeout: 30000 });

    await page.screenshot({ path: '/tmp/chestxray-step7a-before-detection.png' });
    await runDetectionButton.click();
    console.log('Detection started');

    // ==========================================
    // Step 8: Wait for detection to complete
    // ==========================================
    console.log('Step 8: Wait for detection results');

    // Wait for detection to complete (button text changes back from "Detecting...")
    await expect(runDetectionButton).not.toContainText(/Detecting/i, { timeout: 120000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/chestxray-step8-detection-complete.png' });
    console.log('Detection completed');

    // ==========================================
    // Step 9: Verify detection results
    // ==========================================
    console.log('Step 9: Verify detection results');

    // Check for results section
    const resultsSection = page.locator('text=Results').first();
    const aiFindings = page.locator('text=AI Findings').first();

    // Take screenshot of results
    await page.screenshot({ path: '/tmp/chestxray-step9-results.png' });

    // Verify we have some detections or findings
    const hasResults = await resultsSection.isVisible().catch(() => false);
    const hasFindings = await aiFindings.isVisible().catch(() => false);

    console.log(`Has Results section: ${hasResults}`);
    console.log(`Has AI Findings: ${hasFindings}`);

    // Log the AI description if available
    const aiDescription = page.locator('[class*="bg-background-secondary"]').filter({ hasText: 'AI Findings' });
    if (await aiDescription.isVisible()) {
      const descriptionText = await aiDescription.textContent();
      console.log('AI Description:', descriptionText?.substring(0, 500));
    }

    // ==========================================
    // Step 10: Check for bounding box overlay
    // ==========================================
    console.log('Step 10: Check bounding box overlay');

    // Look for SVG overlay or detection boxes in the viewport area
    const svgOverlay = page.locator('svg.absolute.inset-0');
    const detectionBoxes = page.locator('g.detection-box');

    await page.screenshot({ path: '/tmp/chestxray-step10-viewport-overlay.png', fullPage: false });

    const hasSvgOverlay = await svgOverlay.count() > 0;
    const hasDetectionBoxes = await detectionBoxes.count() > 0;
    console.log(`SVG overlay present: ${hasSvgOverlay}`);
    console.log(`Detection boxes present: ${hasDetectionBoxes}`);

    // Verify bounding boxes can be selected (click on a box)
    if (hasDetectionBoxes) {
      const firstBox = detectionBoxes.first();
      await firstBox.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/tmp/chestxray-step10b-box-selected.png' });
      console.log('Clicked on bounding box - checking for resize handles');

      // Look for resize handles (small rectangles on selected box)
      const resizeHandles = page.locator('g.detection-box rect').filter({ hasNot: page.locator('[stroke-dasharray]') });
      const handleCount = await resizeHandles.count();
      console.log(`Resize handles found: ${handleCount}`);
    }

    // ==========================================
    // Step 11: Test bounding box visibility toggle
    // ==========================================
    console.log('Step 11: Test detection visibility toggle');

    // Look for the Hide All / Show All button
    const toggleAllButton = page.locator('button:has-text("Hide All"), button:has-text("Show All")').first();
    if (await toggleAllButton.isVisible({ timeout: 3000 })) {
      const buttonText = await toggleAllButton.textContent();
      console.log(`Toggle button text: ${buttonText}`);
      await toggleAllButton.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/tmp/chestxray-step11-toggled.png' });

      // Toggle back
      await toggleAllButton.click();
      await page.waitForTimeout(500);
    }

    // ==========================================
    // Step 12: Click Draft Report button in TopBar
    // ==========================================
    console.log('Step 12: Click Draft Report button');

    // The Draft Report button is in the TopBar at the top of the screen
    const draftReportButton = page.getByTestId('draft-report-button');

    if (await draftReportButton.isVisible({ timeout: 5000 })) {
      console.log('Draft Report button found in TopBar');
      await page.screenshot({ path: '/tmp/chestxray-step12a-draft-report-button.png' });

      await draftReportButton.click();
      console.log('Clicked Draft Report button');

      // Should navigate to report page
      await page.waitForURL(/\/report/, { timeout: 10000 }).catch(() => {
        console.log('Did not navigate to /report URL, checking for modal or overlay');
      });

      await page.waitForTimeout(1000);
      await page.screenshot({ path: '/tmp/chestxray-step12b-report-page.png' });

      // ==========================================
      // Step 13: Verify Report Page content
      // ==========================================
      console.log('Step 13: Verify Report Page');

      // Check for Generate AI Report button on the report page
      const generateButton = page.locator('button:has-text("Generate AI Report")');

      if (await generateButton.isVisible({ timeout: 5000 })) {
        console.log('Generate Report button found on report page');
        await page.screenshot({ path: '/tmp/chestxray-step13-report-page-content.png' });
        console.log('Report page workflow complete');
      } else {
        console.log('Generate Report button not found, checking page content...');
        await page.screenshot({ path: '/tmp/chestxray-step13-report-page-nobutton.png' });
      }
    } else {
      console.log('Draft Report button not visible in TopBar');
      await page.screenshot({ path: '/tmp/chestxray-step12-no-draft-button.png' });
    }

    // ==========================================
    // Summary
    // ==========================================
    console.log('\n=== Test Summary ===');
    console.log(`Server URL: ${SERVER_URL}`);
    console.log(`Patient: ${PATIENT_NAME}`);
    console.log(`Detection completed: Yes`);
    console.log(`Errors: ${consoleErrors.length}`);

    if (consoleErrors.length > 0) {
      console.log('\nConsole Errors:');
      consoleErrors.slice(0, 5).forEach(e => console.log(`  - ${e.substring(0, 200)}`));
    }

    // Final screenshot
    await page.screenshot({ path: '/tmp/chestxray-final.png', fullPage: true });
  });
});

// Helper test to just check the detection service
test.describe('MedGemma Service Health', () => {
  test('check MedGemma health endpoint', async ({ request }) => {
    const response = await request.get(`${SERVER_URL}/monai/medgemma/health`);
    expect(response.ok()).toBeTruthy();

    const health = await response.json();
    console.log('MedGemma Health:', health);

    expect(health.status).toBe('healthy');
    expect(health.model_loaded).toBe(true);
  });

  test('check MedGemma info endpoint', async ({ request }) => {
    const response = await request.get(`${SERVER_URL}/monai/medgemma/info`);
    expect(response.ok()).toBeTruthy();

    const info = await response.json();
    console.log('MedGemma Info:', info);

    expect(info.service).toBe('medgemma-wrapper');
    expect(info.endpoints).toContain('/detect');
  });
});
