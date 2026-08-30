import { expect, test } from '@playwright/test';
import { captureConsole, filesUnder, fixturePath, hasFixture, openLocalFiles, runCommand, viewport, waitForVolumes } from '../helpers';

/** Real acquisitions: Slicer MR head (DICOM + NRRD), Slicer CT chest (NRRD), Orthanc demo CT+RT and PET/CT. */

test.describe('Slicer sample data', () => {
  test('MRHead DICOM series (130 slices, sagittal)', async ({ page }) => {
    const dir = 'slicer/deidentifiedMRHead-dcm-one-series';
    test.skip(!hasFixture(dir), 'fixture missing');
    const cap = captureConsole(page);
    await openLocalFiles(page, filesUnder(fixturePath(dir)));
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '130', { timeout: 60_000 });
    await expect(page.getByTestId('series-item').first()).toHaveAttribute('data-modality', 'MR');
    await expect(page.getByTestId('series-item').first()).toHaveAttribute('data-volumetric', 'true');
    // Sagittal acquisition: superior is up, and left/right edges are anterior/posterior.
    await expect(page.getByTestId('orient-top')).toHaveText('S');
    await expect(page.getByTestId('orient-right')).toHaveText(/^[AP]$/);
    await runCommand(page, 'viewer.applyPreset', { presetId: 'mr-tight' });
    await runCommand(page, 'layout.set', { layout: 'mpr+3d' });
    await expect(page.locator('[data-testid="viewport-3"] canvas')).toBeVisible({ timeout: 60_000 });
    await waitForVolumes(page);
    await page.screenshot({ path: 'test-results/mrhead-mpr3d.png' });
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });

  for (const f of ['MR-head.nrrd', 'CT-chest.nrrd']) {
    test(`${f} loads as a volume`, async ({ page }) => {
      test.skip(!hasFixture('slicer', f), 'fixture missing');
      const cap = captureConsole(page);
      await openLocalFiles(page, [fixturePath('slicer', f)]);
      await expect(page.getByTestId('viewer-error')).toBeHidden();
      const count = Number(await viewport(page).getAttribute('data-slice-count'));
      expect(count).toBeGreaterThan(50);
      await expect(viewport(page).locator('canvas')).toBeVisible();
      expect(cap.errors, cap.errors.join('\n')).toEqual([]);
    });
  }

  test('DTI-Brain.nrrd (9-component) is refused with a clear message', async ({ page }) => {
    test.skip(!hasFixture('slicer', 'DTI-Brain.nrrd'), 'fixture missing');
    await openLocalFiles(page, [fixturePath('slicer', 'DTI-Brain.nrrd')]);
    await expect(page.getByTestId('viewer-error')).toContainText(/component/i);
  });
});

test.describe('Orthanc demo studies', () => {
  test('HN_P001: CT + RTSTRUCT + RTDOSE', async ({ page }) => {
    const dir = 'orthanc-demo/HN_P001';
    test.skip(!hasFixture(dir), 'fixture missing');
    test.setTimeout(240_000);
    const cap = captureConsole(page);
    await openLocalFiles(page, filesUnder(fixturePath(dir)));
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    const items = page.getByTestId('series-item');
    await expect(items).toHaveCount(3, { timeout: 120_000 });
    await expect(page.locator('[data-testid="series-item"][data-modality="CT"]')).toHaveAttribute('data-volumetric', 'true');
    await expect(page.locator('[data-testid="series-item"][data-derived="true"]')).toHaveCount(2);
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '198', { timeout: 120_000 });
    await expect(page.getByTestId('orient-right')).toHaveText('L');
    await runCommand(page, 'viewer.applyPreset', { presetId: 'ct-bone' });
    await expect(viewport(page)).toHaveAttribute('data-window-width', '1800');
    await runCommand(page, 'layout.set', { layout: 'mpr' });
    await expect(page.locator('[data-testid="viewport-2"] [data-testid="orient-top"]')).toHaveText('S', { timeout: 120_000 });
    await waitForVolumes(page);
    await page.screenshot({ path: 'test-results/hn-p001-mpr.png' });
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });

  test('COMUNIX: PET and CT side by side', async ({ page }) => {
    const dir = 'orthanc-demo/COMUNIX';
    test.skip(!hasFixture(dir), 'fixture missing');
    test.setTimeout(240_000);
    const cap = captureConsole(page);
    await openLocalFiles(page, filesUnder(fixturePath(dir)));
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(page.getByTestId('series-item')).toHaveCount(2, { timeout: 120_000 });
    const pt = page.locator('[data-testid="series-item"][data-modality="PT"]');
    await expect(pt).toHaveAttribute('data-volumetric', 'true');
    const ptId = await pt.getAttribute('data-series-id');
    await runCommand(page, 'layout.set', { layout: '1x2' });
    await runCommand(page, 'viewer.showSeries', { seriesId: ptId, slot: 1 });
    await expect(page.getByTestId('viewport-1')).toHaveAttribute('data-slice-count', '83', { timeout: 120_000 });
    await expect(page.getByTestId('viewport-1')).toHaveAttribute('data-active', 'true');
    // This PET has PatientWeight=0, so no SUV scaling is possible: SUV presets must be refused, relative ones work.
    await expect(page.locator('[data-testid="viewport-1"] [data-testid="overlay-bottom-left"]')).toContainText('no SUV scaling');
    await expect(runCommand(page, 'viewer.applyPreset', { presetId: 'pt-suv-0-10' })).rejects.toThrow(/not SUV-scaled/);
    await runCommand(page, 'viewer.applyPreset', { presetId: 'pt-hot' });
    const w = Number(await page.getByTestId('viewport-1').getAttribute('data-window-width'));
    expect(w).toBeGreaterThan(10);
    await page.screenshot({ path: 'test-results/comunix-petct.png' });
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});
