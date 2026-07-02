import { test, expect } from '@playwright/test';

test.describe('MONAI Label Connection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('[data-testid="right-panel"]', { timeout: 10000 });
  });

  test('should show disconnected status initially', async ({ page }) => {
    // Check that the connection status shows disconnected
    const statusIndicator = page.locator('[data-testid="connection-status"]');
    await expect(statusIndicator).toBeVisible();
    await expect(statusIndicator).toContainText(/disconnected/i);
  });

  test('should have server URL input field', async ({ page }) => {
    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    await expect(serverUrlInput).toBeVisible();
  });

  test('should have connect button', async ({ page }) => {
    const connectButton = page.locator('[data-testid="connect-button"]');
    await expect(connectButton).toBeVisible();
  });

  test('should update URL when typing in input', async ({ page }) => {
    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    await serverUrlInput.fill('http://test-server:8002');
    await expect(serverUrlInput).toHaveValue('http://test-server:8002');
  });

  test('should show connecting status when connect is clicked', async ({ page }) => {
    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    const connectButton = page.locator('[data-testid="connect-button"]');

    await serverUrlInput.fill('http://localhost:8002');
    await connectButton.click();

    // Should briefly show connecting status
    const statusIndicator = page.locator('[data-testid="connection-status"]');
    // Note: This may quickly change to error or connected
    await expect(statusIndicator).toBeVisible();
  });

  test('should show error status on invalid server', async ({ page }) => {
    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    const connectButton = page.locator('[data-testid="connect-button"]');

    await serverUrlInput.fill('http://invalid-server-that-does-not-exist:9999');
    await connectButton.click();

    // Wait for connection attempt to fail
    const statusIndicator = page.locator('[data-testid="connection-status"]');
    await expect(statusIndicator).toContainText(/error|disconnected/i, { timeout: 15000 });
  });

  test('should have model selector (disabled when disconnected)', async ({ page }) => {
    const modelSelect = page.locator('[data-testid="model-select"]');
    await expect(modelSelect).toBeVisible();
    await expect(modelSelect).toBeDisabled();
  });

  test('should have tabs for different segmentation modes', async ({ page }) => {
    // Check for Auto-Segmentation tab
    const autoSegTab = page.locator('[data-testid="tab-auto-segmentation"]');
    await expect(autoSegTab).toBeVisible();

    // Check for SmartEdit tab
    const smartEditTab = page.locator('[data-testid="tab-smart-edit"]');
    await expect(smartEditTab).toBeVisible();
  });
});

test.describe('MONAI Label Connection - Live Server', () => {
  // These tests require the actual MONAI Label server to be running
  test.skip(({ }, testInfo) => !process.env.MONAI_SERVER_URL, 'Skipped: MONAI_SERVER_URL not set');

  const serverUrl = process.env.MONAI_SERVER_URL || 'http://localhost:8002';

  test('should connect to live MONAI Label server', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="right-panel"]');

    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    const connectButton = page.locator('[data-testid="connect-button"]');

    await serverUrlInput.fill(serverUrl);
    await connectButton.click();

    // Wait for connection
    const statusIndicator = page.locator('[data-testid="connection-status"]');
    await expect(statusIndicator).toContainText(/connected/i, { timeout: 30000 });
  });

  test('should populate model selector on successful connection', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="right-panel"]');

    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    const connectButton = page.locator('[data-testid="connect-button"]');

    await serverUrlInput.fill(serverUrl);
    await connectButton.click();

    // Wait for connection
    await page.locator('[data-testid="connection-status"]').filter({ hasText: /connected/i }).waitFor({ timeout: 30000 });

    // Model selector should be enabled
    const modelSelect = page.locator('[data-testid="model-select"]');
    await expect(modelSelect).toBeEnabled();
  });

  test('should allow disconnect after connecting', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="right-panel"]');

    const serverUrlInput = page.locator('[data-testid="server-url-input"]');
    const connectButton = page.locator('[data-testid="connect-button"]');

    await serverUrlInput.fill(serverUrl);
    await connectButton.click();

    // Wait for connection
    await page.locator('[data-testid="connection-status"]').filter({ hasText: /connected/i }).waitFor({ timeout: 30000 });

    // Disconnect button should be visible (same button toggles)
    const disconnectButton = page.locator('[data-testid="disconnect-button"], [data-testid="connect-button"]');
    await disconnectButton.click();

    // Should show disconnected
    const statusIndicator = page.locator('[data-testid="connection-status"]');
    await expect(statusIndicator).toContainText(/disconnected/i, { timeout: 5000 });
  });
});
