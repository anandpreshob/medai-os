import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { captureConsole, filesUnder, fixturePath, hasFixture, matrix, openLocalFiles, runCommand, viewport, waitForVolumes } from '../helpers';

/** Matrix rows: DICOM-SEG overlay, RTSTRUCT contours, PET/CT fusion. */

/** Count saturated (clearly coloured) pixels on a viewport canvas — grayscale images have none. */
async function colouredPixels(page: Page, slot: number): Promise<number> {
  return page.evaluate((s) => {
    const el = document.querySelector(`[data-testid="viewport-${s}"] canvas`) as HTMLCanvasElement | null;
    if (!el) return 0;
    const off = document.createElement('canvas');
    off.width = el.width;
    off.height = el.height;
    const ctx = off.getContext('2d')!;
    ctx.drawImage(el, 0, 0);
    const d = ctx.getImageData(0, 0, el.width, el.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const max = Math.max(d[i], d[i + 1], d[i + 2]);
      const min = Math.min(d[i], d[i + 1], d[i + 2]);
      if (max - min > 60) n++;
    }
    return n;
  }, slot);
}

const CT = 'synth/synth-ct-cube';
const expected = hasFixture(CT, 'expected.json') ? JSON.parse(readFileSync(fixturePath(CT, 'expected.json'), 'utf8')) : {};

