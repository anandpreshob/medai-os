import { expect, test } from '@playwright/test';
import { canvasPixel, captureConsole, fixturePath, hasFixture, openLocalFiles, runCommand, viewport, windowLevel } from '../helpers';

/** Matrix rows: MONOCHROME1 (MG-style), multi-frame cine (XA), RGB secondary capture. */

test.describe('synth-mono1 (MONOCHROME1 DX)', () => {
  test.skip(!hasFixture('synth/synth-mono1/synth-mono1.dcm'), 'fixture missing');

  test('high values render dark on a light background; invert flips it', async ({ page }) => {
    const cap = captureConsole(page);
    await openLocalFiles(page, [fixturePath('synth/synth-mono1/synth-mono1.dcm')]);
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '1');
    const wl = await windowLevel(page);
    expect(wl).toEqual({ width: 3700, center: 1850 });
    await expect(page.getByTestId('series-item').first()).toHaveAttribute('data-modality', 'DX');

    // Square (value 3500) in the middle must be DARK; background (200) near the top edge must be LIGHT.
    await expect.poll(async () => (await canvasPixel(page, 0, 0.5, 0.5))[0], { timeout: 15_000 }).toBeLessThan(60);
    expect((await canvasPixel(page, 0, 0.5, 0.1))[0]).toBeGreaterThan(190);

    await runCommand(page, 'viewer.invert');
    await expect.poll(async () => (await canvasPixel(page, 0, 0.5, 0.5))[0]).toBeGreaterThan(190);
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});

test.describe('synth-multiframe (30-frame XA)', () => {
  test.skip(!hasFixture('synth/synth-multiframe/synth-multiframe.dcm'), 'fixture missing');

  test('expands frames, starts at frame 1, and cine advances', async ({ page }) => {
    const cap = captureConsole(page);
    await openLocalFiles(page, [fixturePath('synth/synth-multiframe/synth-multiframe.dcm')]);
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '30');
    await expect(viewport(page)).toHaveAttribute('data-slice-index', '0');
    await expect(page.getByTestId('series-item').first()).toHaveAttribute('data-modality', 'XA');
    await expect(page.getByTestId('series-item').first()).toContainText('30 fr');

    await runCommand(page, 'viewer.jumpToSlice', { index: 12 });
    await expect(viewport(page)).toHaveAttribute('data-slice-index', '12');

    await runCommand(page, 'viewer.cine', { playing: true, fps: 30 });
    await page.waitForTimeout(700);
    await runCommand(page, 'viewer.cine', { playing: false });
    const idx = Number(await viewport(page).getAttribute('data-slice-index'));
    expect(idx).not.toBe(12);
    await page.waitForTimeout(600); // let queued renders drain
    const after = Number(await viewport(page).getAttribute('data-slice-index'));
    await page.waitForTimeout(500);
    expect(Number(await viewport(page).getAttribute('data-slice-index'))).toBe(after); // stopped

    // Frames differ: the moving disc shifts the bright pixel.
    await runCommand(page, 'viewer.jumpToSlice', { index: 0 });
    await expect(viewport(page)).toHaveAttribute('data-slice-index', '0');
    const f0 = await canvasPixel(page, 0, 0.5 + 0.06 * (188 - 128) / 128, 0.5);
    await runCommand(page, 'viewer.jumpToSlice', { index: 15 });
    await expect(viewport(page)).toHaveAttribute('data-slice-index', '15');
    const f15 = await canvasPixel(page, 0, 0.5 + 0.06 * (188 - 128) / 128, 0.5);
    expect(f0).not.toEqual(f15);
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});

test.describe('synth-rgb (RGB secondary capture)', () => {
  test.skip(!hasFixture('synth/synth-rgb/synth-rgb.dcm'), 'fixture missing');

  test('renders true colour quadrants', async ({ page }) => {
    const cap = captureConsole(page);
    await openLocalFiles(page, [fixturePath('synth/synth-rgb/synth-rgb.dcm')]);
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '1');
    // The 256² image is letterboxed and centred; sample well inside each quadrant.
    const near = (p: [number, number, number], rgb: [number, number, number]) => p.every((v, i) => Math.abs(v - rgb[i]) < 70);
    await expect.poll(async () => near(await canvasPixel(page, 0, 0.42, 0.3), [255, 0, 0]), { timeout: 15_000 }).toBe(true);
    expect(near(await canvasPixel(page, 0, 0.58, 0.3), [0, 255, 0])).toBe(true);
    expect(near(await canvasPixel(page, 0, 0.42, 0.7), [0, 0, 255])).toBe(true);
    expect(near(await canvasPixel(page, 0, 0.58, 0.7), [255, 255, 0])).toBe(true);
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});
