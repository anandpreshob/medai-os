import { test, expect } from '@playwright/test';

test('Check for JavaScript errors', async ({ page }) => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Capture ALL console messages before navigating
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      errors.push(text);
    } else if (type === 'warning') {
      warnings.push(text);
    }
  });

  // Capture page errors
  page.on('pageerror', err => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });

  // Navigate
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('domcontentloaded');

  // Wait for potential errors
  await page.waitForTimeout(5000);

  // Log all errors found
  console.log('=== ERRORS FOUND ===');
  for (const err of errors) {
    console.log('ERROR:', err);
  }

  console.log('\n=== WARNINGS FOUND ===');
  for (const warn of warnings.slice(0, 10)) {
    console.log('WARNING:', warn);
  }

  // Check the page source for any inline errors
  const pageContent = await page.content();
  if (pageContent.includes('Error') || pageContent.includes('error')) {
    console.log('\nPage may contain error text');
  }

  // Get network failures
  const failedRequests: string[] = [];
  page.on('requestfailed', req => {
    failedRequests.push(`${req.url()} - ${req.failure()?.errorText}`);
  });

  await page.waitForTimeout(1000);
  if (failedRequests.length > 0) {
    console.log('\n=== FAILED REQUESTS ===');
    for (const req of failedRequests) {
      console.log('FAILED:', req);
    }
  }

  // Print number of errors
  console.log(`\nTotal errors: ${errors.length}`);
  console.log(`Total warnings: ${warnings.length}`);
});