test.describe('DICOM-SEG overlay', () => {
  test.skip(!hasFixture('synth/synth-seg') || !hasFixture(CT, 'dicom'), 'fixture missing');

  test('labelmap renders over the cuboid on the stack and in MPR, and can be hidden', async ({ page }) => {
    matrix('seg-display', 'seg-listed');
    const cap = captureConsole(page);
    await openLocalFiles(page, [...filesUnder(fixturePath(CT, 'dicom')), ...filesUnder(fixturePath('synth/synth-seg'))].filter((f) => /\.dcm$/i.test(f)));
    await expect(viewport(page)).toHaveAttribute('data-slice-count', String(expected.slice_count));
    const seg = page.locator('[data-testid="series-item"][data-derived="true"]').filter({ hasText: 'SEG' });
    const segId = (await seg.getAttribute('data-series-id'))!;
    const before = await colouredPixels(page, 0);
    expect(before).toBeLessThan(200);

    const result = (await runCommand(page, 'object.show', { seriesId: segId })) as { kind: string; segments: { label: string }[] };
    expect(result.kind).toBe('SEG');
    expect(result.segments.map((s) => s.label)).toContain('cuboid');
    await expect(seg).toHaveAttribute('data-object-shown', 'true');
    await expect.poll(() => colouredPixels(page, 0), { timeout: 20_000 }).toBeGreaterThan(2000);

    // Still there after switching to MPR (volume viewports get the same labelmap).
    await runCommand(page, 'layout.set', { layout: 'mpr' });
    await waitForVolumes(page);
    await expect.poll(() => colouredPixels(page, 0), { timeout: 30_000 }).toBeGreaterThan(500);
    await expect.poll(() => colouredPixels(page, 1), { timeout: 30_000 }).toBeGreaterThan(200);
    await page.screenshot({ path: 'test-results/seg-overlay-mpr.png' });

    await runCommand(page, 'object.hide', { seriesId: segId });
    await expect(seg).toHaveAttribute('data-object-shown', 'false');
    await expect.poll(() => colouredPixels(page, 0), { timeout: 20_000 }).toBeLessThan(200);
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});

test.describe('RTSTRUCT contours', () => {
  test.skip(!hasFixture('synth/synth-rtstruct') || !hasFixture(CT, 'dicom'), 'fixture missing');

  test('contours render on the referenced CT stack', async ({ page }) => {
    matrix('rtstruct-display', 'rtstruct-listed');
    const cap = captureConsole(page);
    await openLocalFiles(page, [...filesUnder(fixturePath(CT, 'dicom')), ...filesUnder(fixturePath('synth/synth-rtstruct'))].filter((f) => /\.dcm$/i.test(f)));
    await expect(viewport(page)).toHaveAttribute('data-slice-count', String(expected.slice_count));
    const rt = page.locator('[data-testid="series-item"][data-derived="true"]').filter({ hasText: 'RTSTRUCT' });
    const rtId = (await rt.getAttribute('data-series-id'))!;
    const result = (await runCommand(page, 'object.show', { seriesId: rtId })) as { kind: string; segments: { label: string }[] };
    expect(result.kind).toBe('RTSTRUCT');
    expect(result.segments.map((s) => s.label)).toContain('cuboid');
    // Contours are drawn into the annotation SVG layer: the middle slice carries one closed path.
    const contourPaths = () => page.evaluate(() => document.querySelectorAll('[data-testid="viewport-0"] svg path[stroke]').length);
    await expect.poll(contourPaths, { timeout: 20_000 }).toBeGreaterThan(0);
    const stroke = await page.evaluate(() => (document.querySelector('[data-testid="viewport-0"] svg path[stroke]') as SVGPathElement).getAttribute('stroke'));
    const [r, g, b] = (stroke ?? "").match(/\d+/g)?.map(Number) ?? [0, 0, 0];
    expect(r).toBeGreaterThan(g + 80); // reddish (Cornerstone tones down inactive-segment colours)
    expect(r).toBeGreaterThan(b + 80);
    // Slices outside the cuboid (first slice) carry none.
    await runCommand(page, 'viewer.jumpToSlice', { index: 0 });
    await expect(viewport(page)).toHaveAttribute('data-slice-index', '0');
    await expect.poll(contourPaths, { timeout: 20_000 }).toBe(0);
    await page.screenshot({ path: 'test-results/rtstruct-stack.png' });
    await runCommand(page, 'object.hide', { seriesId: rtId });
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});

test.describe('PET/CT fusion', () => {
  const PET = 'synth/synth-petct';
  test.skip(!hasFixture(PET, 'dicom'), 'fixture missing');

  test('PET fuses over the CT in MPR with a colour map and can be removed', async ({ page }) => {
    matrix('pet-ct-fusion', 'pet-suv');
    const cap = captureConsole(page);
    await openLocalFiles(page, filesUnder(fixturePath(PET, 'dicom')));
    await expect(page.getByTestId('series-item')).toHaveCount(2);
    const ct = page.locator('[data-testid="series-item"][data-modality="CT"]');
    const pt = page.locator('[data-testid="series-item"][data-modality="PT"]');
    const ctId = (await ct.getAttribute('data-series-id'))!;
    const ptId = (await pt.getAttribute('data-series-id'))!;
    await runCommand(page, 'viewer.showSeries', { seriesId: ctId, slot: 0 });

    // Fusion is refused on a stack viewport with a clear message.
    await expect(runCommand(page, 'viewer.fuse', { seriesId: ptId })).rejects.toThrow(/MPR/);

    await runCommand(page, 'layout.set', { layout: 'mpr' });
    await waitForVolumes(page);
    const before = await colouredPixels(page, 0);
    await runCommand(page, 'viewer.fuse', { seriesId: ptId });
    await waitForVolumes(page);
    for (const slot of [0, 1, 2]) {
      await expect(page.getByTestId(`viewport-${slot}`)).toHaveAttribute('data-fused', ptId);
    }
    await expect.poll(() => colouredPixels(page, 0), { timeout: 30_000 }).toBeGreaterThan(before + 300);
    await expect(page.locator('[data-testid="viewport-0"] [data-testid="overlay-top-right"]')).toContainText('+ PT');
    await page.screenshot({ path: 'test-results/petct-fusion.png' });

    await runCommand(page, 'viewer.unfuse');
    await expect(page.getByTestId('viewport-0')).toHaveAttribute('data-fused', '');
    await expect.poll(() => colouredPixels(page, 0), { timeout: 20_000 }).toBeLessThan(before + 50);
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});
