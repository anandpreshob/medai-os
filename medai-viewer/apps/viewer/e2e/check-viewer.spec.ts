import { test, expect } from '@playwright/test';

test('Check viewer loads correctly', async ({ page }) => {
  // Navigate to viewer
  await page.goto('http://localhost:3000');

  // Wait for network to settle
  await page.waitForLoadState('networkidle');

  // Additional wait for React rendering
  await page.waitForTimeout(2000);

  // Get page info
  const title = await page.title();
  console.log('Page title:', title);

  // Check body content
  const bodyText = await page.locator('body').innerText();
  console.log('Body text (first 500 chars):', bodyText.substring(0, 500));

  // Check root element
  const rootExists = await page.locator('#root').count();
  console.log('Root element exists:', rootExists > 0);

  if (rootExists > 0) {
    const rootContent = await page.locator('#root').innerHTML();
    console.log('Root HTML length:', rootContent.length);
    if (rootContent.length < 200) {
      console.log('Root HTML:', rootContent);
    }
  }

  // Check for any visible elements
  const visibleElements = await page.locator('body *:visible').count();
  console.log('Visible elements count:', visibleElements);

  // Take screenshot
  await page.screenshot({ path: '/tmp/viewer-state.png', fullPage: true });
  console.log('Screenshot saved to /tmp/viewer-state.png');

  // Check console for errors
  const consoleMessages: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleMessages.push(`ERROR: ${msg.text()}`);
    }
  });

  // Wait and collect errors
  await page.waitForTimeout(1000);
  if (consoleMessages.length > 0) {
    console.log('Console errors:', consoleMessages);
  }

  // Basic assertion - page should have loaded
  expect(title).toBeTruthy();
});
