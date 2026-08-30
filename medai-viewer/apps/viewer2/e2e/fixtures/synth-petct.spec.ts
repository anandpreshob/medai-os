import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { canvasPixel, captureConsole, filesUnder, fixturePath, hasFixture, matrix, openLocalFiles, runCommand, viewport, waitForVolumes } from '../helpers';

/** Matrix rows: PET with SUV(bw) pre-scaling, JPEG-baseline DX. */
const PET = 'synth/synth-petct';
const DX = 'synth/synth-dx-jpeg';

test.describe('synth-petct (SUV-scaled PET + CT)', () => {
  test.skip(!hasFixture(PET, 'expected.json'), 'fixture missing');
  const expected = hasFixture(PET, 'expected.json') ? JSON.parse(readFileSync(fixturePath(PET, 'expected.json'), 'utf8')) : {};

  test('PET is pre-scaled to SUVbw: hot sphere ≈ 8, background ≈ 1, SUV presets available', async ({ page }) => {
    matrix('pet-suv', 'cap-voi-header');
    const cap = captureConsole(page);
    await openLocalFiles(page, filesUnder(fixturePath(PET, 'dicom')));
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(page.getByTestId('series-item')).toHaveCount(2);
    const pt = page.locator('[data-testid="series-item"][data-modality="PT"]');
    const ptId = (await pt.getAttribute('data-series-id'))!;
    await runCommand(page, 'viewer.showSeries', { seriesId: ptId, slot: 0 });
    await expect(viewport(page)).toHaveAttribute('data-slice-count', String(expected.pt.slice_count));
    await expect(page.locator('[data-testid="viewport-0"] [data-testid="overlay-bottom-left"]')).toContainText('SUV (bw)');

    // Absolute SUV presets apply because the loader pre-scaled the pixels.
    await runCommand(page, 'viewer.applyPreset', { presetId: 'pt-suv-0-10' });
    await expect(viewport(page)).toHaveAttribute('data-window-width', '10');
    await expect(viewport(page)).toHaveAttribute('data-window-center', '5');

    // Sample the volume in SUV units at the known sphere centre and in background.
    await runCommand(page, 'layout.set', { layout: 'mpr' });
    await waitForVolumes(page);
    const [cx, cy, cz] = expected.suv_bw.hot_sphere_centre_lps_mm ?? expected.hot_sphere?.centre_lps_mm ?? [20, -12, 0];
    const hot = (await runCommand(page, 'viewer.sampleValue', { x: cx, y: cy, z: cz })) as { value: number; suvScaled: boolean };
    expect(hot.suvScaled).toBe(true);
    expect(hot.value).toBeGreaterThan(7.2);
    expect(hot.value).toBeLessThan(8.8);
    const bg = (await runCommand(page, 'viewer.sampleValue', { x: -20, y: 10, z: 0 })) as { value: number };
    expect(bg.value).toBeGreaterThan(0.8);
    expect(bg.value).toBeLessThan(1.2);
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});

test.describe('synth-dx-jpeg (JPEG baseline DX)', () => {
  test.skip(!hasFixture(DX, 'synth-dx-jpeg.dcm'), 'fixture missing');

  test('decodes the JPEG frame: lungs dark, mediastinum bright', async ({ page }) => {
    matrix('crdx-compressed', 'crdx', 'compressed-ts');
    const cap = captureConsole(page);
    await openLocalFiles(page, [fixturePath(DX, 'synth-dx-jpeg.dcm')]);
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '1');
    await expect(page.getByTestId('series-item').first()).toHaveAttribute('data-modality', 'DX');
    // 512² image centred in the viewport: mediastinum is at the image centre, lung ROI ~ 1/3 across.
    await expect.poll(async () => (await canvasPixel(page, 0, 0.5, 0.46))[0], { timeout: 15_000 }).toBeGreaterThan(150);
    const lung = (await canvasPixel(page, 0, 0.5 - 0.09, 0.46))[0];
    expect(lung).toBeLessThan(110);
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});
