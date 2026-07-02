import { test, expect } from '@playwright/test';

/**
 * Basic-tier smoke test: with no optional features enabled (VITE_FEATURES empty)
 * and no backend running, the viewer must boot cleanly and must NOT make any
 * network calls to feature-gated backend endpoints.
 *
 * Run with the dev server started in basic mode (VITE_FEATURES unset/empty),
 * which is the default in .env.example.
 */
test('basic viewer boots with no backend and no gated network calls', async ({ page }) => {
  const gatedCalls: string[] = [];
  // Backend API path prefixes that only feature-gated code should ever hit.
  // Matched against the URL *pathname* so Vite dev module loads like
  // /src/components/report/*.tsx or /@fs/.../monaiStore.ts are NOT flagged.
  const gatedPrefixes = [
    '/monai',
    '/api/monai',
    '/chat',
    '/medgemma',
    '/audit',
    '/triage',
    '/report/', // report API (POST /report/generate), not the /report SPA route
    '/batch',
  ];

  const isGated = (rawUrl: string): boolean => {
    let pathname: string;
    try {
      pathname = new URL(rawUrl).pathname;
    } catch {
      return false;
    }
    // ws:// batch socket also counts as a gated call
    if (rawUrl.startsWith('ws://') || rawUrl.startsWith('wss://')) return true;
    return gatedPrefixes.some((p) => pathname.startsWith(p));
  };

  page.on('request', (req) => {
    const url = req.url();
    if (isGated(url)) gatedCalls.push(`${req.method()} ${url}`);
  });

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // App shell rendered
  const root = page.locator('#root');
  await expect(root).toBeVisible();
  const html = await root.innerHTML();
  expect(html.length).toBeGreaterThan(200);

  // No feature-gated backend calls were attempted
  if (gatedCalls.length > 0) {
    console.log('Unexpected gated calls:', gatedCalls);
  }
  expect(gatedCalls, `basic viewer should not call gated endpoints`).toHaveLength(0);
});
