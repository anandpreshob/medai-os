import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { captureConsole, filesUnder, fixturePath, hasFixture, openLocalFiles, runCommand, sliceInfo, viewport, waitForVolumes, windowLevel, matrix } from '../helpers';

/**
 * Matrix rows: "CT (uncompressed, single-frame series)", "DICOM folder", "Window/level from DICOM VOI",
 * "Orientation markers from direction cosines", "MPR". Fixture: synth-ct-cube (known geometry).
 */
const FIX = 'synth/synth-ct-cube';
test.skip(!hasFixture(FIX, 'expected.json'), `fixture ${FIX} not present — run scripts/sample-data/synth.py`);

const expected = hasFixture(FIX, 'expected.json') ? JSON.parse(readFileSync(fixturePath(FIX, 'expected.json'), 'utf8')) : {};

test.describe('synth-ct-cube (local DICOM series)', () => {
  test('loads the series, applies header VOI, labels orientation, scrolls and reaches MPR', async ({ page }) => {
    matrix('fmt-dicom-folder', 'ct-uncompressed', 'cap-stack', 'cap-voi-header', 'cap-orientation', 'cap-scalebar', 'cap-overlay-text', 'cap-mpr', 'cap-commands');
    const cap = captureConsole(page);
    await openLocalFiles(page, filesUnder(fixturePath(FIX, 'dicom')));

    await expect(page.getByTestId('viewer-error')).toBeHidden();
    const series = page.getByTestId('series-item');
    await expect(series).toHaveCount(1);
    await expect(series.first()).toHaveAttribute('data-modality', 'CT');
    await expect(series.first()).toHaveAttribute('data-volumetric', 'true');

    // Slice count and default position (middle slice).
    await expect(viewport(page)).toHaveAttribute('data-slice-count', String(expected.slice_count));
    const s0 = await sliceInfo(page);
    expect(s0.index).toBe(Math.floor(expected.slice_count / 2));

    // Header VOI, not a heuristic.
    const wl = await windowLevel(page);
    expect(wl.width).toBe(expected.window_width);
    expect(wl.center).toBe(expected.window_center);

    // Overlays: patient, spacing, orientation from cosines (identity IOP → L on the right, P at the bottom).
    await expect(page.getByTestId('overlay-top-left')).toContainText(expected.patient.id);
    await expect(page.getByTestId('overlay-bottom-right')).toContainText('1.00 × 1.00 mm');
    await expect(page.getByTestId('orient-right')).toHaveText('L');
    await expect(page.getByTestId('orient-left')).toHaveText('R');
    await expect(page.getByTestId('orient-bottom')).toHaveText('P');
    await expect(page.getByTestId('orient-top')).toHaveText('A');

    // Commands drive the viewer like the agent will.
    await runCommand(page, 'viewer.jumpToSlice', { index: 0 });
    await expect(viewport(page)).toHaveAttribute('data-slice-index', '0');
    await runCommand(page, 'viewer.scroll', { delta: 5 });
    await expect(viewport(page)).toHaveAttribute('data-slice-index', '5');
    await runCommand(page, 'viewer.applyPreset', { presetId: 'ct-lung' });
    await expect(viewport(page)).toHaveAttribute('data-window-width', '1500');
    await expect(viewport(page)).toHaveAttribute('data-window-center', '-600');
    await runCommand(page, 'viewer.resetView');
    await expect(viewport(page)).toHaveAttribute('data-window-width', String(expected.window_width));

    // MPR: three volume viewports with sensible orientation labels.
    await runCommand(page, 'layout.set', { layout: 'mpr' });
    await expect(page.getByTestId('viewport-grid')).toHaveAttribute('data-layout', 'mpr');
    await expect(page.getByTestId('viewport-2')).toBeVisible();
    await expect(page.getByTestId('viewport-2').locator('canvas')).toBeVisible();
    await expect(page.locator('[data-testid="viewport-1"] [data-testid="orient-top"]')).toHaveText('S', { timeout: 30_000 });
    await expect(page.locator('[data-testid="viewport-2"] [data-testid="orient-top"]')).toHaveText('S');
    await expect(page.locator('[data-testid="viewport-2"] [data-testid="orient-right"]')).toHaveText('L');

    await waitForVolumes(page);
    await page.screenshot({ path: 'test-results/synth-ct-cube-mpr.png' });
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });

  test('MetaImage header + raw pair and 3D TIFF load with the same slice count', async ({ page }) => {
    matrix('fmt-mhd-raw', 'fmt-tiff');
    const cases: { name: string; files: string[] }[] = [
      { name: 'mhd+raw', files: ['synth-ct-cube.mhd', 'synth-ct-cube.raw'] },
      { name: 'tif', files: ['synth-ct-cube.tif'] },
    ];
    for (const c of cases) {
      if (!c.files.every((f) => hasFixture(FIX, f))) continue;
      const cap = captureConsole(page);
      await openLocalFiles(page, c.files.map((f) => fixturePath(FIX, f)));
      await expect(page.getByTestId('viewer-error')).toBeHidden();
      await expect(viewport(page)).toHaveAttribute('data-slice-count', String(expected.slice_count), { timeout: 30_000 });
      expect(cap.errors, `${c.name}: ${cap.errors.join('\n')}`).toEqual([]);
    }
  });

  test('NIfTI, NRRD and MetaImage copies load with the same geometry', async ({ page }) => {
    matrix('fmt-nifti', 'fmt-nrrd', 'fmt-mha');
    for (const file of ['synth-ct-cube.nii.gz', 'synth-ct-cube.nrrd', 'synth-ct-cube.mha']) {
      if (!hasFixture(FIX, file)) continue;
      const cap = captureConsole(page);
      await openLocalFiles(page, [fixturePath(FIX, file)]);
      await expect(page.getByTestId('viewer-error')).toBeHidden();
      await expect(viewport(page)).toHaveAttribute('data-slice-count', String(expected.slice_count), { timeout: 30_000 });
      expect(cap.errors, `${file}: ${cap.errors.join('\n')}`).toEqual([]);
    }
  });
});
