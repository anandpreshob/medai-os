import { expect, test } from '@playwright/test';

/** App shell: routes render, no console errors, PACS-offline state is honest. */
test.describe('app shell', () => {
  test('studies page renders and reports PACS state without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto('/');
    await expect(page.getByText('medai-os')).toBeVisible();
    // Either the PACS answered (a count is shown) or we show the offline card — never a blank table.
    await expect(page.getByTestId('study-count').or(page.getByTestId('pacs-offline'))).toBeVisible();
    // Network failures to a dead PACS are expected and surface as a card, not as uncaught errors.
    const unexpected = errors.filter((e) => !/Failed to load resource|net::ERR|dicomweb/i.test(e));
    expect(unexpected).toEqual([]);
  });

  test('local files and upload routes render', async ({ page }) => {
    await page.goto('/local');
    await expect(page.getByTestId('local-dropzone')).toBeVisible();
    await page.goto('/upload');
    await expect(page.getByTestId('upload-dropzone')).toBeVisible();
    await page.goto('/nope');
    await expect(page).toHaveURL(/\/$/);
  });
});
