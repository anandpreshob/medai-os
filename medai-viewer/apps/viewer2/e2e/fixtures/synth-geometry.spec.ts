import { expect, test } from '@playwright/test';
import { captureConsole, filesUnder, fixturePath, hasFixture, openLocalFiles, runCommand, viewport, matrix } from '../helpers';

/** Matrix rows: oblique acquisitions, anisotropic spacing, SEG/RTSTRUCT listed as derived objects. */

test.describe('synth-oblique (20° rotated CT)', () => {
  test.skip(!hasFixture('synth/synth-oblique/dicom'), 'fixture missing');

  test('sorts and labels correctly and builds an MPR volume', async ({ page }) => {
    matrix('geom-oblique', 'cap-orientation', 'cap-mpr');
    const cap = captureConsole(page);
    await openLocalFiles(page, filesUnder(fixturePath('synth/synth-oblique/dicom')));
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '32');
    await expect(page.getByTestId('series-item').first()).toHaveAttribute('data-volumetric', 'true');
    // Row cosine (0.94, 0.34, 0) is still dominantly +x → L on the right; column (−0.34, 0.94, 0) → P at the bottom.
    await expect(page.getByTestId('orient-right')).toHaveText('L');
    await expect(page.getByTestId('orient-bottom')).toHaveText('P');
    await runCommand(page, 'layout.set', { layout: 'mpr' });
    await expect(page.locator('[data-testid="viewport-2"] [data-testid="orient-top"]')).toHaveText('S', { timeout: 30_000 });
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});

test.describe('synth-anisotropic (0.5 × 0.5 × 3 mm)', () => {
  test.skip(!hasFixture('synth/synth-anisotropic/dicom'), 'fixture missing');

  test('reports spacing and thickness and reformats with the right geometry', async ({ page }) => {
    matrix('geom-anisotropic', 'cap-scalebar', 'cap-overlay-text', 'cap-mpr');
    const cap = captureConsole(page);
    await openLocalFiles(page, filesUnder(fixturePath('synth/synth-anisotropic/dicom')));
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '32');
    await expect(page.getByTestId('overlay-bottom-right')).toContainText('0.50 × 0.50 mm');
    await expect(page.getByTestId('overlay-bottom-right')).toContainText('T 3.0');
    // Scale bar reflects 0.5 mm pixels: a 64-px-wide image is 32 mm, so the bar must be ≤ 20 mm.
    const mm = Number(await page.getByTestId('scale-bar').getAttribute('data-mm'));
    expect(mm).toBeLessThanOrEqual(20);
    await runCommand(page, 'layout.set', { layout: 'mpr' });
    await expect(page.locator('[data-testid="viewport-1"] canvas')).toBeVisible({ timeout: 30_000 });
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});

test.describe('derived objects alongside images', () => {
  test.skip(!hasFixture('synth/synth-seg') || !hasFixture('synth/synth-rtstruct') || !hasFixture('synth/synth-ct-cube/dicom'), 'fixture missing');

  test('SEG and RTSTRUCT are listed as objects, the CT is displayed', async ({ page }) => {
    matrix('seg-listed', 'rtstruct-listed');
    const cap = captureConsole(page);
    const files = [...filesUnder(fixturePath('synth/synth-ct-cube/dicom')), ...filesUnder(fixturePath('synth/synth-seg')), ...filesUnder(fixturePath('synth/synth-rtstruct'))].filter((f) =>
      /\.dcm$/i.test(f),
    );
    await openLocalFiles(page, files);
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    const items = page.getByTestId('series-item');
    await expect(items).toHaveCount(3);
    await expect(items.filter({ has: page.locator('[data-derived="true"]') }).or(page.locator('[data-testid="series-item"][data-derived="true"]'))).toHaveCount(2);
    await expect(page.locator('[data-testid="series-item"][data-derived="true"]').filter({ hasText: 'SEG' })).toHaveCount(1);
    await expect(page.locator('[data-testid="series-item"][data-derived="true"]').filter({ hasText: 'RTSTRUCT' })).toHaveCount(1);
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '32');
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});
